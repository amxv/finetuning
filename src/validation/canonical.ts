import { datasetSchemaVersion, type DatasetExampleV1 } from "../core/canonical.js";

export type ValidationStage = "schema" | "semantic" | "training-readiness";
export type ValidationIssueCode =
  | "SCHEMA_VERSION_UNSUPPORTED"
  | "MESSAGES_EMPTY"
  | "ROLE_INVALID"
  | "TOOL_CALL_ID_DUPLICATE"
  | "TOOL_RESULT_ORPHANED"
  | "TOOL_RESULT_MISSING"
  | "ASSISTANT_TARGET_MISSING"
  | "CONTENT_EMPTY";
export interface StagedValidationIssue {
  code: ValidationIssueCode;
  stage: ValidationStage;
  path: string;
  message: string;
  severity: "error" | "warning";
}
export interface StagedValidationReport {
  valid: boolean;
  issues: StagedValidationIssue[];
  stages: Record<ValidationStage, boolean>;
}

export function validateDatasetExample(example: DatasetExampleV1): StagedValidationReport {
  const issues: StagedValidationIssue[] = [];
  const add = (code: ValidationIssueCode, stage: ValidationStage, path: string, message: string) =>
    issues.push({ code, stage, path, message, severity: "error" });
  if (example.datasetSchemaVersion !== datasetSchemaVersion)
    add(
      "SCHEMA_VERSION_UNSUPPORTED",
      "schema",
      "datasetSchemaVersion",
      "Only canonical dataset schema 1.0.0 is supported.",
    );
  if (!Array.isArray(example.messages) || example.messages.length === 0)
    add("MESSAGES_EMPTY", "schema", "messages", "At least one message is required.");
  const calls = new Set<string>(),
    results = new Set<string>();
  example.messages.forEach((message, index) => {
    if (!message.content.length && !message.toolCalls?.length)
      add("CONTENT_EMPTY", "semantic", `messages[${index}].content`, "Message requires content or tool calls.");
    for (const call of message.toolCalls ?? []) {
      if (calls.has(call.id))
        add("TOOL_CALL_ID_DUPLICATE", "semantic", `messages[${index}].toolCalls`, `Duplicate tool call id ${call.id}.`);
      calls.add(call.id);
    }
    if (message.role === "tool" && message.toolCallId) {
      results.add(message.toolCallId);
      if (!calls.has(message.toolCallId))
        add(
          "TOOL_RESULT_ORPHANED",
          "semantic",
          `messages[${index}].toolCallId`,
          `No preceding tool call ${message.toolCallId}.`,
        );
    }
  });
  for (const id of calls)
    if (!results.has(id)) add("TOOL_RESULT_MISSING", "semantic", "messages", `Tool call ${id} has no result.`);
  if (
    !example.messages.some(
      (message) => message.role === "assistant" && (message.content.length || message.toolCalls?.length),
    )
  )
    add("ASSISTANT_TARGET_MISSING", "training-readiness", "messages", "At least one assistant target is required.");
  return {
    valid: issues.length === 0,
    issues,
    stages: {
      schema: !issues.some((i) => i.stage === "schema"),
      semantic: !issues.some((i) => i.stage === "semantic"),
      "training-readiness": !issues.some((i) => i.stage === "training-readiness"),
    },
  };
}
