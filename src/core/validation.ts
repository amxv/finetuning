import type { JsonObject, JsonPrimitive, JsonValue } from "./model.js";
import type { OpenAIChatFineTuningRow } from "./openai.js";

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
    messageCount: isRecord(row) && Array.isArray(row.messages) ? row.messages.length : 0,
    toolCallCount: 0,
    toolResultCount: 0,
  };

  if (!isRecord(row)) {
    errors.push({ path: "$", message: "row must be a JSON object" });
    return { valid: false, errors, summary };
  }

  const toolSchemasByName = collectToolSchemas(row.tools, errors);

  if (!Array.isArray(row.messages) || row.messages.length === 0) {
    errors.push({ path: "messages", message: "row must include at least one message" });
    return { valid: false, errors, summary };
  }

  const toolCallIds = new Set<string>();
  const toolCallNamesById = new Map<string, string>();
  const toolResultIds = new Set<string>();

  row.messages.forEach((message, index) => {
    validateMessage(message, index, errors, toolCallIds, toolCallNamesById, toolResultIds, toolSchemasByName, summary);
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
  message: unknown,
  index: number,
  errors: ValidationIssue[],
  toolCallIds: Set<string>,
  toolCallNamesById: Map<string, string>,
  toolResultIds: Set<string>,
  toolSchemasByName: Map<string, RuntimeToolSchema>,
  summary: ValidationSummary,
): void {
  const path = `messages[${index}]`;

  if (!isRecord(message)) {
    errors.push({ path, message: "message must be an object" });
    return;
  }

  if (message.role === "system" || message.role === "user") {
    if (typeof message.content !== "string" || message.content.trim().length === 0) {
      errors.push({ path: `${path}.content`, message: `${message.role} content must be a non-empty string` });
    }
    return;
  }

  if (message.role === "assistant") {
    if (message.content !== null && typeof message.content !== "string") {
      errors.push({ path: `${path}.content`, message: "assistant content must be a string or null" });
    }

    if (message.tool_calls !== undefined && !Array.isArray(message.tool_calls)) {
      errors.push({ path: `${path}.tool_calls`, message: "assistant tool_calls must be an array when present" });
      return;
    }

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0 && (typeof message.content !== "string" || message.content.trim().length === 0)) {
      errors.push({
        path: `${path}.content`,
        message: "assistant content must be non-empty when no tool calls are present",
      });
    }

    for (const [toolCallIndex, toolCall] of toolCalls.entries()) {
      summary.toolCallCount += 1;
      const toolCallPath = `${path}.tool_calls[${toolCallIndex}]`;

      if (!isRecord(toolCall)) {
        errors.push({ path: toolCallPath, message: "tool call must be an object" });
        continue;
      }

      const toolFunction = toolCall.function;
      if (!isRecord(toolFunction)) {
        errors.push({ path: `${toolCallPath}.function`, message: "tool call function must be an object" });
        continue;
      }

      if (typeof toolCall.id !== "string" || toolCall.id.trim().length === 0) {
        errors.push({ path: `${toolCallPath}.id`, message: "tool call id is required" });
      } else if (toolCallIds.has(toolCall.id)) {
        errors.push({ path: `${toolCallPath}.id`, message: "tool call id must be unique within a row" });
      } else {
        toolCallIds.add(toolCall.id);
        if (typeof toolFunction.name === "string") {
          toolCallNamesById.set(toolCall.id, toolFunction.name);
        }
      }

      if (toolCall.type !== "function") {
        errors.push({ path: `${toolCallPath}.type`, message: "tool call type must be function" });
      }

      if (typeof toolFunction.name !== "string" || toolFunction.name.trim().length === 0) {
        errors.push({ path: `${toolCallPath}.function.name`, message: "tool function name is required" });
      }

      const toolSchema = typeof toolFunction.name === "string" ? toolSchemasByName.get(toolFunction.name) : undefined;
      if (toolSchemasByName.size > 0 && !toolSchema) {
        errors.push({
          path: `${toolCallPath}.function.name`,
          message: "tool function name must exist in row tools",
        });
      }

      let parsedArguments: unknown;
      try {
        if (typeof toolFunction.arguments !== "string") {
          throw new Error("arguments must be a JSON string");
        }
        parsedArguments = JSON.parse(toolFunction.arguments) as unknown;
      } catch {
        errors.push({
          path: `${toolCallPath}.function.arguments`,
          message: "tool function arguments must be valid JSON",
        });
        continue;
      }

      if (!isJsonObject(parsedArguments)) {
        errors.push({
          path: `${toolCallPath}.function.arguments`,
          message: "tool function arguments must be a JSON object",
        });
        continue;
      }

      if (toolSchema?.parameters) {
        validateJsonValueAgainstSchema(
          parsedArguments,
          toolSchema.parameters,
          `${toolCallPath}.function.arguments`,
          errors,
        );
      }
    }

    return;
  }

  if (message.role === "tool") {
    summary.toolResultCount += 1;
    const toolCallId = typeof message.tool_call_id === "string" ? message.tool_call_id : undefined;

    if (!message.tool_call_id) {
      errors.push({ path: `${path}.tool_call_id`, message: "tool result must reference a tool call id" });
    } else if (!toolCallId) {
      errors.push({ path: `${path}.tool_call_id`, message: "tool result must reference a string tool call id" });
    } else if (!toolCallIds.has(toolCallId)) {
      errors.push({
        path: `${path}.tool_call_id`,
        message: "tool result must reference an earlier assistant tool call",
      });
    } else if (toolResultIds.has(toolCallId)) {
      errors.push({
        path: `${path}.tool_call_id`,
        message: "tool result must reference each assistant tool call at most once",
      });
    } else {
      toolResultIds.add(toolCallId);
    }

    if (typeof message.name !== "string" || message.name.trim().length === 0) {
      errors.push({ path: `${path}.name`, message: "tool result name is required" });
    } else if (toolCallId && toolCallNamesById.get(toolCallId) !== message.name) {
      errors.push({
        path: `${path}.name`,
        message: "tool result name must match the referenced assistant tool call",
      });
    }

    if (typeof message.content !== "string" || message.content.trim().length === 0) {
      errors.push({ path: `${path}.content`, message: "tool result content must be a non-empty string" });
    }

    return;
  }

  errors.push({ path: `${path}.role`, message: "message role must be one of system, user, assistant, or tool" });
}

interface RuntimeToolSchema {
  name: string;
  parameters?: RuntimeJsonSchemaObject;
}

interface RuntimeJsonSchemaObject {
  type: "object";
  properties: Record<string, RuntimeJsonSchemaValue>;
  required?: string[];
  additionalProperties?: boolean;
}

type RuntimeJsonSchemaValue =
  | RuntimeJsonSchemaObject
  | RuntimeJsonSchemaPrimitive;

type RuntimeJsonSchemaPrimitive = {
      type: "string" | "number" | "integer" | "boolean" | "array" | "null";
      enum?: JsonPrimitive[];
      items?: RuntimeJsonSchemaValue;
    };

function collectToolSchemas(value: unknown, errors: ValidationIssue[]): Map<string, RuntimeToolSchema> {
  const schemas = new Map<string, RuntimeToolSchema>();
  if (value === undefined) {
    return schemas;
  }

  if (!Array.isArray(value)) {
    errors.push({ path: "tools", message: "tools must be an array when present" });
    return schemas;
  }

  for (const [index, tool] of value.entries()) {
    const path = `tools[${index}]`;
    if (!isRecord(tool)) {
      errors.push({ path, message: "tool definition must be an object" });
      continue;
    }

    if (tool.type !== "function") {
      errors.push({ path: `${path}.type`, message: "tool definition type must be function" });
    }

    if (!isRecord(tool.function)) {
      errors.push({ path: `${path}.function`, message: "tool definition function must be an object" });
      continue;
    }

    const name = tool.function.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      errors.push({ path: `${path}.function.name`, message: "tool function name is required" });
      continue;
    }

    if (schemas.has(name)) {
      errors.push({ path: `${path}.function.name`, message: "tool function name must be unique within row tools" });
      continue;
    }

    if (typeof tool.function.description !== "string") {
      errors.push({ path: `${path}.function.description`, message: "tool function description must be a string" });
    }

    const parameters = parseRuntimeJsonSchemaObject(tool.function.parameters);
    if (!parameters) {
      errors.push({
        path: `${path}.function.parameters`,
        message: "tool function parameters must be an object JSON schema",
      });
    }

    schemas.set(name, {
      name,
      ...(parameters ? { parameters } : {}),
    });
  }

  return schemas;
}

function validateJsonValueAgainstSchema(
  value: JsonValue,
  schema: RuntimeJsonSchemaValue,
  path: string,
  errors: ValidationIssue[],
): void {
  switch (schema.type) {
    case "object":
      validateObjectAgainstSchema(value, schema, path, errors);
      return;
    case "string":
      if (!validatePrimitiveEnum(value, schema, path, errors)) {
        return;
      }
      if (typeof value !== "string") {
        errors.push({ path, message: "value must be a string" });
      }
      return;
    case "number":
      if (!validatePrimitiveEnum(value, schema, path, errors)) {
        return;
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push({ path, message: "value must be a finite number" });
      }
      return;
    case "integer":
      if (!validatePrimitiveEnum(value, schema, path, errors)) {
        return;
      }
      if (typeof value !== "number" || !Number.isInteger(value)) {
        errors.push({ path, message: "value must be an integer" });
      }
      return;
    case "boolean":
      if (!validatePrimitiveEnum(value, schema, path, errors)) {
        return;
      }
      if (typeof value !== "boolean") {
        errors.push({ path, message: "value must be a boolean" });
      }
      return;
    case "array":
      if (!Array.isArray(value)) {
        errors.push({ path, message: "value must be an array" });
        return;
      }
      if (schema.items) {
        value.forEach((item, index) => validateJsonValueAgainstSchema(item, schema.items!, `${path}[${index}]`, errors));
      }
      return;
    case "null":
      if (!validatePrimitiveEnum(value, schema, path, errors)) {
        return;
      }
      if (value !== null) {
        errors.push({ path, message: "value must be null" });
      }
  }
}

function validatePrimitiveEnum(
  value: JsonValue,
  schema: RuntimeJsonSchemaPrimitive,
  path: string,
  errors: ValidationIssue[],
): boolean {
  if (schema.enum && !schema.enum.some((enumValue) => enumValue === value)) {
    errors.push({ path, message: "value must match one of the schema enum values" });
    return false;
  }

  return true;
}

function validateObjectAgainstSchema(
  value: JsonValue,
  schema: RuntimeJsonSchemaObject,
  path: string,
  errors: ValidationIssue[],
): void {
  if (!isJsonObject(value)) {
    errors.push({ path, message: "value must be a JSON object" });
    return;
  }

  for (const requiredKey of schema.required ?? []) {
    if (!(requiredKey in value)) {
      errors.push({ path: `${path}.${requiredKey}`, message: "required property is missing" });
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in schema.properties)) {
        errors.push({ path: `${path}.${key}`, message: "additional property is not allowed by schema" });
      }
    }
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const propertySchema = schema.properties[key];
    if (propertySchema) {
      validateJsonValueAgainstSchema(nestedValue, propertySchema, `${path}.${key}`, errors);
    }
  }
}

function parseRuntimeJsonSchemaObject(value: unknown): RuntimeJsonSchemaObject | undefined {
  if (!isRecord(value) || value.type !== "object" || !isRecord(value.properties)) {
    return undefined;
  }

  const properties: Record<string, RuntimeJsonSchemaValue> = {};
  for (const [key, nestedValue] of Object.entries(value.properties)) {
    const nestedSchema = parseRuntimeJsonSchemaValue(nestedValue);
    if (!nestedSchema) {
      return undefined;
    }
    properties[key] = nestedSchema;
  }

  const schema: RuntimeJsonSchemaObject = {
    type: "object",
    properties,
  };

  if (Array.isArray(value.required) && value.required.every((item) => typeof item === "string")) {
    schema.required = value.required;
  }

  if (typeof value.additionalProperties === "boolean") {
    schema.additionalProperties = value.additionalProperties;
  }

  return schema;
}

function parseRuntimeJsonSchemaValue(value: unknown): RuntimeJsonSchemaValue | undefined {
  if (!isRecord(value) || typeof value.type !== "string") {
    return undefined;
  }

  if (value.type === "object") {
    return parseRuntimeJsonSchemaObject(value);
  }

  if (!isRuntimePrimitiveSchemaType(value.type)) {
    return undefined;
  }

  const schema: RuntimeJsonSchemaPrimitive = { type: value.type };
  if (Array.isArray(value.enum) && value.enum.every(isJsonPrimitive)) {
    schema.enum = value.enum;
  }

  if (value.type === "array" && value.items !== undefined) {
    const itemSchema = parseRuntimeJsonSchemaValue(value.items);
    if (!itemSchema) {
      return undefined;
    }
    schema.items = itemSchema;
  }

  return schema;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRuntimePrimitiveSchemaType(value: string): value is RuntimeJsonSchemaPrimitive["type"] {
  return value === "string" || value === "number" || value === "integer" || value === "boolean" || value === "array" || value === "null";
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (isJsonPrimitive(value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isJsonObject(value);
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
