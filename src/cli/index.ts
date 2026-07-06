#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";
import {
  buildOpenAIFineTuningRow,
  bundledScenarioProfiles,
  cliCommands,
  createDeterministicPersonaGenerator,
  createDeterministicSimulationRunner,
  createDeferredLogConversionError,
  createAnthropicTranslationAdapter,
  createModelBackedPersonaGenerator,
  createModelBackedSimulationRunner,
  createModelClientFromConfig,
  createOpenAITranslationAdapter,
  deferredLogConversionBoundary,
  defaultApiKeyEnvForProvider,
  loadScenarioSource,
  resolveProviderClientOptions,
  serializeOpenAIJsonlRows,
  summarizeOpenAIJsonlRows,
  translateOpenAIJsonl,
  validateOpenAIJsonl,
  type ExportMode,
  type JsonObject,
  type PersonaGenerator,
  type ProviderRuntimeConfig,
  type ScenarioSource,
  type SimulationRunner,
} from "../index.js";

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

interface CliContext {
  args: ParsedArgs;
  config: CliWorkflowConfig;
}

type CliProviderKind = "openai" | "anthropic";
type DeterministicProviderChoice = CliProviderKind | "deterministic";
type TranslationStrategyChoice = "local-pseudo" | "openai" | "anthropic";
type ProviderRuntimePrefix = "persona" | "simulation" | "translation";

interface CliProviderRuntimeConfigInput {
  provider?: string;
  model?: string;
  apiKeyEnv?: string;
  baseUrl?: string;
  temperature?: number;
  maxOutputTokens?: number;
  headers?: Record<string, string>;
  metadata?: JsonObject;
}

interface CliWorkflowConfig {
  scenario?: unknown;
  providers: Partial<Record<ProviderRuntimePrefix, CliProviderRuntimeConfigInput>>;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  const [commandName, ...rawArgs] = process.argv.slice(2);

  if (!commandName || commandName === "--help" || commandName === "-h") {
    printHelp();
    return;
  }

  const args = parseArgs(rawArgs);
  if (readBooleanFlag(args, "help") || readBooleanFlag(args, "h")) {
    printCommandHelp(commandName);
    return;
  }

  const command = cliCommands.find((candidate) => candidate.name === commandName);
  if (!command) {
    throw new Error(`Unknown command: ${commandName}`);
  }

  const config = await readCliWorkflowConfig(args);
  const context: CliContext = { args, config };
  switch (commandName) {
    case "generate-personas":
      await generatePersonas(context);
      return;
    case "simulate-dataset":
      await simulateDataset(context);
      return;
    case "validate-dataset":
      await validateDataset(context);
      return;
    case "translate-dataset":
      await translateDataset(context);
      return;
    case "convert-logs":
      console.error(createDeferredLogConversionError().message);
      process.exit(2);
  }
}

async function generatePersonas({ args, config }: CliContext): Promise<void> {
  const scenario = await readScenarioSource(args, config);
  const outputPath = readRequiredStringFlag(args, "out");
  const force = readBooleanFlag(args, "force");
  const count = readOptionalIntegerFlag(args, "count") ?? scenario.definition.personaSource.count;
  const provider = readDeterministicProviderChoice(args, "persona-provider", "deterministic", config.providers.persona);

  const generator = createCliPersonaGenerator(args, config, provider);
  const personas = await generator.generate({ scenario, count });

  await writeBatchFile(outputPath, `${JSON.stringify(personas, null, 2)}\n`, force);

  console.log(`Wrote ${personas.length} personas to ${outputPath}`);
  console.log(`Scenario: ${scenario.definition.id} (${scenario.definition.name})`);
}

async function simulateDataset({ args, config }: CliContext): Promise<void> {
  const scenario = await readScenarioSource(args, config);
  const outputPath = readRequiredStringFlag(args, "out");
  const mode = readExportMode(args) ?? "full_tool_trajectory";
  const force = readBooleanFlag(args, "force");
  const count = readOptionalIntegerFlag(args, "limit") ?? scenario.definition.personaSource.count;
  const provider = readDeterministicProviderChoice(args, "simulation-provider", "deterministic", config.providers.simulation);

  const runner = createCliSimulationRunner(args, config, provider);
  const trajectories = await runner.run({ scenario, outputDirectory: dirname(outputPath), limit: count, mode });
  const rows = trajectories.map((trajectory) => buildOpenAIFineTuningRow(trajectory, { mode }));
  const contents = serializeOpenAIJsonlRows(rows);

  await writeBatchFile(outputPath, contents, force);

  const summary = summarizeOpenAIJsonlRows(rows);
  console.log(`Wrote ${summary.rowCount} rows to ${outputPath}`);
  printDatasetSummary(summary);
  console.log(`Scenario: ${scenario.definition.id} (${scenario.definition.name})`);
  console.log(`Export mode: ${mode}`);
}

async function validateDataset({ args }: CliContext): Promise<void> {
  const inputPath = args.positionals[0] ?? readOptionalStringFlag(args, "input");
  if (!inputPath) {
    throw new Error("validate-dataset requires a dataset path or --input <path>.");
  }

  const contents = await readFile(inputPath, "utf8");
  const result = validateOpenAIJsonl(contents);

  console.log(`Validated ${inputPath}`);
  printDatasetSummary(result.summary);

  if (!result.valid) {
    console.error("");
    console.error("Validation errors:");
    for (const error of result.errors) {
      console.error(`  line ${error.line} ${error.path}: ${error.message}`);
    }
    process.exit(1);
  }

  console.log("Dataset is valid.");
}

async function translateDataset({ args, config }: CliContext): Promise<void> {
  const inputPath = args.positionals[0] ?? readOptionalStringFlag(args, "input");
  if (!inputPath) {
    throw new Error("translate-dataset requires a dataset path or --input <path>.");
  }

  const outputPath = readRequiredStringFlag(args, "out");
  const targetLocale = readRequiredStringFlag(args, "target-locale");
  const sourceLocale = readOptionalStringFlag(args, "source-locale");
  const strategy = readTranslationStrategyChoice(args, "strategy", "local-pseudo", config.providers.translation);
  const force = readBooleanFlag(args, "force");
  const adapter = createCliTranslationAdapter(args, config, strategy);

  const contents = await readFile(inputPath, "utf8");
  const result = await translateOpenAIJsonl(contents, {
    targetLocale,
    ...(sourceLocale ? { sourceLocale } : {}),
    ...(adapter ? { adapter } : {}),
  });

  await writeBatchFile(outputPath, result.jsonl, force);

  const validation = validateOpenAIJsonl(result.jsonl);
  console.log(`Wrote translated dataset to ${outputPath}`);
  console.log(`Status: experimental`);
  console.log(`Provider: ${result.provider}`);
  console.log(`Request path: ${result.requestPath}`);
  if (adapter?.model) {
    console.log(`Translation model: ${adapter.model}`);
  }
  console.log(`Target locale: ${targetLocale}`);
  printDatasetSummary(validation.summary);
}

async function readCliWorkflowConfig(args: ParsedArgs): Promise<CliWorkflowConfig> {
  const configPath = readOptionalStringFlag(args, "config");
  const providerConfigPath = readOptionalStringFlag(args, "provider-config");
  const config: CliWorkflowConfig = { providers: {} };

  if (configPath) {
    const parsed = JSON.parse(await readFile(configPath, "utf8")) as unknown;
    if (isRecord(parsed) && "scenario" in parsed) {
      config.scenario = parsed.scenario;
      config.providers = mergeProviderConfig(config.providers, readProviderRuntimeSelections(parsed.providers));
    }
  }

  if (providerConfigPath) {
    const parsed = JSON.parse(await readFile(providerConfigPath, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("--provider-config must point to a JSON object.");
    }

    config.providers = mergeProviderConfig(config.providers, readProviderRuntimeSelections(parsed.providers ?? parsed));
  }

  return config;
}

async function readScenarioSource(args: ParsedArgs, config: CliWorkflowConfig): Promise<ScenarioSource> {
  const profileId = readOptionalStringFlag(args, "profile");
  const configPath = readOptionalStringFlag(args, "config");

  if (profileId && configPath) {
    throw new Error("Use either --profile or --config, not both.");
  }

  if (profileId) {
    return loadScenarioSource({ bundledProfileId: profileId });
  }

  if (config.scenario !== undefined) {
    const metadata = configPath ? { metadata: { configPath } satisfies JsonObject } : {};
    if (typeof config.scenario === "string") {
      return loadScenarioSource({ bundledProfileId: config.scenario, ...metadata });
    }

    return loadScenarioSource({ json: JSON.stringify(config.scenario), ...metadata });
  }

  if (!configPath) {
    throw new Error("A scenario source is required. Use --profile <id> or --config <path>.");
  }

  const contents = await readFile(configPath, "utf8");
  const parsed = JSON.parse(contents) as unknown;

  if (isRecord(parsed) && "scenario" in parsed) {
    const scenarioValue = parsed.scenario;

    if (typeof scenarioValue === "string") {
      return loadScenarioSource({ bundledProfileId: scenarioValue });
    }

    return loadScenarioSource({ json: JSON.stringify(scenarioValue), metadata: { configPath } });
  }

  return loadScenarioSource({ json: contents, metadata: { configPath } });
}

function readProviderRuntimeSelections(value: unknown): CliWorkflowConfig["providers"] {
  const providers: CliWorkflowConfig["providers"] = {};
  if (value === undefined) {
    return providers;
  }

  if (!isRecord(value)) {
    throw new Error("Provider config must be a JSON object.");
  }

  for (const prefix of ["persona", "simulation", "translation"] as const) {
    const runtime = value[prefix];
    if (runtime !== undefined) {
      providers[prefix] = parseCliProviderRuntimeConfig(runtime, prefix);
    }
  }

  return providers;
}

function parseCliProviderRuntimeConfig(value: unknown, prefix: ProviderRuntimePrefix): CliProviderRuntimeConfigInput {
  if (!isRecord(value)) {
    throw new Error(`Provider config for ${prefix} must be a JSON object.`);
  }

  const provider = readOptionalConfigString(value, "provider", prefix);
  if (provider !== undefined && !isAllowedProviderForPrefix(provider, prefix)) {
    const allowed = prefix === "translation" ? "local-pseudo, openai, or anthropic" : "deterministic, openai, or anthropic";
    throw new Error(`Provider config for ${prefix}.provider must be ${allowed}.`);
  }

  const config: CliProviderRuntimeConfigInput = {};
  if (provider !== undefined) {
    config.provider = provider;
  }

  const model = readOptionalConfigString(value, "model", prefix);
  if (model !== undefined) {
    config.model = model;
  }

  const apiKeyEnv = readOptionalConfigString(value, "apiKeyEnv", prefix);
  if (apiKeyEnv !== undefined) {
    config.apiKeyEnv = apiKeyEnv;
  }

  const baseUrl = readOptionalConfigString(value, "baseUrl", prefix);
  if (baseUrl !== undefined) {
    config.baseUrl = baseUrl;
  }

  if (value.temperature !== undefined) {
    if (typeof value.temperature !== "number") {
      throw new Error(`Provider config for ${prefix}.temperature must be a number.`);
    }
    config.temperature = value.temperature;
  }

  if (value.maxOutputTokens !== undefined) {
    const maxOutputTokens = value.maxOutputTokens;
    if (typeof maxOutputTokens !== "number" || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1) {
      throw new Error(`Provider config for ${prefix}.maxOutputTokens must be a positive integer.`);
    }
    config.maxOutputTokens = maxOutputTokens;
  }

  if (value.headers !== undefined) {
    config.headers = parseStringRecord(value.headers, `${prefix}.headers`);
  }

  if (value.metadata !== undefined) {
    if (!isJsonObject(value.metadata)) {
      throw new Error(`Provider config for ${prefix}.metadata must be a JSON object.`);
    }
    config.metadata = value.metadata;
  }

  return config;
}

function isAllowedProviderForPrefix(provider: string, prefix: ProviderRuntimePrefix): boolean {
  if (prefix === "translation") {
    return provider === "local-pseudo" || provider === "openai" || provider === "anthropic";
  }

  return provider === "deterministic" || provider === "openai" || provider === "anthropic";
}

function mergeProviderConfig(
  base: CliWorkflowConfig["providers"],
  next: CliWorkflowConfig["providers"],
): CliWorkflowConfig["providers"] {
  return {
    ...base,
    ...next,
  };
}

function readOptionalConfigString(
  value: Record<string, unknown>,
  key: string,
  prefix: ProviderRuntimePrefix,
): string | undefined {
  const raw = value[key];
  if (raw === undefined) {
    return undefined;
  }

  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(`Provider config for ${prefix}.${key} must be a non-empty string.`);
  }

  return raw;
}

function parseStringRecord(value: unknown, label: string): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error(`Provider config for ${label} must be a JSON object.`);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (typeof entry !== "string") {
        throw new Error(`Provider config for ${label}.${key} must be a string.`);
      }
      return [key, entry];
    }),
  );
}

function isJsonObject(value: unknown): value is JsonObject {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isJsonObject(value);
}

async function writeBatchFile(outputPath: string, contents: string, force: boolean): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, contents, { flag: force ? "w" : "wx" });
}

function printDatasetSummary(summary: {
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  messageCount: number;
  toolCallCount: number;
  toolResultCount: number;
  rowsWithTools: number;
  averageMessagesPerRow: number;
  languageCounts: Record<string, number>;
}): void {
  console.log(`Rows: ${summary.rowCount}`);
  console.log(`Valid rows: ${summary.validRowCount}`);
  console.log(`Invalid rows: ${summary.invalidRowCount}`);
  console.log(`Messages: ${summary.messageCount}`);
  console.log(`Tool calls: ${summary.toolCallCount}`);
  console.log(`Tool results: ${summary.toolResultCount}`);
  console.log(`Rows with tools: ${summary.rowsWithTools}`);
  console.log(`Average messages per row: ${summary.averageMessagesPerRow.toFixed(2)}`);

  const languageEntries = Object.entries(summary.languageCounts);
  if (languageEntries.length > 0) {
    console.log(`Languages: ${languageEntries.map(([locale, count]) => `${locale}=${count}`).join(", ")}`);
  }
}

function parseArgs(rawArgs: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg) {
      continue;
    }

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const flag = arg.slice(2);
    const next = rawArgs[index + 1];
    if (next && !next.startsWith("--")) {
      flags[flag] = next;
      index += 1;
    } else {
      flags[flag] = true;
    }
  }

  return { positionals, flags };
}

function readExportMode(args: ParsedArgs): ExportMode | undefined {
  const value = readOptionalStringFlag(args, "mode");
  if (!value) {
    return undefined;
  }

  if (value !== "plain_chat" && value !== "tool_decision" && value !== "full_tool_trajectory") {
    throw new Error("--mode must be plain_chat, tool_decision, or full_tool_trajectory.");
  }

  return value;
}

function readDeterministicProviderChoice(
  args: ParsedArgs,
  name: string,
  fallback: DeterministicProviderChoice,
  config?: CliProviderRuntimeConfigInput,
): DeterministicProviderChoice {
  const value = readOptionalStringFlag(args, name) ?? config?.provider ?? fallback;
  if (value !== "deterministic" && value !== "openai" && value !== "anthropic") {
    throw new Error(`--${name} must be openai, anthropic, or deterministic.`);
  }

  return value;
}

function readTranslationStrategyChoice(
  args: ParsedArgs,
  name: string,
  fallback: TranslationStrategyChoice,
  config?: CliProviderRuntimeConfigInput,
): TranslationStrategyChoice {
  const value = readOptionalStringFlag(args, name) ?? config?.provider ?? fallback;
  if (value !== "local-pseudo" && value !== "openai" && value !== "anthropic") {
    throw new Error(`--${name} must be local-pseudo, openai, or anthropic.`);
  }

  return value;
}

function createCliPersonaGenerator(
  args: ParsedArgs,
  config: CliWorkflowConfig,
  provider: DeterministicProviderChoice,
): PersonaGenerator {
  if (provider === "deterministic") {
    return createDeterministicPersonaGenerator();
  }

  const runtimeConfig = validateExplicitProviderRuntime(args, config, provider, "persona");
  return createModelBackedPersonaGenerator({
    modelClient: createModelClientFromConfig(runtimeConfig),
    provider,
    model: runtimeConfig.model,
    ...(runtimeConfig.temperature !== undefined ? { temperature: runtimeConfig.temperature } : {}),
  });
}

function createCliSimulationRunner(
  args: ParsedArgs,
  config: CliWorkflowConfig,
  provider: DeterministicProviderChoice,
): SimulationRunner {
  if (provider === "deterministic") {
    return createDeterministicSimulationRunner();
  }

  const runtimeConfig = validateExplicitProviderRuntime(args, config, provider, "simulation");
  return createModelBackedSimulationRunner({
    modelClient: createModelClientFromConfig(runtimeConfig),
    provider,
    model: runtimeConfig.model,
    ...(runtimeConfig.temperature !== undefined ? { temperature: runtimeConfig.temperature } : {}),
  });
}

function createCliTranslationAdapter(
  args: ParsedArgs,
  config: CliWorkflowConfig,
  strategy: TranslationStrategyChoice,
) {
  if (strategy === "local-pseudo") {
    return undefined;
  }

  const runtimeConfig = validateExplicitProviderRuntime(args, config, strategy, "translation");
  const modelClient = createModelClientFromConfig(runtimeConfig);

  if (strategy === "openai") {
    return createOpenAITranslationAdapter(modelClient, runtimeConfig.model);
  }

  return createAnthropicTranslationAdapter(modelClient, runtimeConfig.model);
}

function validateExplicitProviderRuntime(
  args: ParsedArgs,
  config: CliWorkflowConfig,
  provider: CliProviderKind,
  prefix: ProviderRuntimePrefix,
): ProviderRuntimeConfig {
  const configRuntime = config.providers[prefix];
  const model = readOptionalStringFlag(args, `${prefix}-model`) ?? configRuntime?.model;
  if (!model) {
    throw new Error(`Missing required --${prefix}-model <model> for ${provider} provider.`);
  }

  const apiKeyEnv =
    readOptionalStringFlag(args, `${prefix}-api-key-env`) ??
    configRuntime?.apiKeyEnv ??
    defaultApiKeyEnvForProvider(provider);
  if (!apiKeyEnv) {
    throw new Error(`Missing required --${prefix}-api-key-env <ENV_NAME> for ${provider} provider.`);
  }

  const runtimeConfig: ProviderRuntimeConfig = {
    provider,
    model,
    apiKeyEnv,
    ...(configRuntime?.baseUrl ? { baseUrl: configRuntime.baseUrl } : {}),
    ...(configRuntime?.temperature !== undefined ? { temperature: configRuntime.temperature } : {}),
    ...(configRuntime?.maxOutputTokens !== undefined ? { maxOutputTokens: configRuntime.maxOutputTokens } : {}),
    ...(configRuntime?.headers ? { headers: configRuntime.headers } : {}),
    ...(configRuntime?.metadata ? { metadata: configRuntime.metadata } : {}),
  };

  resolveProviderClientOptions(runtimeConfig);
  return runtimeConfig;
}

function readRequiredStringFlag(args: ParsedArgs, name: string): string {
  const value = readOptionalStringFlag(args, name);
  if (!value) {
    throw new Error(`Missing required --${name} <value>.`);
  }

  return value;
}

function readOptionalStringFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}

function readBooleanFlag(args: ParsedArgs, name: string): boolean {
  return args.flags[name] === true;
}

function readOptionalIntegerFlag(args: ParsedArgs, name: string): number | undefined {
  const value = readOptionalStringFlag(args, name);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer.`);
  }

  return parsed;
}

function printHelp(): void {
  console.log("Usage: finetuning <command> [options]");
  console.log("Defaults are offline: deterministic generation and local-pseudo translation require no API keys.");
  console.log("");
  console.log("Commands:");

  for (const command of cliCommands) {
    console.log(`  ${command.name.padEnd(18)} ${command.status.padEnd(12)} ${command.description}`);
  }

  console.log("");
  console.log("Bundled scenario profiles:");
  for (const profile of bundledScenarioProfiles) {
    console.log(`  ${profile.id.padEnd(24)} ${profile.business.domain.padEnd(12)} ${profile.name}`);
  }

  console.log("");
  console.log("Run finetuning <command> --help for command options.");
}

function printCommandHelp(commandName: string): void {
  switch (commandName) {
    case "generate-personas":
      console.log(
        "Usage: finetuning generate-personas (--profile <id> | --config <path>) --out <path> [--count <n>] [--provider-config <path>] [--persona-provider deterministic|openai|anthropic] [--persona-model <model>] [--persona-api-key-env <ENV_NAME>] [--force]",
      );
      console.log("Default: --persona-provider deterministic, no API key required.");
      console.log("Provider-backed personas require --persona-provider, a model, and an API key env var.");
      console.log("Config: --provider-config can provide providers.persona; CLI flags override config values.");
      return;
    case "simulate-dataset":
      console.log(
        "Usage: finetuning simulate-dataset (--profile <id> | --config <path>) --out <path> [--limit <n>] [--mode <mode>] [--provider-config <path>] [--simulation-provider deterministic|openai|anthropic] [--simulation-model <model>] [--simulation-api-key-env <ENV_NAME>] [--force]",
      );
      console.log("Modes: plain_chat, tool_decision, full_tool_trajectory");
      console.log("Default: --simulation-provider deterministic, no API key required.");
      console.log("Provider-backed simulation requires --simulation-provider, a model, and an API key env var.");
      console.log("Config: --provider-config can provide providers.simulation; CLI flags override config values.");
      return;
    case "validate-dataset":
      console.log("Usage: finetuning validate-dataset <path>");
      return;
    case "translate-dataset":
      console.log(
        "Usage: finetuning translate-dataset <path> --target-locale <bcp47> --out <path> [--source-locale <bcp47>] [--provider-config <path>] [--strategy local-pseudo|openai|anthropic] [--translation-model <model>] [--translation-api-key-env <ENV_NAME>] [--force]",
      );
      console.log("Status: experimental.");
      console.log("Default: --strategy local-pseudo, no API key required.");
      console.log("Provider-backed translation requires --strategy openai|anthropic, a model, and an API key env var.");
      console.log("Default env vars: OPENAI_API_KEY for openai, ANTHROPIC_API_KEY for anthropic.");
      console.log("Config: --provider-config can provide providers.translation; CLI flags override config values.");
      return;
    case "convert-logs":
      console.log("Usage: finetuning convert-logs");
      console.log("Status: deferred; no v1 log-derived dataset converter is implemented.");
      console.log(`Reason: ${deferredLogConversionBoundary.reason}`);
      console.log("Required before release:");
      for (const requirement of deferredLogConversionBoundary.requiredBeforeRelease) {
        console.log(`  - ${requirement}`);
      }
      return;
    default:
      printHelp();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
