import type Anthropic from "@anthropic-ai/sdk";
import type {
  AnthropicProviderAdapter,
  ModelClient,
  ModelInvocationRequest,
  ModelInvocationResponse,
  ProviderClientOptions,
} from "./index.js";
import { ProviderAuthenticationError, ProviderConfigurationError, ProviderError, ProviderRateLimitError, ProviderResponseError } from "./errors.js";
import { mapAnthropicMessagesResponse, mapModelRequestToAnthropicMessagesRequest } from "./mappers/anthropic.js";

export const anthropicProviderAdapter: AnthropicProviderAdapter = {
  kind: "anthropic",
  createClient(options: ProviderClientOptions): ModelClient {
    return new AnthropicModelClient(options);
  },
};

class AnthropicModelClient implements ModelClient {
  #client?: Anthropic;
  readonly #options: ProviderClientOptions;

  constructor(options: ProviderClientOptions) {
    this.#options = options;
  }

  async #getClient(): Promise<Anthropic> {
    if (this.#client) return this.#client;
    let Constructor: typeof Anthropic;
    try {
      Constructor = (await import("@anthropic-ai/sdk")).default;
    } catch (error) {
      throw new ProviderConfigurationError(
        'Anthropic support requires the optional peer "@anthropic-ai/sdk". Install it with: npm install @anthropic-ai/sdk',
        { provider: "anthropic", cause: error },
      );
    }
    this.#client = new Constructor({
      apiKey: this.#options.apiKey,
      ...(this.#options.baseUrl ? { baseURL: this.#options.baseUrl } : {}),
      ...(this.#options.headers ? { defaultHeaders: this.#options.headers } : {}),
    });
    return this.#client;
  }

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResponse> {
    const model = request.model || this.#options.model;
    const temperature = request.temperature ?? this.#options.temperature;
    const sdkRequest = mapModelRequestToAnthropicMessagesRequest(
      {
        ...request,
        provider: "anthropic",
        model,
        ...(temperature !== undefined ? { temperature } : {}),
      },
      this.#options.maxOutputTokens,
    );

    try {
      const response = await (await this.#getClient()).messages.create(sdkRequest);
      return mapAnthropicMessagesResponse(response, { provider: "anthropic", model });
    } catch (error) {
      throw normalizeAnthropicError(error, model);
    }
  }
}

function normalizeAnthropicError(error: unknown, model: string): Error {
  if (isProviderError(error)) {
    return error;
  }

  const status = statusCode(error);
  const message = error instanceof Error ? error.message : String(error);
  const details = status !== undefined ? { status } : undefined;

  if (status === 401 || status === 403) {
    return new ProviderAuthenticationError(`Anthropic authentication failed: ${message}`, {
      provider: "anthropic",
      model,
      cause: error,
      ...(details ? { details } : {}),
    });
  }

  if (status === 429) {
    return new ProviderRateLimitError(`Anthropic rate limit exceeded: ${message}`, {
      provider: "anthropic",
      model,
      cause: error,
      ...(details ? { details } : {}),
    });
  }

  return new ProviderResponseError(`Anthropic request failed: ${message}`, {
    provider: "anthropic",
    model,
    cause: error,
    ...(details ? { details } : {}),
  });
}

function statusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const value = "status" in error ? error.status : "statusCode" in error ? error.statusCode : undefined;
  return typeof value === "number" ? value : undefined;
}

function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}
