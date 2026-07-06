export type {
  AssistantTextMessage,
  AssistantToolCallMessage,
  BusinessContext,
  CliCommandDefinition,
  ConversationMessage,
  ConversationTrajectory,
  ExportMode,
  FineTuningToolkitConfig,
  JsonObject,
  JsonPrimitive,
  JsonSchemaObject,
  JsonSchemaValue,
  JsonValue,
  PersonaDefinition,
  PublicWorkflow,
  SupportedProvider,
  SystemMessage,
  ToolCall,
  ToolResult,
  ToolResultMessage,
  ToolSchema,
  UserMessage,
  WorkflowStatus,
} from "./model.js";
export type {
  BuildOpenAIRowOptions,
  OpenAIChatFineTuningMessage,
  OpenAIChatFineTuningRow,
  OpenAIToolCall,
  OpenAIToolDefinition,
} from "./openai.js";
export {
  buildOpenAIFineTuningRow,
  buildOpenAIFineTuningRows,
} from "./openai.js";
export {
  assertValidOpenAIFineTuningRow,
  validateOpenAIFineTuningRow,
  type ValidationIssue,
  type ValidationResult,
  type ValidationSummary,
} from "./validation.js";
export {
  fullToolTrajectoryConversationFixture,
  noToolConversationFixture,
  representativeTrajectories,
  toolDecisionConversationFixture,
} from "./fixtures.js";
import type { CliCommandDefinition, PublicWorkflow } from "./model.js";

export const supportedWorkflows: PublicWorkflow[] = [
  {
    id: "synthetic-dataset-generation",
    status: "v1",
    description: "Generate synthetic chat and tool-calling examples from scenario configs.",
  },
  {
    id: "openai-jsonl-validation",
    status: "v1",
    description: "Validate OpenAI chat fine-tuning JSONL before publishing or training.",
  },
  {
    id: "dataset-translation",
    status: "experimental",
    description: "Localize datasets while preserving tool-call and tool-result structure.",
  },
  {
    id: "log-to-dataset-import",
    status: "deferred",
    description: "Convert redacted production logs into training rows.",
  },
];

export const cliCommands: CliCommandDefinition[] = [
  {
    name: "simulate-dataset",
    status: "v1",
    description: "Generate a synthetic OpenAI-format JSONL dataset from a scenario config.",
  },
  {
    name: "validate-dataset",
    status: "v1",
    description: "Validate JSONL rows and print a dataset summary.",
  },
  {
    name: "generate-personas",
    status: "v1",
    description: "Generate reusable synthetic personas for a scenario.",
  },
  {
    name: "translate-dataset",
    status: "experimental",
    description: "Translate dataset content while preserving schema-bearing fields.",
  },
  {
    name: "convert-logs",
    status: "deferred",
    description: "Convert redacted logs into OpenAI-format rows.",
  },
];
