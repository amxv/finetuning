import type Anthropic from "@anthropic-ai/sdk";
import type {
  ResponseCreateParamsNonStreaming,
  ResponseInputItem,
  Tool as OpenAIResponseTool,
} from "openai/resources/responses/responses.js";
import type { JsonObject, JsonValue, ToolCall, ToolSchema } from "../core/index.js";
import type { ModelInvocationRequest, ModelInvocationResponse, ModelMessage, ModelProviderKind } from "./index.js";
import { ProviderResponseError, ProviderToolCallError, ProviderUnsupportedFeatureError } from "./errors.js";

export type OpenAIResponseRequest = ResponseCreateParamsNonStreaming;

export type AnthropicMessageRequest = Anthropic.MessageCreateParamsNonStreaming;

export function mapModelRequestToOpenAIResponsesRequest(
  request: ModelInvocationRequest,
  maxOutputTokens?: number,
): OpenAIResponseRequest {
  const mapped: OpenAIResponseRequest = {
    model: request.model,
    input: request.messages.flatMap(mapMessageToOpenAIInputItems),
  };

  if (request.tools?.length) {
    mapped.tools = request.tools.map(mapToolToOpenAIResponseTool);
  }

  if (request.temperature !== undefined) {
    mapped.temperature = request.temperature;
  }

  if (maxOutputTokens !== undefined) {
    mapped.max_output_tokens = maxOutputTokens;
  }

  return mapped;
}

export function mapOpenAIResponsesResponse(
  response: unknown,
  context: { provider: "openai"; model: string },
): ModelInvocationResponse {
  const record = asRecord(response, "OpenAI response", context.provider, context.model);
  const output = Array.isArray(record.output) ? record.output : [];
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const item of output) {
    if (!isRecord(item)) {
      continue;
    }

    if (item.type === "function_call") {
      const id = typeof item.call_id === "string" ? item.call_id : typeof item.id === "string" ? item.id : "";
      const name = typeof item.name === "string" ? item.name : "";
      const argumentsText = typeof item.arguments === "string" ? item.arguments : "";

      if (!id || !name) {
        throw new ProviderResponseError("OpenAI function call response is missing id or name", {
          provider: context.provider,
          model: context.model,
          details: { itemType: String(item.type) },
        });
      }

      toolCalls.push({
        id,
        name,
        arguments: parseToolArguments(argumentsText, context),
      });
      continue;
    }

    collectOpenAIText(item, textParts);
  }

  if (toolCalls.length > 0) {
    return {
      kind: "tool_calls",
      toolCalls,
      ...(textParts.length > 0 ? { content: textParts.join("") } : {}),
      metadata: buildOpenAIMetadata(record),
    };
  }

  const outputText = typeof record.output_text === "string" ? record.output_text : textParts.join("");
  if (!outputText) {
    throw new ProviderResponseError("OpenAI response did not include text or tool calls", {
      provider: context.provider,
      model: context.model,
      details: buildOpenAIMetadata(record),
    });
  }

  return {
    kind: "text",
    content: outputText,
    metadata: buildOpenAIMetadata(record),
  };
}

export function mapModelRequestToAnthropicMessagesRequest(
  request: ModelInvocationRequest,
  maxOutputTokens?: number,
): AnthropicMessageRequest {
  const systemMessages = request.messages.filter((message) => message.role === "system");
  const conversationMessages = request.messages.filter((message) => message.role !== "system");
  const mapped: AnthropicMessageRequest = {
    model: request.model,
    max_tokens: maxOutputTokens ?? 1024,
    messages: mapMessagesToAnthropicMessages(conversationMessages),
  };

  if (systemMessages.length > 0) {
    mapped.system = systemMessages.map((message) => message.content).join("\n\n");
  }

  if (request.tools?.length) {
    mapped.tools = request.tools.map(mapToolToAnthropicTool);
  }

  if (request.temperature !== undefined) {
    mapped.temperature = request.temperature;
  }

  return mapped;
}

export function mapAnthropicMessagesResponse(
  response: unknown,
  context: { provider: "anthropic"; model: string },
): ModelInvocationResponse {
  const record = asRecord(response, "Anthropic message response", context.provider, context.model);
  const content = Array.isArray(record.content) ? record.content : [];
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const block of content) {
    if (!isRecord(block)) {
      continue;
    }

    if (block.type === "text" && typeof block.text === "string") {
      textParts.push(block.text);
      continue;
    }

    if (block.type === "tool_use") {
      const id = typeof block.id === "string" ? block.id : "";
      const name = typeof block.name === "string" ? block.name : "";
      if (!id || !name) {
        throw new ProviderResponseError("Anthropic tool_use block is missing id or name", {
          provider: context.provider,
          model: context.model,
        });
      }

      if (!isJsonObject(block.input)) {
        throw new ProviderToolCallError("Anthropic tool_use input must be a JSON object", {
          provider: context.provider,
          model: context.model,
          details: { toolCallId: id, toolName: name },
        });
      }

      toolCalls.push({
        id,
        name,
        arguments: block.input,
      });
    }
  }

  if (toolCalls.length > 0) {
    return {
      kind: "tool_calls",
      toolCalls,
      ...(textParts.length > 0 ? { content: textParts.join("") } : {}),
      metadata: buildAnthropicMetadata(record),
    };
  }

  const text = textParts.join("");
  if (!text) {
    throw new ProviderResponseError("Anthropic response did not include text or tool calls", {
      provider: context.provider,
      model: context.model,
      details: buildAnthropicMetadata(record),
    });
  }

  return {
    kind: "text",
    content: text,
    metadata: buildAnthropicMetadata(record),
  };
}

function mapMessageToOpenAIInputItems(message: ModelMessage): ResponseInputItem[] {
  if (message.role === "tool") {
    if (!message.toolCallId) {
      throw new ProviderUnsupportedFeatureError("OpenAI tool result messages require toolCallId", {
        provider: "openai",
        details: { role: message.role },
      });
    }

    return [
      {
        type: "function_call_output",
        call_id: message.toolCallId,
        output: message.content,
      },
    ];
  }

  if (message.role === "assistant" && message.toolCalls?.length) {
    const inputItems: ResponseInputItem[] = [];
    if (message.content) {
      inputItems.push({
        role: message.role,
        content: message.content,
      });
    }

    inputItems.push(
      ...message.toolCalls.map((toolCall) => ({
        type: "function_call" as const,
        call_id: toolCall.id,
        name: toolCall.name,
        arguments: JSON.stringify(toolCall.arguments),
      })),
    );

    return inputItems;
  }

  return [
    {
      role: message.role,
      content: message.content,
    },
  ];
}

function mapToolToOpenAIResponseTool(tool: ToolSchema): OpenAIResponseTool {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as unknown as { [key: string]: unknown },
    strict: false,
  };
}

function mapMessagesToAnthropicMessages(messages: ModelMessage[]): Anthropic.MessageParam[] {
  const mapped: Anthropic.MessageParam[] = [];

  for (let index = 0; index < messages.length; ) {
    const message = messages[index]!;
    if (message.role !== "tool") {
      mapped.push(mapMessageToAnthropicMessage(message));
      index += 1;
      continue;
    }

    const toolResultBlocks: Anthropic.ContentBlockParam[] = [];
    while (index < messages.length) {
      const toolMessage = messages[index]!;
      if (toolMessage.role !== "tool") {
        break;
      }

      toolResultBlocks.push(mapToolResultToAnthropicBlock(toolMessage));
      index += 1;
    }

    if (toolResultBlocks.length > 1) {
      while (index < messages.length) {
        const userMessage = messages[index]!;
        if (userMessage.role !== "user") {
          break;
        }

        toolResultBlocks.push({ type: "text", text: userMessage.content });
        index += 1;
      }
    }

    mapped.push({
      role: "user",
      content: toolResultBlocks,
    });
  }

  return mapped;
}

function mapMessageToAnthropicMessage(message: ModelMessage): Anthropic.MessageParam {
  if (message.role === "tool") {
    return {
      role: "user",
      content: [mapToolResultToAnthropicBlock(message)],
    };
  }

  if (message.role === "system") {
    throw new ProviderUnsupportedFeatureError("Anthropic system messages must be mapped to the system parameter", {
      provider: "anthropic",
    });
  }

  if (message.role === "assistant" && message.toolCalls?.length) {
    const content: Anthropic.ContentBlockParam[] = [];
    if (message.content) {
      content.push({ type: "text", text: message.content });
    }

    content.push(
      ...message.toolCalls.map((toolCall) => ({
        type: "tool_use" as const,
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.arguments,
      })),
    );

    return {
      role: "assistant",
      content,
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

function mapToolResultToAnthropicBlock(message: ModelMessage): Anthropic.ContentBlockParam {
  if (!message.toolCallId) {
    throw new ProviderUnsupportedFeatureError("Anthropic tool result messages require toolCallId", {
      provider: "anthropic",
      details: { role: message.role },
    });
  }

  return {
    type: "tool_result",
    tool_use_id: message.toolCallId,
    content: message.content,
  };
}

function mapToolToAnthropicTool(tool: ToolSchema): Anthropic.ToolUnion {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as unknown as Anthropic.Tool.InputSchema,
  };
}

function collectOpenAIText(item: Record<string, unknown>, textParts: string[]): void {
  if (item.type !== "message" || !Array.isArray(item.content)) {
    return;
  }

  for (const contentBlock of item.content) {
    if (!isRecord(contentBlock)) {
      continue;
    }

    if (
      (contentBlock.type === "output_text" || contentBlock.type === "text") &&
      typeof contentBlock.text === "string"
    ) {
      textParts.push(contentBlock.text);
    }
  }
}

function parseToolArguments(
  value: string,
  context: { provider: ModelProviderKind; model: string },
): JsonObject {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (isJsonObject(parsed)) {
      return parsed;
    }
  } catch (error) {
    throw new ProviderToolCallError(`${context.provider} tool call arguments were not valid JSON`, {
      provider: context.provider,
      model: context.model,
      cause: error,
    });
  }

  throw new ProviderToolCallError(`${context.provider} tool call arguments must be a JSON object`, {
    provider: context.provider,
    model: context.model,
  });
}

function buildOpenAIMetadata(response: Record<string, unknown>): JsonObject {
  return stripUndefined({
    provider: "openai",
    responseId: stringValue(response.id),
    model: stringValue(response.model),
    status: stringValue(response.status),
    usage: jsonValue(response.usage),
  });
}

function buildAnthropicMetadata(response: Record<string, unknown>): JsonObject {
  return stripUndefined({
    provider: "anthropic",
    responseId: stringValue(response.id),
    requestId: stringValue(response._request_id),
    model: stringValue(response.model),
    stopReason: stringValue(response.stop_reason),
    usage: jsonValue(response.usage),
  });
}

function asRecord(
  value: unknown,
  label: string,
  provider: ModelProviderKind,
  model: string,
): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  throw new ProviderResponseError(`${label} must be an object`, { provider, model });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isJsonObject(value);
}

function jsonValue(value: unknown): JsonValue | undefined {
  return isJsonValue(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stripUndefined(value: Record<string, JsonValue | undefined>): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined)) as JsonObject;
}
