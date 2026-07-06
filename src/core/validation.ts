import type { OpenAIChatFineTuningMessage, OpenAIChatFineTuningRow } from "./openai.js";

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationSummary {
  messageCount: number;
  toolCallCount: number;
  toolResultCount: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  summary: ValidationSummary;
}

export function validateOpenAIFineTuningRow(row: OpenAIChatFineTuningRow): ValidationResult {
  const errors: ValidationIssue[] = [];
  const summary: ValidationSummary = {
    messageCount: Array.isArray(row.messages) ? row.messages.length : 0,
    toolCallCount: 0,
    toolResultCount: 0,
  };

  if (!Array.isArray(row.messages) || row.messages.length === 0) {
    errors.push({ path: "messages", message: "row must include at least one message" });
    return { valid: false, errors, summary };
  }

  const toolCallIds = new Set<string>();
  const toolCallNamesById = new Map<string, string>();
  const toolNames = new Set(row.tools?.map((tool) => tool.function.name) ?? []);

  row.messages.forEach((message, index) => {
    validateMessage(message, index, errors, toolCallIds, toolCallNamesById, toolNames, summary);
  });

  return {
    valid: errors.length === 0,
    errors,
    summary,
  };
}

export function assertValidOpenAIFineTuningRow(row: OpenAIChatFineTuningRow): void {
  const result = validateOpenAIFineTuningRow(row);

  if (!result.valid) {
    const details = result.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`Invalid OpenAI fine-tuning row: ${details}`);
  }
}

function validateMessage(
  message: OpenAIChatFineTuningMessage,
  index: number,
  errors: ValidationIssue[],
  toolCallIds: Set<string>,
  toolCallNamesById: Map<string, string>,
  toolNames: Set<string>,
  summary: ValidationSummary,
): void {
  const path = `messages[${index}]`;

  if (message.role === "system" || message.role === "user") {
    if (typeof message.content !== "string" || message.content.length === 0) {
      errors.push({ path: `${path}.content`, message: `${message.role} content must be a non-empty string` });
    }
    return;
  }

  if (message.role === "assistant") {
    if (message.content !== null && typeof message.content !== "string") {
      errors.push({ path: `${path}.content`, message: "assistant content must be a string or null" });
    }

    for (const [toolCallIndex, toolCall] of (message.tool_calls ?? []).entries()) {
      summary.toolCallCount += 1;
      const toolCallPath = `${path}.tool_calls[${toolCallIndex}]`;

      if (!toolCall.id) {
        errors.push({ path: `${toolCallPath}.id`, message: "tool call id is required" });
      } else {
        toolCallIds.add(toolCall.id);
        toolCallNamesById.set(toolCall.id, toolCall.function.name);
      }

      if (toolCall.type !== "function") {
        errors.push({ path: `${toolCallPath}.type`, message: "tool call type must be function" });
      }

      if (!toolCall.function.name) {
        errors.push({ path: `${toolCallPath}.function.name`, message: "tool function name is required" });
      }

      if (toolNames.size > 0 && !toolNames.has(toolCall.function.name)) {
        errors.push({
          path: `${toolCallPath}.function.name`,
          message: "tool function name must exist in row tools",
        });
      }

      try {
        JSON.parse(toolCall.function.arguments);
      } catch {
        errors.push({
          path: `${toolCallPath}.function.arguments`,
          message: "tool function arguments must be valid JSON",
        });
      }
    }

    return;
  }

  if (message.role === "tool") {
    summary.toolResultCount += 1;

    if (!message.tool_call_id) {
      errors.push({ path: `${path}.tool_call_id`, message: "tool result must reference a tool call id" });
    } else if (!toolCallIds.has(message.tool_call_id)) {
      errors.push({
        path: `${path}.tool_call_id`,
        message: "tool result must reference an earlier assistant tool call",
      });
    }

    if (!message.name) {
      errors.push({ path: `${path}.name`, message: "tool result name is required" });
    } else if (message.tool_call_id && toolCallNamesById.get(message.tool_call_id) !== message.name) {
      errors.push({
        path: `${path}.name`,
        message: "tool result name must match the referenced assistant tool call",
      });
    }

    if (typeof message.content !== "string" || message.content.length === 0) {
      errors.push({ path: `${path}.content`, message: "tool result content must be a non-empty string" });
    }
  }
}
