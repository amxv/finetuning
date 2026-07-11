import Anthropic from "@anthropic-ai/sdk";
import type {
  AnthropicProviderAdapter,
  ModelClient,
  ModelInvocationRequest,
  ModelInvocationResponse,
  ProviderClientOptions,
} from "./index.js";
import { ProviderAuthenticationError, ProviderError, ProviderRateLimitError, ProviderResponseError } from "./errors.js";
import { mapAnthropicMessagesResponse, mapModelRequestToAnthropicMessagesRequest } from "./mappers/anthropic.js";

export const anthropicProviderAdapter: AnthropicProviderAdapter = {
  kind: "anthropic",
  createClient(options: ProviderClientOptions): ModelClient {
    return new AnthropicModelClient(options);
  },
};

class AnthropicModelClient implements ModelClient {
  readonly #client: Anthropic;
  readonly #options: ProviderClientOptions;

  constructor(options: ProviderClientOptions) {
    this.#options = options;
    this.#client = new Anthropic({
      apiKey: options.apiKey,
      ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
      ...(options.headers ? { defaultHeaders: options.headers } : {}),
    });
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
      const response = await this.#client.messages.create(sdkRequest);
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
