export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export type WorkflowStatus = "v1" | "experimental" | "deferred";
export type SupportedProvider = "openai" | "anthropic" | "custom";

export interface BusinessContext {
  id: string;
  name: string;
  domain: string;
  description?: string;
  locale?: string;
  attributes?: JsonObject;
}

export interface PersonaDefinition {
  id: string;
  label: string;
  goals: string[];
  traits?: string[];
  locale?: string;
  metadata?: JsonObject;
}

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, JsonSchemaValue>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
}

export type JsonSchemaValue =
  | JsonSchemaObject
  | {
      type: "string" | "number" | "integer" | "boolean" | "array" | "null";
      description?: string;
      enum?: JsonPrimitive[];
      items?: JsonSchemaValue;
    };

export interface ToolSchema {
  name: string;
  description: string;
  parameters: JsonSchemaObject;
}

export interface ScenarioToolInventory {
  tools: ToolSchema[];
  source?: string;
}

export interface ScenarioPersonaSource {
  count: number;
  generatorPrompt?: string;
  personas?: PersonaDefinition[];
  source?: string;
}

export interface ScenarioStoppingRules {
  maxTurns?: number;
  stopWhen?: string[];
  escalationCriteria?: string[];
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  assistantRole: string;
  business: BusinessContext;
  personaSource: ScenarioPersonaSource;
  toolInventory: ScenarioToolInventory;
  conversationGoals: string[];
  stoppingRules: ScenarioStoppingRules;
  systemPrompt?: string;
  metadata?: JsonObject;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: JsonObject;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  payloadFormat?: "normalized_json" | "text";
  result: JsonValue;
}

export interface BaseConversationMessage {
  id?: string;
  timestamp?: string;
  metadata?: JsonObject;
}

export interface SystemMessage extends BaseConversationMessage {
  kind: "system";
  content: string;
}

export interface UserMessage extends BaseConversationMessage {
  kind: "user";
  content: string;
}

export interface AssistantTextMessage extends BaseConversationMessage {
  kind: "assistant_text";
  content: string;
}

export interface AssistantToolCallMessage extends BaseConversationMessage {
  kind: "assistant_tool_call";
  toolCalls: ToolCall[];
  content?: string;
}

export interface ToolResultMessage extends BaseConversationMessage {
  kind: "tool_result";
  result: ToolResult;
}

export type ConversationMessage =
  | SystemMessage
  | UserMessage
  | AssistantTextMessage
  | AssistantToolCallMessage
  | ToolResultMessage;

export interface SimulatedAssistantTurn {
  assistantText?: AssistantTextMessage;
  toolCall?: AssistantToolCallMessage;
  toolResults?: ToolResultMessage[];
  finalAssistantResponse?: AssistantTextMessage;
}

export interface ConversationTrajectory {
  id: string;
  business: BusinessContext;
  persona?: PersonaDefinition;
  tools?: ToolSchema[];
  messages: ConversationMessage[];
  metadata?: JsonObject;
}

export type ExportMode = "plain_chat" | "tool_decision" | "full_tool_trajectory";

export interface FineTuningToolkitConfig {
  scenario: ScenarioDefinition | { name: string; assistantRole: string; locale?: string };
  providers: {
    simulation?: SupportedProvider;
    export: "openai";
    translation?: SupportedProvider;
  };
  output: {
    format: "openai-chat-jsonl";
    directory: string;
  };
}

export interface PublicWorkflow {
  id: string;
  status: WorkflowStatus;
  description: string;
}

export interface CliCommandDefinition {
  name: string;
  status: WorkflowStatus;
  description: string;
}
