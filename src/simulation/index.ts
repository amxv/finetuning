import type {
  ConversationTrajectory,
  FineTuningToolkitConfig,
  JsonObject,
  JsonValue,
  PersonaDefinition,
  ScenarioDefinition,
  SimulatedAssistantTurn,
} from "../core/index.js";
import {
  findBundledScenarioProfile,
  parseScenarioDefinition,
  parseScenarioDefinitionJson,
} from "../core/index.js";
import type { ModelClient } from "../providers/index.js";
import { ProviderResponseError } from "../providers/index.js";
import type { ModelProviderKind } from "../providers/index.js";

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
}

export interface SimulationRunner {
  run(request: SimulationRequest, adapters: SimulationRuntimeAdapters): Promise<ConversationTrajectory[]>;
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

export function createDeferredSimulationRunner(): SimulationRunner {
  return {
    async run(): Promise<ConversationTrajectory[]> {
      throw new Error("simulation runner is not implemented in this phase");
    },
  };
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
