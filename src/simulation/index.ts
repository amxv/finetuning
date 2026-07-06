import type {
  AssistantToolCallMessage,
  ConversationMessage,
  ConversationTrajectory,
  ExportMode,
  FineTuningToolkitConfig,
  JsonObject,
  JsonSchemaValue,
  JsonValue,
  PersonaDefinition,
  ScenarioDefinition,
  SimulatedAssistantTurn,
  ToolCall,
  ToolResult,
  ToolResultMessage,
  ToolSchema,
} from "../core/index.js";
import {
  findBundledScenarioProfile,
  parseScenarioDefinition,
  parseScenarioDefinitionJson,
} from "../core/index.js";
import type { ModelClient } from "../providers/index.js";
import { ProviderResponseError, ProviderToolCallError } from "../providers/index.js";
import type { ModelMessage, ModelProviderKind } from "../providers/index.js";

export interface FileSystemAdapter {
  readText(path: string): Promise<string>;
  writeText(path: string, contents: string): Promise<void>;
  ensureDirectory(path: string): Promise<void>;
}

export interface DatasetWriter {
  writeJsonl(outputDirectory: string, filename: string, rows: string[]): Promise<void>;
}

export interface PersistenceAdapter {
  put(key: string, value: JsonObject): Promise<void>;
  get(key: string): Promise<JsonObject | undefined>;
}

export interface SimulationRuntimeAdapters {
  modelClient: ModelClient;
  filesystem: FileSystemAdapter;
  persistence?: PersistenceAdapter;
}

export interface ScenarioSource {
  config?: FineTuningToolkitConfig;
  definition: ScenarioDefinition;
  personas?: PersonaDefinition[];
  metadata?: JsonObject;
}

export type ScenarioSourceInput =
  | ScenarioDefinition
  | {
      definition: ScenarioDefinition;
      config?: FineTuningToolkitConfig;
      personas?: PersonaDefinition[];
      metadata?: JsonObject;
    }
  | {
      bundledProfileId: string;
      config?: FineTuningToolkitConfig;
      metadata?: JsonObject;
    }
  | {
      json: string;
      config?: FineTuningToolkitConfig;
      metadata?: JsonObject;
    }
  | {
      path: string;
      config?: FineTuningToolkitConfig;
      metadata?: JsonObject;
    };

export interface SimulationRequest {
  scenario: ScenarioSource;
  outputDirectory: string;
  limit?: number;
  mode?: ExportMode;
}

export interface SimulationRunner {
  run(request: SimulationRequest, adapters?: SimulationRuntimeAdapters): Promise<ConversationTrajectory[]>;
}

export interface AssistantTurnSimulator {
  simulateTurn(
    trajectory: ConversationTrajectory,
    adapters: SimulationRuntimeAdapters,
  ): Promise<SimulatedAssistantTurn>;
}

export interface PersonaGenerationRequest {
  scenario: ScenarioSource;
  count: number;
}

export interface PersonaGenerator {
  generate(request: PersonaGenerationRequest): Promise<PersonaDefinition[]>;
}

export interface ModelBackedPersonaGeneratorOptions {
  modelClient: ModelClient;
  provider: Exclude<ModelProviderKind, "custom">;
  model: string;
  temperature?: number;
}

export interface ToolResultRequest {
  scenario: ScenarioDefinition;
  persona: PersonaDefinition;
  toolCall: ToolCall;
  tool: ToolSchema;
  trajectoryId: string;
  turnIndex: number;
}

export interface ToolResultProvider {
  source: "deterministic" | "caller";
  getToolResult(request: ToolResultRequest): Promise<ToolResult>;
}

export interface ModelBackedSimulationRunnerOptions {
  modelClient: ModelClient;
  provider: Exclude<ModelProviderKind, "custom">;
  model: string;
  temperature?: number;
  toolResultProvider?: ToolResultProvider;
}

export function createDeterministicPersonaGenerator(): PersonaGenerator {
  return {
    async generate(request: PersonaGenerationRequest): Promise<PersonaDefinition[]> {
      return buildDeterministicPersonas(request.scenario, request.count);
    },
  };
}

export function createModelBackedPersonaGenerator(
  options: ModelBackedPersonaGeneratorOptions,
): PersonaGenerator {
  return {
    async generate(request: PersonaGenerationRequest): Promise<PersonaDefinition[]> {
      assertPersonaCount(request.count);

      const firstPrompt = buildPersonaGenerationPrompt(request.scenario.definition, request.count);
      const firstResponse = await options.modelClient.invoke({
        provider: options.provider,
        model: options.model,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        messages: [
          {
            role: "system",
            content:
              "Generate synthetic user personas. Return only a JSON array. Do not include markdown, comments, or surrounding text.",
          },
          { role: "user", content: firstPrompt },
        ],
        metadata: {
          scenarioId: request.scenario.definition.id,
          requestPath: "persona-generation",
        },
      });

      const firstParsed = parseModelPersonaResponse(firstResponse);
      if (firstParsed.ok) {
        return finalizeModelPersonas(firstParsed.personas, request.scenario.definition, options);
      }

      const repairResponse = await options.modelClient.invoke({
        provider: options.provider,
        model: options.model,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        messages: [
          {
            role: "system",
            content:
              "Repair persona JSON. Return only a valid JSON array matching the requested shape. No markdown.",
          },
          { role: "user", content: buildPersonaRepairPrompt(firstPrompt, firstParsed.error) },
        ],
        metadata: {
          scenarioId: request.scenario.definition.id,
          requestPath: "persona-generation-repair",
        },
      });

      const repairedParsed = parseModelPersonaResponse(repairResponse);
      if (!repairedParsed.ok) {
        throw new ProviderResponseError(`Invalid persona generation response after repair: ${repairedParsed.error}`, {
          provider: options.provider,
          model: options.model,
          details: {
            scenarioId: request.scenario.definition.id,
          },
        });
      }

      return finalizeModelPersonas(repairedParsed.personas, request.scenario.definition, options);
    },
  };
}

export function buildDeterministicPersonas(source: ScenarioSource, count: number): PersonaDefinition[] {
  assertPersonaCount(count);

  const bundledPersonas = source.personas ?? source.definition.personaSource.personas ?? [];
  const personas = bundledPersonas.slice(0, count);

  for (let index = personas.length; index < count; index += 1) {
    const goal = source.definition.conversationGoals[index % source.definition.conversationGoals.length];
    const persona: PersonaDefinition = {
      id: `${source.definition.id}-persona-${index + 1}`,
      label: `${source.definition.business.domain} user ${index + 1}`,
      goals: [goal ?? `Ask ${source.definition.business.name} for help.`],
      metadata: {
        generated: true,
        scenarioId: source.definition.id,
      },
    };

    if (source.definition.business.locale) {
      persona.locale = source.definition.business.locale;
    }

    personas.push(persona);
  }

  return personas;
}

export function createDeterministicToolResultProvider(): ToolResultProvider {
  return {
    source: "deterministic",
    async getToolResult(request: ToolResultRequest): Promise<ToolResult> {
      return {
        toolCallId: request.toolCall.id,
        name: request.toolCall.name,
        payloadFormat: "normalized_json",
        result: {
          scenarioId: request.scenario.id,
          personaId: request.persona.id,
          answer: `Deterministic sample result for ${request.toolCall.name}.`,
          source: "deterministic_simulation",
        },
      };
    },
  };
}

export function createDeterministicSimulationRunner(): SimulationRunner {
  return {
    async run(request: SimulationRequest): Promise<ConversationTrajectory[]> {
      const mode = request.mode ?? "full_tool_trajectory";
      const count = request.limit ?? request.scenario.definition.personaSource.count;
      const personas = buildDeterministicPersonas(request.scenario, count);
      return buildDeterministicTrajectories(request.scenario.definition, personas, mode);
    },
  };
}

export function createModelBackedSimulationRunner(
  options: ModelBackedSimulationRunnerOptions,
): SimulationRunner {
  return {
    async run(request: SimulationRequest): Promise<ConversationTrajectory[]> {
      const mode = request.mode ?? "full_tool_trajectory";
      const count = request.limit ?? request.scenario.definition.personaSource.count;
      const personas = buildDeterministicPersonas(request.scenario, count);
      const toolResultProvider = options.toolResultProvider ?? createDeterministicToolResultProvider();
      const trajectories: ConversationTrajectory[] = [];

      for (const [index, persona] of personas.entries()) {
        trajectories.push(await simulateModelBackedTrajectory(request.scenario.definition, persona, index, mode, options, toolResultProvider));
      }

      return trajectories;
    },
  };
}

export function buildDeterministicTrajectories(
  scenario: ScenarioDefinition,
  personas: PersonaDefinition[],
  mode: ExportMode,
): ConversationTrajectory[] {
  return personas.map((persona, index) => {
    const tool =
      mode === "plain_chat" ? undefined : scenario.toolInventory.tools[index % scenario.toolInventory.tools.length];
    const messages: ConversationMessage[] = buildInitialMessages(scenario, persona);

    if (!tool) {
      messages.push({
        kind: "assistant_text",
        content: `I can help with that. ${scenario.conversationGoals[0] ?? "Here is the next step."}`,
      });
    } else {
      const callId = `call_${scenario.id.replaceAll("-", "_")}_${index + 1}`;
      const toolCall: ToolCall = {
        id: callId,
        name: tool.name,
        arguments: buildToolArguments(tool),
      };
      const toolResult: ToolResult = {
        toolCallId: toolCall.id,
        name: toolCall.name,
        payloadFormat: "normalized_json",
        result: {
          scenarioId: scenario.id,
          personaId: persona.id,
          answer: `Deterministic sample result for ${tool.name}.`,
          source: "cli_sample_simulation",
        },
      };

      messages.push(
        {
          kind: "assistant_tool_call",
          toolCalls: [toolCall],
        },
        {
          kind: "tool_result",
          result: toolResult,
        },
        {
          kind: "assistant_text",
          content: `I checked ${tool.name} and found the next step for ${persona.label}.`,
        },
      );
    }

    const trajectory: ConversationTrajectory = {
      id: `${scenario.id}-trajectory-${index + 1}`,
      business: scenario.business,
      persona,
      messages,
      metadata: {
        scenarioId: scenario.id,
        personaId: persona.id,
        locale: scenario.business.locale ?? "und",
        generatedBy: "finetuning-cli",
        exportMode: mode,
        simulationProvider: "deterministic",
        simulationPath: "deterministic",
        toolResultProvider: tool ? "deterministic" : "none",
      },
    };

    if (tool) {
      trajectory.tools = [tool];
    }

    return trajectory;
  });
}

export function buildToolArguments(tool: ToolSchema): JsonObject {
  return Object.fromEntries(
    Object.entries(tool.parameters.properties).map(([key, value]) => [key, sampleJsonValue(value, key)]),
  ) as JsonObject;
}

export function createDeferredSimulationRunner(): SimulationRunner {
  return {
    async run(): Promise<ConversationTrajectory[]> {
      throw new Error("simulation runner is not implemented in this phase");
    },
  };
}

async function simulateModelBackedTrajectory(
  scenario: ScenarioDefinition,
  persona: PersonaDefinition,
  index: number,
  mode: ExportMode,
  options: ModelBackedSimulationRunnerOptions,
  toolResultProvider: ToolResultProvider,
): Promise<ConversationTrajectory> {
  const trajectoryId = `${scenario.id}-trajectory-${index + 1}`;
  const messages: ConversationMessage[] = buildInitialMessages(scenario, persona);
  const availableTools = mode === "plain_chat" ? [] : scenario.toolInventory.tools;

  const firstResponse = await options.modelClient.invoke({
    provider: options.provider,
    model: options.model,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    messages: [
      ...toModelMessages(messages),
      {
        role: "user",
        content: buildInitialSimulationPrompt(scenario, persona, mode),
      },
    ],
    ...(availableTools.length > 0 ? { tools: availableTools } : {}),
    metadata: {
      scenarioId: scenario.id,
      personaId: persona.id,
      requestPath: "simulation-initial",
      exportMode: mode,
    },
  });

  if (firstResponse.kind === "text") {
    const content = assertNonEmptyAssistantText(firstResponse.content, options, "initial assistant response");
    messages.push({ kind: "assistant_text", content });
    return buildTrajectory(scenario, persona, trajectoryId, messages, [], mode, options, "model-text", "none");
  }

  const validatedToolCalls = firstResponse.toolCalls.map((toolCall, toolCallIndex) =>
    validateProviderToolCall(toolCall, availableTools, toolCallIndex, options),
  );
  assertUniqueProviderToolCallIds(validatedToolCalls, options);
  const assistantToolCall: AssistantToolCallMessage = {
    kind: "assistant_tool_call",
    toolCalls: validatedToolCalls,
    ...(firstResponse.content ? { content: firstResponse.content } : {}),
  };
  messages.push(assistantToolCall);

  const toolsByName = new Map(availableTools.map((tool) => [tool.name, tool]));
  const usedTools: ToolSchema[] = [];
  const toolResults: ToolResultMessage[] = [];

  for (const [toolCallIndex, toolCall] of validatedToolCalls.entries()) {
    const tool = toolsByName.get(toolCall.name);
    if (!tool) {
      throw new ProviderToolCallError(`Unknown tool call: ${toolCall.name}`, {
        provider: options.provider,
        model: options.model,
        details: { toolName: toolCall.name, scenarioId: scenario.id },
      });
    }

    if (!usedTools.some((usedTool) => usedTool.name === tool.name)) {
      usedTools.push(tool);
    }

    const result = await toolResultProvider.getToolResult({
      scenario,
      persona,
      toolCall,
      tool,
      trajectoryId,
      turnIndex: toolCallIndex,
    });
    validateToolResultForCall(result, toolCall, options);
    const resultMessage: ToolResultMessage = { kind: "tool_result", result };
    toolResults.push(resultMessage);
  }

  if (mode === "tool_decision") {
    return buildTrajectory(
      scenario,
      persona,
      trajectoryId,
      messages,
      usedTools,
      mode,
      options,
      "model-tool-decision",
      toolResultProvider.source,
    );
  }

  messages.push(...toolResults);

  const finalResponse = await options.modelClient.invoke({
    provider: options.provider,
    model: options.model,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    messages: [
      ...toModelMessages(messages),
      {
        role: "user",
        content: buildFinalSimulationPrompt(scenario, persona),
      },
    ],
    metadata: {
      scenarioId: scenario.id,
      personaId: persona.id,
      requestPath: "simulation-final",
      exportMode: mode,
    },
  });

  if (finalResponse.kind !== "text") {
    throw new ProviderResponseError("Final assistant simulation response must be text.", {
      provider: options.provider,
      model: options.model,
      details: { scenarioId: scenario.id, personaId: persona.id },
    });
  }

  messages.push({
    kind: "assistant_text",
    content: assertNonEmptyAssistantText(finalResponse.content, options, "final assistant response"),
  });

  return buildTrajectory(
    scenario,
    persona,
    trajectoryId,
    messages,
    usedTools,
    mode,
    options,
    "model-tool-trajectory",
    toolResultProvider.source,
  );
}

function buildInitialMessages(scenario: ScenarioDefinition, persona: PersonaDefinition): ConversationMessage[] {
  return [
    {
      kind: "system",
      content: scenario.systemPrompt ?? `You are ${scenario.assistantRole} for ${scenario.business.name}.`,
    },
    {
      kind: "user",
      content: persona.goals[0] ?? `I need help from ${scenario.business.name}.`,
    },
  ];
}

function buildTrajectory(
  scenario: ScenarioDefinition,
  persona: PersonaDefinition,
  trajectoryId: string,
  messages: ConversationMessage[],
  tools: ToolSchema[],
  mode: ExportMode,
  options: ModelBackedSimulationRunnerOptions,
  simulationPath: string,
  toolResultProviderSource: ToolResultProvider["source"] | "none",
): ConversationTrajectory {
  return {
    id: trajectoryId,
    business: scenario.business,
    persona,
    ...(tools.length > 0 ? { tools } : {}),
    messages,
    metadata: {
      scenarioId: scenario.id,
      personaId: persona.id,
      locale: persona.locale ?? scenario.business.locale ?? "und",
      generatedBy: "finetuning-simulation",
      exportMode: mode,
      simulationProvider: options.provider,
      simulationModel: options.model,
      simulationPath,
      toolResultProvider: toolResultProviderSource,
    },
  };
}

function buildInitialSimulationPrompt(
  scenario: ScenarioDefinition,
  persona: PersonaDefinition,
  mode: ExportMode,
): string {
  const toolInstruction =
    mode === "plain_chat"
      ? "Answer directly without using tools."
      : "Answer directly when appropriate, or call one or more available tools when factual lookup or action is needed.";
  return [
    `Simulate the assistant's next response for scenario ${scenario.id}.`,
    `Business: ${scenario.business.name}.`,
    `Assistant role: ${scenario.assistantRole}.`,
    `Persona: ${persona.label}.`,
    `Persona goals: ${persona.goals.join(" | ")}`,
    toolInstruction,
  ].join("\n");
}

function buildFinalSimulationPrompt(scenario: ScenarioDefinition, persona: PersonaDefinition): string {
  return [
    `Write the final assistant response for scenario ${scenario.id} after the tool results.`,
    `Business: ${scenario.business.name}.`,
    `Persona: ${persona.label}.`,
    "Use the tool result facts and keep the response concise.",
  ].join("\n");
}

function validateProviderToolCall(
  toolCall: ToolCall,
  availableTools: ToolSchema[],
  toolCallIndex: number,
  options: ModelBackedSimulationRunnerOptions,
): ToolCall {
  if (!toolCall.id || typeof toolCall.id !== "string") {
    throw new ProviderToolCallError(`toolCalls[${toolCallIndex}].id must be a non-empty string`, {
      provider: options.provider,
      model: options.model,
    });
  }

  const tool = availableTools.find((candidate) => candidate.name === toolCall.name);
  if (!tool) {
    throw new ProviderToolCallError(`Unknown tool call: ${toolCall.name}`, {
      provider: options.provider,
      model: options.model,
      details: { toolName: toolCall.name },
    });
  }

  if (!isJsonObject(toolCall.arguments)) {
    throw new ProviderToolCallError(`Tool call ${toolCall.name} arguments must be a JSON object`, {
      provider: options.provider,
      model: options.model,
      details: { toolName: toolCall.name },
    });
  }

  validateToolArgumentsAgainstSchema(toolCall.name, toolCall.arguments, tool.parameters, options);
  return toolCall;
}

function assertUniqueProviderToolCallIds(
  toolCalls: ToolCall[],
  options: ModelBackedSimulationRunnerOptions,
): void {
  const seen = new Set<string>();
  for (const toolCall of toolCalls) {
    if (seen.has(toolCall.id)) {
      throw new ProviderToolCallError(`Duplicate tool call id: ${toolCall.id}`, {
        provider: options.provider,
        model: options.model,
        details: { toolCallId: toolCall.id },
      });
    }
    seen.add(toolCall.id);
  }
}

function validateToolResultForCall(
  result: ToolResult,
  toolCall: ToolCall,
  options: ModelBackedSimulationRunnerOptions,
): void {
  if (result.toolCallId !== toolCall.id) {
    throw new ProviderToolCallError(`Tool result id ${result.toolCallId} did not match tool call ${toolCall.id}`, {
      provider: options.provider,
      model: options.model,
      details: { toolCallId: toolCall.id, toolResultId: result.toolCallId },
    });
  }

  if (result.name !== toolCall.name) {
    throw new ProviderToolCallError(`Tool result name ${result.name} did not match tool call ${toolCall.name}`, {
      provider: options.provider,
      model: options.model,
      details: { toolCallId: toolCall.id, toolName: toolCall.name, resultName: result.name },
    });
  }
}

function validateToolArgumentsAgainstSchema(
  toolName: string,
  args: JsonObject,
  schema: ToolSchema["parameters"],
  options: ModelBackedSimulationRunnerOptions,
): void {
  for (const requiredKey of schema.required ?? []) {
    if (!(requiredKey in args)) {
      throw new ProviderToolCallError(`Tool call ${toolName} is missing required argument ${requiredKey}`, {
        provider: options.provider,
        model: options.model,
        details: { toolName, requiredKey },
      });
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(args)) {
      if (!(key in schema.properties)) {
        throw new ProviderToolCallError(`Tool call ${toolName} included unknown argument ${key}`, {
          provider: options.provider,
          model: options.model,
          details: { toolName, argument: key },
        });
      }
    }
  }

  for (const [key, value] of Object.entries(args)) {
    const propertySchema = schema.properties[key];
    if (!propertySchema) {
      continue;
    }

    if (!matchesJsonSchemaValue(value, propertySchema)) {
      throw new ProviderToolCallError(`Tool call ${toolName} argument ${key} did not match schema type`, {
        provider: options.provider,
        model: options.model,
        details: { toolName, argument: key },
      });
    }
  }
}

function matchesJsonSchemaValue(value: JsonValue, schema: JsonSchemaValue): boolean {
  switch (schema.type) {
    case "object":
      return isJsonObject(value);
    case "string":
      return typeof value === "string" && (!schema.enum || schema.enum.includes(value));
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value) && (!schema.items || value.every((item) => matchesJsonSchemaValue(item, schema.items!)));
    case "null":
      return value === null;
  }
}

function assertNonEmptyAssistantText(
  content: string,
  options: ModelBackedSimulationRunnerOptions,
  label: string,
): string {
  if (content.trim() === "") {
    throw new ProviderResponseError(`Empty ${label}.`, {
      provider: options.provider,
      model: options.model,
    });
  }

  return content;
}

function toModelMessages(messages: ConversationMessage[]): ModelMessage[] {
  return messages.flatMap((message): ModelMessage[] => {
    switch (message.kind) {
      case "system":
        return [{ role: "system", content: message.content }];
      case "user":
        return [{ role: "user", content: message.content }];
      case "assistant_text":
        return [{ role: "assistant", content: message.content }];
      case "assistant_tool_call":
        return [
          {
            role: "assistant",
            content: message.content ?? "",
            toolCalls: message.toolCalls,
          },
        ];
      case "tool_result":
        return [
          {
            role: "tool",
            content: typeof message.result.result === "string" ? message.result.result : JSON.stringify(message.result.result),
            toolCallId: message.result.toolCallId,
            name: message.result.name,
          },
        ];
    }
  });
}

function sampleJsonValue(schema: JsonSchemaValue, key: string): JsonObject[string] {
  if (schema.type === "object") {
    return buildObjectFromSchema(schema.properties);
  }

  switch (schema.type) {
    case "string":
      return `sample ${key}`;
    case "number":
    case "integer":
      return 1;
    case "boolean":
      return true;
    case "array":
      return [];
    case "null":
      return null;
  }
}

function buildObjectFromSchema(properties: Record<string, JsonSchemaValue>): JsonObject {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, sampleJsonValue(value, key)]),
  ) as JsonObject;
}

export async function loadScenarioSource(
  input: ScenarioSourceInput,
  filesystem?: FileSystemAdapter,
): Promise<ScenarioSource> {
  if (isScenarioDefinition(input)) {
    return buildScenarioSource(input);
  }

  if ("definition" in input) {
    return buildScenarioSource(input.definition, input.config, input.personas, input.metadata);
  }

  if ("bundledProfileId" in input) {
    const definition = findBundledScenarioProfile(input.bundledProfileId);
    if (!definition) {
      throw new Error(`Unknown bundled scenario profile: ${input.bundledProfileId}`);
    }

    return buildScenarioSource(definition, input.config, undefined, input.metadata);
  }

  if ("json" in input) {
    return buildScenarioSource(parseScenarioDefinitionJson(input.json), input.config, undefined, input.metadata);
  }

  if (!filesystem) {
    throw new Error("A FileSystemAdapter is required to load a scenario from path.");
  }

  const contents = await filesystem.readText(input.path);
  return buildScenarioSource(parseScenarioDefinitionJson(contents), input.config, undefined, input.metadata);
}

function buildScenarioSource(
  definition: ScenarioDefinition,
  config?: FineTuningToolkitConfig,
  personas?: PersonaDefinition[],
  metadata?: JsonObject,
): ScenarioSource {
  const source: ScenarioSource = {
    definition: parseScenarioDefinition(definition),
  };

  if (config) {
    source.config = config;
  }

  const resolvedPersonas = personas ?? definition.personaSource.personas;
  if (resolvedPersonas) {
    source.personas = resolvedPersonas;
  }

  if (metadata) {
    source.metadata = metadata;
  }

  return source;
}

function isScenarioDefinition(input: ScenarioSourceInput): input is ScenarioDefinition {
  return "assistantRole" in input && "business" in input && "personaSource" in input && "toolInventory" in input;
}

function assertPersonaCount(count: number): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("--count and --limit must be non-negative integers.");
  }
}

function buildPersonaGenerationPrompt(scenario: ScenarioDefinition, count: number): string {
  const locale = scenario.business.locale ?? "und";
  const prompt = scenario.personaSource.generatorPrompt ?? "Create realistic users for this assistant scenario.";
  return [
    `Create exactly ${count} personas for scenario ${scenario.id}.`,
    `Business: ${scenario.business.name} (${scenario.business.domain}).`,
    `Assistant role: ${scenario.assistantRole}.`,
    `Locale: ${locale}.`,
    `Persona guidance: ${prompt}`,
    `Conversation goals: ${scenario.conversationGoals.join(" | ")}`,
    "Return a JSON array only.",
    "Each item must be an object with string id, string label, non-empty string array goals, and optional string array traits, string locale, object metadata.",
    "Use stable lowercase ids with letters, numbers, and hyphens.",
  ].join("\n");
}

function buildPersonaRepairPrompt(originalPrompt: string, validationError: string): string {
  return [
    "The previous response was invalid.",
    `Validation error: ${validationError}`,
    "Regenerate the full response as valid JSON only.",
    originalPrompt,
  ].join("\n");
}

function parseModelPersonaResponse(
  response: Awaited<ReturnType<ModelClient["invoke"]>>,
): { ok: true; personas: PersonaDefinition[] } | { ok: false; error: string } {
  if (response.kind !== "text") {
    return { ok: false, error: "expected a text response containing a JSON array" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.content) as unknown;
  } catch (error) {
    return {
      ok: false,
      error: `response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return parsePersonaArray(parsed);
}

function parsePersonaArray(
  value: unknown,
): { ok: true; personas: PersonaDefinition[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) {
    return { ok: false, error: "persona response must be a JSON array" };
  }

  const ids = new Set<string>();
  const personas: PersonaDefinition[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) {
      return { ok: false, error: `persona[${index}] must be an object` };
    }

    const id = item.id;
    if (typeof id !== "string" || id.trim() === "") {
      return { ok: false, error: `persona[${index}].id must be a non-empty string` };
    }

    if (ids.has(id)) {
      return { ok: false, error: `persona[${index}].id duplicates ${id}` };
    }
    ids.add(id);

    const label = item.label;
    if (typeof label !== "string" || label.trim() === "") {
      return { ok: false, error: `persona[${index}].label must be a non-empty string` };
    }

    const goals = item.goals;
    if (!isNonEmptyStringArray(goals)) {
      return { ok: false, error: `persona[${index}].goals must be a non-empty string array` };
    }

    const persona: PersonaDefinition = {
      id,
      label,
      goals,
    };

    if (item.traits !== undefined) {
      if (!isStringArray(item.traits)) {
        return { ok: false, error: `persona[${index}].traits must be a string array when present` };
      }
      persona.traits = item.traits;
    }

    if (item.locale !== undefined) {
      if (typeof item.locale !== "string" || item.locale.trim() === "") {
        return { ok: false, error: `persona[${index}].locale must be a non-empty string when present` };
      }
      persona.locale = item.locale;
    }

    if (item.metadata !== undefined) {
      if (!isJsonObject(item.metadata)) {
        return { ok: false, error: `persona[${index}].metadata must be a JSON object when present` };
      }
      persona.metadata = item.metadata;
    }

    personas.push(persona);
  }

  return { ok: true, personas };
}

function finalizeModelPersonas(
  personas: PersonaDefinition[],
  scenario: ScenarioDefinition,
  options: ModelBackedPersonaGeneratorOptions,
): PersonaDefinition[] {
  return personas.map((persona) => ({
    ...persona,
    ...(persona.locale ? {} : scenario.business.locale ? { locale: scenario.business.locale } : {}),
    metadata: {
      ...(persona.metadata ?? {}),
      generated: true,
      scenarioId: scenario.id,
      personaProvider: options.provider,
      personaModel: options.model,
    },
  }));
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item !== "");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(isJsonValue);
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
