import type {
  ConversationTrajectory,
  FineTuningToolkitConfig,
  JsonObject,
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
