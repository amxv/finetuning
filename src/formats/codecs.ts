import { datasetSchemaVersion, type CanonicalMessageV1, type DatasetExampleV1 } from "../core/canonical.js";
import type { JsonObject, ToolSchema } from "../core/model.js";
import type { OpenAIChatFineTuningRow } from "../core/openai.js";
import type { CodecId, ConversionLoss, DatasetCodec } from "./contracts.js";

type HFConversation = { messages: Array<{ role: string; content: string }>; [key: string]: unknown };
type HFText = { text: string; [key: string]: unknown };

function base(messages: CanonicalMessageV1[], source: string): DatasetExampleV1 {
  const payload = JSON.stringify(messages);
  return {
    datasetSchemaVersion,
    id: `example-${hashString(payload)}`,
    messages,
    provenance: { source },
    createdAt: "1970-01-01T00:00:00.000Z",
  };
}
function text(message: CanonicalMessageV1): string | undefined {
  return message.content.length === 1 && message.content[0]?.type === "text" ? message.content[0].text : undefined;
}
function loss(code: string, path: string, message: string, severity: "warning" | "error" = "warning"): ConversionLoss {
  return { code, path, message, severity };
}
function hashString(value: string): string {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export const canonicalMessagesCodec: DatasetCodec<DatasetExampleV1> = {
  id: "canonical-messages-jsonl",
  detect: (v) => (isRecord(v) && v.datasetSchemaVersion === datasetSchemaVersion ? 1 : 0),
  decode: (value) => ({ value, losses: [], supported: true }),
  encode: (value) => ({ value, losses: [], supported: true }),
};

export const openAIChatCodec: DatasetCodec<OpenAIChatFineTuningRow> = {
  id: "openai-chat-jsonl",
  detect: (v) => (isRecord(v) && Array.isArray(v.messages) ? 0.8 : 0),
  decode(row) {
    const losses: ConversionLoss[] = [];
    const messages: CanonicalMessageV1[] = row.messages.map((message) => {
      const content = typeof message.content === "string" ? [{ type: "text" as const, text: message.content }] : [];
      if (message.role === "assistant" && message.tool_calls)
        return {
          role: "assistant",
          content,
          toolCalls: message.tool_calls.map((call) => ({
            id: call.id,
            name: call.function.name,
            arguments: JSON.parse(call.function.arguments) as JsonObject,
          })),
        };
      if (message.role === "tool")
        return { role: "tool", content, toolCallId: message.tool_call_id, name: message.name };
      return { role: message.role, content };
    });
    return {
      value: {
        ...base(messages, "openai-chat-jsonl"),
        ...(row.tools
          ? {
              tools: row.tools.map((tool) => ({
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters as unknown as ToolSchema["parameters"],
              })),
            }
          : {}),
        ...(row.metadata ? { metadata: row.metadata } : {}),
      },
      losses,
      supported: true,
    };
  },
  encode(example) {
    const losses: ConversionLoss[] = [];
    const messages = example.messages.map((message, index) => {
      const content = text(message);
      if (content === undefined && message.content.length)
        losses.push(
          loss(
            "CONTENT_PARTS_UNSUPPORTED",
            `messages[${index}].content`,
            "OpenAI compatibility rows only support one text part.",
            "error",
          ),
        );
      if (message.role === "assistant")
        return {
          role: "assistant" as const,
          content: content ?? null,
          ...(message.toolCalls
            ? {
                tool_calls: message.toolCalls.map((call) => ({
                  id: call.id,
                  type: "function" as const,
                  function: { name: call.name, arguments: JSON.stringify(call.arguments) },
                })),
              }
            : {}),
        };
      if (message.role === "tool")
        return {
          role: "tool" as const,
          content: content ?? "",
          tool_call_id: message.toolCallId ?? "",
          name: message.name ?? "tool",
        };
      return { role: message.role, content: content ?? "" };
    });
    const value: OpenAIChatFineTuningRow = {
      messages,
      ...(example.tools
        ? {
            tools: example.tools.map((tool) => ({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters as unknown as JsonObject,
              },
            })),
          }
        : {}),
      ...(example.metadata ? { metadata: example.metadata } : {}),
    };
    return { value, losses, supported: !losses.some((item) => item.severity === "error") };
  },
};

export const hfConversationalCodec: DatasetCodec<HFConversation> = {
  id: "hf-conversational",
  detect: (v) => (isRecord(v) && Array.isArray(v.messages) ? 0.7 : 0),
  decode: (value) => ({
    value: base(
      value.messages.map((message) => ({
        role: message.role as CanonicalMessageV1["role"],
        content: [{ type: "text", text: message.content }],
      })),
      "hf-conversational",
    ),
    losses: [],
    supported: true,
  }),
  encode(example) {
    const losses: ConversionLoss[] = [];
    const messages = example.messages.map((message, index) => {
      const content = text(message);
      if (message.toolCalls?.length || message.toolCallId)
        losses.push(
          loss(
            "HF_TOOL_SEMANTICS_UNSUPPORTED",
            `messages[${index}]`,
            "HF conversational output cannot represent typed tool linkage.",
            "error",
          ),
        );
      return { role: message.role, content: content ?? "" };
    });
    if (example.tools?.length)
      losses.push(
        loss(
          "HF_TOOL_DEFINITIONS_UNSUPPORTED",
          "tools",
          "HF conversational output cannot represent tool definitions.",
          "error",
        ),
      );
    return { value: { messages }, losses, supported: !losses.some((item) => item.severity === "error") };
  },
};

export const hfTextCodec: DatasetCodec<HFText> = {
  id: "hf-text",
  detect: (v) => (isRecord(v) && typeof v.text === "string" ? 1 : 0),
  decode: () => ({
    losses: [
      loss("HF_TEXT_REVERSE_UNSUPPORTED", "text", "Rendered text cannot be reverse parsed losslessly.", "error"),
    ],
    supported: false,
  }),
  encode(example) {
    return {
      value: { text: example.messages.map((message) => `${message.role}: ${text(message) ?? ""}`).join("\n") },
      losses: [
        loss("HF_TEXT_RENDERED_LOSSY", "messages", "Typed message boundaries are flattened into rendered text."),
      ],
      supported: true,
    };
  },
};

export const codecRegistry = new Map<CodecId, DatasetCodec<unknown>>(
  [canonicalMessagesCodec, openAIChatCodec, hfConversationalCodec, hfTextCodec].map((codec) => [
    codec.id,
    codec as DatasetCodec<unknown>,
  ]),
);
export function detectCodec(value: unknown): CodecId | undefined {
  return [...codecRegistry.values()]
    .map((codec) => [codec.id, codec.detect(value)] as const)
    .sort((a, b) => b[1] - a[1])[0]?.[1]
    ? [...codecRegistry.values()].sort((a, b) => b.detect(value) - a.detect(value))[0]?.id
    : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
