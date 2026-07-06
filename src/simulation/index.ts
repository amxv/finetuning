import type {
  ConversationTrajectory,
  FineTuningToolkitConfig,
  JsonObject,
  PersonaDefinition,
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
  config: FineTuningToolkitConfig;
  personas?: PersonaDefinition[];
  metadata?: JsonObject;
}

export interface SimulationRequest {
  scenario: ScenarioSource;
  outputDirectory: string;
  limit?: number;
}

export interface SimulationRunner {
  run(request: SimulationRequest, adapters: SimulationRuntimeAdapters): Promise<ConversationTrajectory[]>;
}

export function createDeferredSimulationRunner(): SimulationRunner {
  return {
    async run(): Promise<ConversationTrajectory[]> {
      throw new Error("simulation runner is not implemented in this phase");
    },
  };
}
