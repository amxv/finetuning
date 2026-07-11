import type OpenAI from "openai";
import type {
  ModelClient,
  ModelInvocationRequest,
  ModelInvocationResponse,
  OpenAIProviderAdapter,
  ProviderClientOptions,
} from "./index.js";
import { ProviderAuthenticationError, ProviderConfigurationError, ProviderError, ProviderRateLimitError, ProviderResponseError } from "./errors.js";
import { mapModelRequestToOpenAIResponsesRequest, mapOpenAIResponsesResponse } from "./mappers/openai.js";

export const openAIProviderAdapter: OpenAIProviderAdapter = {
  kind: "openai",
  createClient(options: ProviderClientOptions): ModelClient {
    return new OpenAIModelClient(options);
  },
};

class OpenAIModelClient implements ModelClient {
  #client?: OpenAI;
  readonly #options: ProviderClientOptions;

  constructor(options: ProviderClientOptions) {
    this.#options = options;
  }

  async #getClient(): Promise<OpenAI> {
    if (this.#client) return this.#client;
    let Constructor: typeof OpenAI;
    try {
      Constructor = (await import("openai")).default;
    } catch (error) {
      throw new ProviderConfigurationError(
        'OpenAI support requires the optional peer "openai". Install it with: npm install openai',
        { provider: "openai", cause: error },
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
    const sdkRequest = mapModelRequestToOpenAIResponsesRequest(
      {
        ...request,
        provider: "openai",
        model,
        ...(temperature !== undefined ? { temperature } : {}),
      },
      this.#options.maxOutputTokens,
    );

    try {
      const response = await (await this.#getClient()).responses.create(sdkRequest);
      return mapOpenAIResponsesResponse(response, { provider: "openai", model });
    } catch (error) {
      throw normalizeOpenAIError(error, model);
    }
  }
}

function normalizeOpenAIError(error: unknown, model: string): Error {
  if (isProviderError(error)) {
    return error;
  }

  const status = statusCode(error);
  const message = error instanceof Error ? error.message : String(error);
  const details = status !== undefined ? { status } : undefined;

  if (status === 401 || status === 403) {
    return new ProviderAuthenticationError(`OpenAI authentication failed: ${message}`, {
      provider: "openai",
      model,
      cause: error,
      ...(details ? { details } : {}),
    });
  }

  if (status === 429) {
    return new ProviderRateLimitError(`OpenAI rate limit exceeded: ${message}`, {
      provider: "openai",
      model,
      cause: error,
      ...(details ? { details } : {}),
    });
  }

  return new ProviderResponseError(`OpenAI request failed: ${message}`, {
    provider: "openai",
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
