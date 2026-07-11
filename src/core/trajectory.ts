import { datasetSchemaVersion, withContentHash, type CanonicalMessageV1, type DatasetExampleV1 } from "./canonical.js";
import type { ConversationTrajectory } from "./model.js";

export function trajectoryToDatasetExample(trajectory: ConversationTrajectory): DatasetExampleV1 {
  const messages: CanonicalMessageV1[] = trajectory.messages.map((message) => {
    switch (message.kind) {
      case "system":
        return { role: "system", content: [{ type: "text", text: message.content }] };
      case "user":
        return { role: "user", content: [{ type: "text", text: message.content }] };
      case "assistant_text":
        return { role: "assistant", content: [{ type: "text", text: message.content }] };
      case "assistant_tool_call":
        return {
          role: "assistant",
          content: message.content ? [{ type: "text", text: message.content }] : [],
          toolCalls: message.toolCalls,
        };
      case "tool_result":
        return {
          role: "tool",
          content: [{ type: "json", value: message.result.result }],
          toolCallId: message.result.toolCallId,
          name: message.result.name,
        };
    }
  });
  return withContentHash({
    datasetSchemaVersion,
    id: trajectory.id,
    messages,
    ...(trajectory.tools?.length ? { tools: trajectory.tools } : {}),
    provenance: { source: "conversation-trajectory", sourceId: trajectory.id },
    ...(trajectory.metadata ? { metadata: trajectory.metadata } : {}),
    createdAt: "1970-01-01T00:00:00.000Z",
  });
}
