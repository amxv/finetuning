import type {
  AssistantToolCallMessage,
  ConversationMessage,
  ConversationTrajectory,
  ExportMode,
  JsonObject,
  ToolSchema,
} from "./model.js";

export interface OpenAIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonObject;
  };
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type OpenAIChatFineTuningMessage =
  | {
      role: "system" | "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    }
  | {
      role: "tool";
      tool_call_id: string;
      name: string;
      content: string;
    };

export interface OpenAIChatFineTuningRow {
  messages: OpenAIChatFineTuningMessage[];
  tools?: OpenAIToolDefinition[];
  metadata?: JsonObject;
}

export interface BuildOpenAIRowOptions {
  mode: ExportMode;
  includeTools?: "auto" | "always" | "never";
}

export function buildOpenAIFineTuningRow(
  trajectory: ConversationTrajectory,
  options: BuildOpenAIRowOptions,
): OpenAIChatFineTuningRow {
  const selectedMessages = selectMessagesForMode(trajectory.messages, options.mode);
  const messages = selectedMessages.map(toOpenAIMessage);
  const includeTools = shouldIncludeTools(trajectory, selectedMessages, options.includeTools ?? "auto");

  return {
    messages,
    ...(includeTools ? { tools: (trajectory.tools ?? []).map(toOpenAITool) } : {}),
    ...(trajectory.metadata ? { metadata: trajectory.metadata } : {}),
  };
}

export function buildOpenAIFineTuningRows(
  trajectories: ConversationTrajectory[],
  options: BuildOpenAIRowOptions,
): OpenAIChatFineTuningRow[] {
  return trajectories.map((trajectory) => buildOpenAIFineTuningRow(trajectory, options));
}

function selectMessagesForMode(
  messages: ConversationMessage[],
  mode: ExportMode,
): ConversationMessage[] {
  if (mode === "plain_chat") {
    return messages.filter(
      (message) =>
        message.kind === "system" || message.kind === "user" || message.kind === "assistant_text",
    );
  }

  if (mode === "tool_decision") {
    const toolCallIndex = messages.findIndex((message) => message.kind === "assistant_tool_call");
    return toolCallIndex === -1 ? messages : messages.slice(0, toolCallIndex + 1);
  }

  return messages;
}

function toOpenAIMessage(message: ConversationMessage): OpenAIChatFineTuningMessage {
  switch (message.kind) {
    case "system":
      return { role: "system", content: message.content };
    case "user":
      return { role: "user", content: message.content };
    case "assistant_text":
      return { role: "assistant", content: message.content };
    case "assistant_tool_call":
      return {
        role: "assistant",
        content: message.content ?? null,
        tool_calls: message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments: stableStringify(toolCall.arguments),
          },
        })),
      };
    case "tool_result":
      return {
        role: "tool",
        tool_call_id: message.result.toolCallId,
        name: message.result.name,
        content: stringifyToolResult(message.result.result),
      };
  }
}

function toOpenAITool(tool: ToolSchema): OpenAIToolDefinition {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as unknown as JsonObject,
    },
  };
}

function shouldIncludeTools(
  trajectory: ConversationTrajectory,
  messages: ConversationMessage[],
  includeTools: NonNullable<BuildOpenAIRowOptions["includeTools"]>,
): boolean {
  if (includeTools === "always") {
    return Boolean(trajectory.tools?.length);
  }

  if (includeTools === "never") {
    return false;
  }

  return Boolean(trajectory.tools?.length) && messages.some(isAssistantToolCall);
}

function isAssistantToolCall(message: ConversationMessage): message is AssistantToolCallMessage {
  return message.kind === "assistant_tool_call";
}

function stringifyToolResult(result: unknown): string {
  return typeof result === "string" ? result : stableStringify(result);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)]),
    );
  }

  return value;
}
