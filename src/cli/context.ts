import type { JsonObject } from "../core/model.js";
import type { ParsedArgs } from "./argv.js";

export type CliProviderKind = "openai" | "anthropic";
export type DeterministicProviderChoice = CliProviderKind | "deterministic";
export type TranslationStrategyChoice = "local-pseudo" | "openai" | "anthropic";
export type ProviderRuntimePrefix = "persona" | "simulation" | "translation";

export interface CliProviderRuntimeConfigInput {
  provider?: string;
  model?: string;
  apiKeyEnv?: string;
  baseUrl?: string;
  temperature?: number;
  maxOutputTokens?: number;
  headers?: Record<string, string>;
  metadata?: JsonObject;
}

export interface CliWorkflowConfig {
  scenario?: unknown;
  providers: Partial<Record<ProviderRuntimePrefix, CliProviderRuntimeConfigInput>>;
}

export interface CliContext {
  args: ParsedArgs;
  config: CliWorkflowConfig;
}
