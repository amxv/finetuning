import type { JsonObject, JsonSchemaObject } from "../core/model.js";
import type { ModelInvocationRequest, ModelInvocationResponse, ModelProviderKind } from "./index.js";

export interface ProviderCapabilities {
  tools: boolean;
  structuredOutput: "native" | "repair" | "unsupported";
  abort: boolean;
  idempotency: boolean;
  usage: boolean;
}
export interface StructuredOutputRequest {
  schema: JsonSchemaObject;
  repairAttempts?: number;
}
export interface TeacherRequest extends ModelInvocationRequest {
  requestId: string;
  sampleId: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  structuredOutput?: StructuredOutputRequest;
  nativeOptions?: Partial<Record<ModelProviderKind, JsonObject>>;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
}
export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;
  currency?: string;
}
export type NormalizedFinishReason =
  "stop" | "length" | "tool_calls" | "refusal" | "content_policy" | "schema_failure" | "unknown";
export interface TeacherCandidate {
  response: ModelInvocationResponse;
  finishReason: NormalizedFinishReason;
  parsed?: JsonObject;
}
export interface RetryRecord {
  attempt: number;
  classification: string;
  delayMs: number;
}
export interface TeacherEnvelope {
  requestId: string;
  sampleId: string;
  provider: ModelProviderKind;
  model: string;
  modelSnapshot?: string;
  providerRequestId?: string;
  apiVersion?: string;
  candidates: TeacherCandidate[];
  usage: NormalizedUsage;
  retries: RetryRecord[];
  nativeRequestRef?: string;
  nativeResponseRef?: string;
  cached: boolean;
}
export interface TeacherTransport {
  invoke(
    request: TeacherRequest,
  ): Promise<{
    response: ModelInvocationResponse;
    usage?: Partial<NormalizedUsage>;
    finishReason?: NormalizedFinishReason;
    providerRequestId?: string;
    modelSnapshot?: string;
    apiVersion?: string;
    retryAfterMs?: number;
    nativeRequest?: JsonObject;
    nativeResponse?: JsonObject;
  }>;
}
export interface CostCatalog {
  price(
    provider: ModelProviderKind,
    model: string,
    snapshot?: string,
  ): { inputPerMillion: number; outputPerMillion: number; currency: string } | undefined;
}
export interface BudgetLimits {
  global?: number;
  stage?: number;
  provider?: number;
  currency?: string;
}
