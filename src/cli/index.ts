#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";
import {
  buildOpenAIFineTuningRow,
  bundledScenarioProfiles,
  cliCommands,
  createDeterministicPersonaGenerator,
  createDeferredLogConversionError,
  createModelBackedPersonaGenerator,
  createModelClientFromConfig,
  deferredLogConversionBoundary,
  defaultApiKeyEnvForProvider,
  loadScenarioSource,
  ProviderUnsupportedFeatureError,
  resolveProviderClientOptions,
  serializeOpenAIJsonlRows,
  summarizeOpenAIJsonlRows,
  translateOpenAIJsonl,
  validateOpenAIJsonl,
  type ConversationMessage,
  type ConversationTrajectory,
  type ExportMode,
  type JsonObject,
  type JsonSchemaValue,
  type OpenAIChatFineTuningRow,
  type PersonaGenerator,
  type PersonaDefinition,
  type ProviderRuntimeConfig,
  type ScenarioDefinition,
  type ScenarioSource,
  type ToolSchema,
} from "../index.js";

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

interface CliContext {
  args: ParsedArgs;
}

type CliProviderKind = "openai" | "anthropic";
type DeterministicProviderChoice = CliProviderKind | "deterministic";
type TranslationStrategyChoice = "local-pseudo" | "openai" | "anthropic";

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

  const context: CliContext = { args };
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

async function generatePersonas({ args }: CliContext): Promise<void> {
  const scenario = await readScenarioSource(args);
  const outputPath = readRequiredStringFlag(args, "out");
  const force = readBooleanFlag(args, "force");
  const count = readOptionalIntegerFlag(args, "count") ?? scenario.definition.personaSource.count;
  const provider = readDeterministicProviderChoice(args, "persona-provider", "deterministic");

  const generator = createCliPersonaGenerator(args, provider);
  const personas = await generator.generate({ scenario, count });

  await writeBatchFile(outputPath, `${JSON.stringify(personas, null, 2)}\n`, force);

  console.log(`Wrote ${personas.length} personas to ${outputPath}`);
  console.log(`Scenario: ${scenario.definition.id} (${scenario.definition.name})`);
}

async function simulateDataset({ args }: CliContext): Promise<void> {
  const scenario = await readScenarioSource(args);
  const outputPath = readRequiredStringFlag(args, "out");
  const mode = readExportMode(args) ?? "full_tool_trajectory";
  const force = readBooleanFlag(args, "force");
  const count = readOptionalIntegerFlag(args, "limit") ?? scenario.definition.personaSource.count;
  const provider = readDeterministicProviderChoice(args, "simulation-provider", "deterministic");

  if (provider !== "deterministic") {
    validateExplicitProviderRuntime(args, provider, "simulation");
    throw new ProviderUnsupportedFeatureError(
      `${provider} simulation is not implemented in this phase; use --simulation-provider deterministic.`,
      { provider },
    );
  }

  const personas = await createDeterministicPersonaGenerator().generate({ scenario, count });
  const trajectories = buildDeterministicTrajectories(scenario.definition, personas, mode);
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

async function translateDataset({ args }: CliContext): Promise<void> {
  const inputPath = args.positionals[0] ?? readOptionalStringFlag(args, "input");
  if (!inputPath) {
    throw new Error("translate-dataset requires a dataset path or --input <path>.");
  }

  const outputPath = readRequiredStringFlag(args, "out");
  const targetLocale = readRequiredStringFlag(args, "target-locale");
  const sourceLocale = readOptionalStringFlag(args, "source-locale");
  const strategy = readTranslationStrategyChoice(args, "strategy", "local-pseudo");
  const force = readBooleanFlag(args, "force");

  if (strategy !== "local-pseudo") {
    validateExplicitProviderRuntime(args, strategy, "translation");
    throw new ProviderUnsupportedFeatureError(
      `${strategy} translation is not implemented in this phase; use --strategy local-pseudo.`,
      { provider: strategy },
    );
  }

  const contents = await readFile(inputPath, "utf8");
  const result = await translateOpenAIJsonl(contents, {
    targetLocale,
    ...(sourceLocale ? { sourceLocale } : {}),
  });

  await writeBatchFile(outputPath, result.jsonl, force);

  const validation = validateOpenAIJsonl(result.jsonl);
  console.log(`Wrote translated dataset to ${outputPath}`);
  console.log(`Status: experimental`);
  console.log(`Provider: ${result.provider}`);
  console.log(`Request path: ${result.requestPath}`);
  console.log(`Target locale: ${targetLocale}`);
  printDatasetSummary(validation.summary);
}

async function readScenarioSource(args: ParsedArgs): Promise<ScenarioSource> {
  const profileId = readOptionalStringFlag(args, "profile");
  const configPath = readOptionalStringFlag(args, "config");

  if (profileId && configPath) {
    throw new Error("Use either --profile or --config, not both.");
  }

  if (profileId) {
    return loadScenarioSource({ bundledProfileId: profileId });
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

function buildDeterministicTrajectories(
  scenario: ScenarioDefinition,
  personas: PersonaDefinition[],
  mode: ExportMode,
): ConversationTrajectory[] {
  return personas.map((persona, index) => {
    const tool = mode === "plain_chat" ? undefined : scenario.toolInventory.tools[index % scenario.toolInventory.tools.length];
    const messages: ConversationMessage[] = [
      {
        kind: "system",
        content: scenario.systemPrompt ?? `You are ${scenario.assistantRole} for ${scenario.business.name}.`,
      },
      {
        kind: "user",
        content: persona.goals[0] ?? `I need help from ${scenario.business.name}.`,
      },
    ];

    if (!tool) {
      messages.push({
        kind: "assistant_text",
        content: `I can help with that. ${scenario.conversationGoals[0] ?? "Here is the next step."}`,
      });
    } else {
      const callId = `call_${scenario.id.replaceAll("-", "_")}_${index + 1}`;
      messages.push(
        {
          kind: "assistant_tool_call",
          toolCalls: [
            {
              id: callId,
              name: tool.name,
              arguments: buildToolArguments(tool),
            },
          ],
        },
        {
          kind: "tool_result",
          result: {
            toolCallId: callId,
            name: tool.name,
            payloadFormat: "normalized_json",
            result: {
              scenarioId: scenario.id,
              personaId: persona.id,
              answer: `Deterministic sample result for ${tool.name}.`,
              source: "cli_sample_simulation",
            },
          },
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
      },
    };

    if (tool) {
      trajectory.tools = [tool];
    }

    return trajectory;
  });
}

function buildToolArguments(tool: ToolSchema): JsonObject {
  return Object.fromEntries(
    Object.entries(tool.parameters.properties).map(([key, value]) => [key, sampleJsonValue(value, key)]),
  ) as JsonObject;
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
): DeterministicProviderChoice {
  const value = readOptionalStringFlag(args, name) ?? fallback;
  if (value !== "deterministic" && value !== "openai" && value !== "anthropic") {
    throw new Error(`--${name} must be openai, anthropic, or deterministic.`);
  }

  return value;
}

function readTranslationStrategyChoice(
  args: ParsedArgs,
  name: string,
  fallback: TranslationStrategyChoice,
): TranslationStrategyChoice {
  const value = readOptionalStringFlag(args, name) ?? fallback;
  if (value !== "local-pseudo" && value !== "openai" && value !== "anthropic") {
    throw new Error(`--${name} must be local-pseudo, openai, or anthropic.`);
  }

  return value;
}

function createCliPersonaGenerator(args: ParsedArgs, provider: DeterministicProviderChoice): PersonaGenerator {
  if (provider === "deterministic") {
    return createDeterministicPersonaGenerator();
  }

  const config = validateExplicitProviderRuntime(args, provider, "persona");
  return createModelBackedPersonaGenerator({
    modelClient: createModelClientFromConfig(config),
    provider,
    model: config.model,
    ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
  });
}

function validateExplicitProviderRuntime(
  args: ParsedArgs,
  provider: CliProviderKind,
  prefix: "persona" | "simulation" | "translation",
): ProviderRuntimeConfig {
  const model = readOptionalStringFlag(args, `${prefix}-model`);
  if (!model) {
    throw new Error(`Missing required --${prefix}-model <model> for ${provider} provider.`);
  }

  const apiKeyEnv = readOptionalStringFlag(args, `${prefix}-api-key-env`) ?? defaultApiKeyEnvForProvider(provider);
  if (!apiKeyEnv) {
    throw new Error(`Missing required --${prefix}-api-key-env <ENV_NAME> for ${provider} provider.`);
  }

  const config: ProviderRuntimeConfig = {
    provider,
    model,
    apiKeyEnv,
  };

  resolveProviderClientOptions(config);
  return config;
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
        "Usage: finetuning generate-personas (--profile <id> | --config <path>) --out <path> [--count <n>] [--persona-provider deterministic|openai|anthropic] [--persona-model <model>] [--persona-api-key-env <ENV_NAME>] [--force]",
      );
      return;
    case "simulate-dataset":
      console.log(
        "Usage: finetuning simulate-dataset (--profile <id> | --config <path>) --out <path> [--limit <n>] [--mode <mode>] [--simulation-provider deterministic|openai|anthropic] [--simulation-model <model>] [--simulation-api-key-env <ENV_NAME>] [--force]",
      );
      console.log("Modes: plain_chat, tool_decision, full_tool_trajectory");
      return;
    case "validate-dataset":
      console.log("Usage: finetuning validate-dataset <path>");
      return;
    case "translate-dataset":
      console.log(
        "Usage: finetuning translate-dataset <path> --target-locale <bcp47> --out <path> [--source-locale <bcp47>] [--strategy local-pseudo|openai|anthropic] [--translation-model <model>] [--translation-api-key-env <ENV_NAME>] [--force]",
      );
      console.log("Status: experimental; provider-backed translation flags validate config before later adapter phases.");
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
