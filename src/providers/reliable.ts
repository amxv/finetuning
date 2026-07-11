import { canonicalSha256 } from "../core/canonical.js";
import type { JsonObject } from "../core/model.js";
import type { ContentAddressedBlobStore } from "../node/storage.js";
import { redactSecrets } from "../node/redaction.js";
import { ProviderRateLimitError, ProviderResponseError, ProviderUnsupportedFeatureError } from "./errors.js";
import type {
  BudgetLimits,
  CostCatalog,
  NormalizedUsage,
  RetryRecord,
  TeacherEnvelope,
  TeacherRequest,
  TeacherTransport,
} from "./contracts.js";
import { inspectProvider } from "./registry.js";

export interface ReliableProviderOptions {
  transport: TeacherTransport;
  catalog?: CostCatalog;
  budgets?: BudgetLimits;
  blobStore?: ContentAddressedBlobStore;
  maxRetries?: number;
  concurrency?: number;
  requestsPerInterval?: number;
  tokensPerInterval?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  jitter?: () => number;
}
export class ReliableTeacherProvider {
  #active = 0;
  #queue: Array<() => void> = [];
  #windowStart = 0;
  #requests = 0;
  #tokens = 0;
  #spent = 0;
  #successes = new Map<string, TeacherEnvelope>();
  constructor(readonly options: ReliableProviderOptions) {}
  async generate(request: TeacherRequest): Promise<TeacherEnvelope> {
    const identity = canonicalSha256({
      provider: request.provider,
      model: request.model,
      requestId: request.requestId,
      sampleId: request.sampleId,
    });
    const cached = this.#successes.get(identity);
    if (cached) return { ...cached, cached: true };
    const capabilities = inspectProvider(request.provider);
    if (request.structuredOutput && capabilities.structuredOutput === "unsupported")
      throw new ProviderUnsupportedFeatureError("Structured output is unsupported", {
        provider: request.provider,
        model: request.model,
      });
    const estimate = this.cost(request, {
      inputTokens: request.estimatedInputTokens ?? 0,
      outputTokens: request.estimatedOutputTokens ?? 0,
      totalTokens: (request.estimatedInputTokens ?? 0) + (request.estimatedOutputTokens ?? 0),
    });
    this.assertBudget(estimate, "estimated");
    await this.acquire();
    try {
      await this.rateLimit(request.estimatedInputTokens ?? 0);
      const retries: RetryRecord[] = [];
      let last: unknown;
      for (let attempt = 0; attempt <= (this.options.maxRetries ?? 2); attempt++) {
        try {
          const result = await this.withTimeout(request);
          if (
            result.finishReason === "refusal" ||
            result.finishReason === "content_policy" ||
            result.finishReason === "schema_failure"
          )
            throw new TerminalProviderOutcome(result.finishReason);
          let parsed: JsonObject | undefined;
          if (request.structuredOutput && result.response.kind === "text") {
            try {
              parsed = JSON.parse(result.response.content) as JsonObject;
            } catch {
              throw new TerminalProviderOutcome("schema_failure");
            }
          }
          const usage: NormalizedUsage = {
            inputTokens: result.usage?.inputTokens ?? 0,
            outputTokens: result.usage?.outputTokens ?? 0,
            totalTokens:
              result.usage?.totalTokens ?? (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
          };
          const actual = this.cost(request, usage, result.modelSnapshot);
          usage.cost = actual;
          usage.currency = this.options.budgets?.currency ?? "USD";
          this.#spent += actual;
          this.assertBudget(0, "actual");
          const nativeRequestRef = await this.retain(result.nativeRequest);
          const nativeResponseRef = await this.retain(result.nativeResponse);
          const envelope: TeacherEnvelope = {
            requestId: request.requestId,
            sampleId: request.sampleId,
            provider: request.provider,
            model: request.model,
            ...(result.modelSnapshot ? { modelSnapshot: result.modelSnapshot } : {}),
            ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {}),
            ...(result.apiVersion ? { apiVersion: result.apiVersion } : {}),
            candidates: [
              {
                response: result.response,
                finishReason: result.finishReason ?? (result.response.kind === "tool_calls" ? "tool_calls" : "stop"),
                ...(parsed ? { parsed } : {}),
              },
            ],
            usage,
            retries,
            ...(nativeRequestRef ? { nativeRequestRef } : {}),
            ...(nativeResponseRef ? { nativeResponseRef } : {}),
            cached: false,
          };
          this.#successes.set(identity, envelope);
          return envelope;
        } catch (error) {
          if (error instanceof TerminalProviderOutcome || request.signal?.aborted) throw error;
          last = error;
          if (!retryable(error) || attempt >= (this.options.maxRetries ?? 2)) throw error;
          const delayMs = retryDelay(error, attempt, this.options.jitter?.() ?? 0);
          retries.push({ attempt: attempt + 1, classification: classify(error), delayMs });
          await (this.options.sleep ?? defaultSleep)(delayMs);
        }
      }
      throw last;
    } finally {
      this.release();
    }
  }
  private async withTimeout(request: TeacherRequest) {
    if (request.signal?.aborted) throw request.signal.reason ?? new Error("Aborted");
    if (!request.timeoutMs) return this.options.transport.invoke(request);
    return Promise.race([
      this.options.transport.invoke(request),
      new Promise<never>((_, reject) => setTimeout(() => reject(new ProviderTimeoutError()), request.timeoutMs)),
    ]);
  }
  private cost(request: TeacherRequest, usage: NormalizedUsage, snapshot?: string): number {
    if (!this.options.budgets) return 0;
    const price = this.options.catalog?.price(request.provider, request.model, snapshot);
    if (!price)
      throw new Error(`Unknown price for ${request.provider}/${request.model}${snapshot ? `@${snapshot}` : ""}`);
    return (usage.inputTokens / 1e6) * price.inputPerMillion + (usage.outputTokens / 1e6) * price.outputPerMillion;
  }
  private assertBudget(next: number, phase: string) {
    for (const limit of [this.options.budgets?.global, this.options.budgets?.stage, this.options.budgets?.provider])
      if (limit !== undefined && this.#spent + next > limit) throw new Error(`Budget exceeded (${phase})`);
  }
  private async acquire() {
    const limit = this.options.concurrency ?? Infinity;
    if (this.#active >= limit) await new Promise<void>((resolve) => this.#queue.push(resolve));
    this.#active += 1;
  }
  private release() {
    this.#active -= 1;
    this.#queue.shift()?.();
  }
  private async rateLimit(tokens: number) {
    const now = (this.options.now ?? Date.now)(),
      interval = this.options.intervalMs ?? 60000;
    if (now - this.#windowStart >= interval) {
      this.#windowStart = now;
      this.#requests = 0;
      this.#tokens = 0;
    }
    if (
      this.#requests >= (this.options.requestsPerInterval ?? Infinity) ||
      this.#tokens + tokens > (this.options.tokensPerInterval ?? Infinity)
    ) {
      await (this.options.sleep ?? defaultSleep)(interval - (now - this.#windowStart));
      this.#windowStart = (this.options.now ?? Date.now)();
      this.#requests = 0;
      this.#tokens = 0;
    }
    this.#requests += 1;
    this.#tokens += tokens;
  }
  private async retain(value?: JsonObject) {
    return value && this.options.blobStore ? this.options.blobStore.put(redactSecrets(value)) : undefined;
  }
}
class TerminalProviderOutcome extends Error {
  constructor(readonly outcome: string) {
    super(`Terminal provider outcome: ${outcome}`);
  }
}
class ProviderTimeoutError extends Error {}
function classify(error: unknown) {
  if (error instanceof ProviderRateLimitError) return "rate_limit";
  if (error instanceof ProviderTimeoutError) return "timeout";
  if (error instanceof ProviderResponseError && Number(error.details?.status) >= 500) return "server";
  return "transport";
}
function retryable(error: unknown) {
  return (
    error instanceof ProviderRateLimitError ||
    error instanceof ProviderTimeoutError ||
    (error instanceof ProviderResponseError && Number(error.details?.status) >= 500) ||
    error instanceof TypeError
  );
}
function retryDelay(error: unknown, attempt: number, jitter: number) {
  const hint =
    error instanceof ProviderRateLimitError && typeof error.details?.retryAfterMs === "number"
      ? error.details.retryAfterMs
      : 0;
  return Math.max(hint, Math.round(100 * 2 ** attempt * (1 + jitter)));
}
function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
