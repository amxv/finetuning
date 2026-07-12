import type { JsonObject, ToolCall, ToolSchema } from "../core/index.js";
import { anthropicProviderAdapter } from "./anthropic.js";
import { resolveProviderClientOptions, type ProviderEnvironment, type ProviderRuntimeConfig } from "./config.js";
import { ProviderUnsupportedFeatureError } from "./errors.js";
import { openAIProviderAdapter } from "./openai.js";

export type ModelProviderKind = "openai" | "anthropic" | "custom";

export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  name?: string;
}

export interface ModelInvocationRequest {
  provider: ModelProviderKind;
  model: string;
  messages: ModelMessage[];
  tools?: ToolSchema[];
  temperature?: number;
  metadata?: JsonObject;
  signal?: AbortSignal;
  timeoutMs?: number;
  idempotencyKey?: string;
}

export type ModelInvocationResponse =
  | {
      kind: "text";
      content: string;
      metadata?: JsonObject;
    }
  | {
      kind: "tool_calls";
      toolCalls: ToolCall[];
      content?: string;
      metadata?: JsonObject;
    };

export interface ModelClient {
  invoke(request: ModelInvocationRequest): Promise<ModelInvocationResponse>;
}

export interface ProviderAdapter {
  kind: ModelProviderKind;
  createClient(options: ProviderClientOptions): ModelClient;
}

export interface ProviderClientOptions {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxOutputTokens?: number;
  headers?: Record<string, string>;
  metadata?: JsonObject;
}

export interface OpenAIProviderAdapter extends ProviderAdapter {
  kind: "openai";
}

export interface AnthropicProviderAdapter extends ProviderAdapter {
  kind: "anthropic";
}

export interface CustomProviderAdapter extends ProviderAdapter {
  kind: "custom";
}

export function createUnconfiguredProviderAdapter(kind: ModelProviderKind): ProviderAdapter {
  return {
    kind,
    createClient() {
      return {
        async invoke(): Promise<ModelInvocationResponse> {
          throw new Error(`${kind} provider adapter is not configured in this phase`);
        },
      };
    },
  };
}

export function createProviderAdapter(kind: ModelProviderKind): ProviderAdapter {
  switch (kind) {
    case "openai":
      return openAIProviderAdapter;
    case "anthropic":
      return anthropicProviderAdapter;
    case "custom":
      throw new ProviderUnsupportedFeatureError("custom provider adapters must be supplied by the caller", {
        provider: kind,
      });
  }
}

export function createModelClientFromConfig(config: ProviderRuntimeConfig, env?: ProviderEnvironment): ModelClient {
  const adapter = createProviderAdapter(config.provider);
  return adapter.createClient(resolveProviderClientOptions(config, env));
}

export { anthropicProviderAdapter } from "./anthropic.js";
export { openAIProviderAdapter } from "./openai.js";
export type { ProviderEnvironment, ProviderRuntimeConfig } from "./config.js";
export {
  assertSupportedModelProviderKind,
  defaultApiKeyEnvForProvider,
  resolveProviderClientOptions,
} from "./config.js";
export {
  ProviderAuthenticationError,
  ProviderConfigurationError,
  ProviderError,
  ProviderRateLimitError,
  ProviderResponseError,
  ProviderToolCallError,
  ProviderUnsupportedFeatureError,
} from "./errors.js";
export type { ProviderErrorOptions } from "./errors.js";
export {
  mapAnthropicMessagesResponse,
  mapModelRequestToAnthropicMessagesRequest,
  mapModelRequestToOpenAIResponsesRequest,
  mapOpenAIResponsesResponse,
} from "./mappers.js";
export type { AnthropicMessageRequest, OpenAIResponseRequest } from "./mappers.js";
export type {
  BudgetLimits,
  CostCatalog,
  NormalizedFinishReason,
  NormalizedUsage,
  ProviderCapabilities,
  RetryRecord,
  StructuredOutputRequest,
  TeacherCandidate,
  TeacherEnvelope,
  TeacherRequest,
  TeacherTransport,
} from "./contracts.js";
export { ReliableTeacherProvider, type ReliableProviderOptions } from "./reliable.js";
export { inspectProvider, listProviders, providerCapabilities } from "./registry.js";
