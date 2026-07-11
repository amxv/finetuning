import { access, readFile, rm } from "node:fs/promises";
import process from "node:process";
import type { DatasetExampleV1 } from "../core/canonical.js";
import type { JsonValue } from "../core/model.js";
import { AttemptLedger, LocalDagExecutor, freezeDataset } from "../orchestration/index.js";
import { parseArgs, readBooleanFlag, readOptionalStringFlag, readRequiredStringFlag } from "./argv.js";

export async function runNounCommand(noun: string, rawArgs: string[]): Promise<boolean> {
  if (noun !== "dataset" && noun !== "pipeline") return false;
  const [verb, ...verbArgs] = rawArgs;
  if (!verb || verb === "--help" || verb === "-h") {
    printNounHelp(noun);
    return true;
  }
  const args = parseArgs(verbArgs);
  if (readBooleanFlag(args, "help")) {
    printVerbHelp(noun, verb);
    return true;
  }
  if (noun === "dataset" && verb === "freeze") {
    await datasetFreeze(args);
    return true;
  }
  if (noun === "pipeline" && verb === "status") {
    await pipelineStatus(args);
    return true;
  }
  if (noun === "pipeline" && verb === "resume") {
    await pipelineResume(args);
    return true;
  }
  throw new Error(`Unknown command: ${noun} ${verb}`);
}

async function datasetFreeze(args: ReturnType<typeof parseArgs>): Promise<void> {
  const input = args.positionals[0] ?? readRequiredStringFlag(args, "input");
  const output = readRequiredStringFlag(args, "out");
  const force = readBooleanFlag(args, "force");
  if (!force) {
    try {
      await access(output);
      throw new Error(`Output directory already exists: ${output}. Use --force to replace it.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  } else await rm(output, { recursive: true, force: true });
  const records = (await readFile(input, "utf8"))
    .split("\n")
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as DatasetExampleV1;
      } catch (error) {
        throw new Error(
          `Malformed canonical JSONL at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  const manifest = await freezeDataset(output, records);
  if (readBooleanFlag(args, "json")) console.log(JSON.stringify(manifest));
  else
    console.log(
      `Frozen ${manifest.recordCount} records to ${output}\nDataset: ${manifest.id}\nRecords hash: ${manifest.recordsHash}`,
    );
}

async function pipelineStatus(args: ReturnType<typeof parseArgs>): Promise<void> {
  const ledger = new AttemptLedger(readRequiredStringFlag(args, "ledger"));
  const state = await ledger.read(
    readRequiredStringFlag(args, "run-id"),
    readRequiredStringFlag(args, "stage-id"),
    readRequiredStringFlag(args, "record-id"),
  );
  if (readBooleanFlag(args, "json")) console.log(JSON.stringify(state));
  else
    console.log(
      `Run: ${state.runId}\nStage: ${state.stageId}\nRecord: ${state.recordId}\nAttempts: ${state.attempts.length}\nStatus: ${state.attempts.at(-1)?.status ?? "pending"}`,
    );
}

async function pipelineResume(args: ReturnType<typeof parseArgs>): Promise<void> {
  const root = readRequiredStringFlag(args, "root"),
    runId = readRequiredStringFlag(args, "run-id");
  const parsed = JSON.parse(await readFile(readRequiredStringFlag(args, "plan"), "utf8")) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.stages))
    throw new Error("Pipeline plan must be an object with a stages array.");
  const stages = parsed.stages.map((stage, index) => {
    if (!isRecord(stage) || typeof stage.id !== "string" || stage.kind !== "constant" || !("value" in stage))
      throw new Error(`Unsupported pipeline stage at stages[${index}]; only kind \"constant\" is supported.`);
    const value = stage.value as JsonValue;
    return {
      id: stage.id,
      kind: stage.kind,
      implementationVersion: typeof stage.implementationVersion === "string" ? stage.implementationVersion : "1",
      ...(Array.isArray(stage.dependencies)
        ? { dependencies: stage.dependencies.filter((item): item is string => typeof item === "string") }
        : {}),
      ...(isJsonValue(stage.config) ? { config: stage.config } : {}),
      async execute() {
        return value;
      },
    };
  });
  const outputs = await new LocalDagExecutor(root).run(runId, stages);
  const result = { runId, outputs: Object.fromEntries(outputs) };
  if (readBooleanFlag(args, "json")) console.log(JSON.stringify(result));
  else console.log(`Resumed pipeline ${runId}\nCompleted stages: ${outputs.size}`);
}

export function printNounRootHelp(): void {
  console.log(
    "\nNoun-oriented local commands:\n  dataset freeze       Freeze canonical JSONL into an immutable dataset directory.\n  pipeline status      Read local stage-attempt status without mutation.\n  pipeline resume      Resume a declarative local constant-stage plan.",
  );
}
function printNounHelp(noun: string): void {
  console.log(
    noun === "dataset"
      ? "Usage: finetuning dataset freeze <canonical.jsonl> --out <directory> [--force] [--json]"
      : "Usage: finetuning pipeline status|resume [options]",
  );
}
function printVerbHelp(noun: string, verb: string): void {
  if (noun === "dataset" && verb === "freeze") return printNounHelp(noun);
  if (verb === "status")
    console.log(
      "Usage: finetuning pipeline status --ledger <path> --run-id <id> --stage-id <id> --record-id <id> [--json]",
    );
  else if (verb === "resume")
    console.log("Usage: finetuning pipeline resume --root <directory> --run-id <id> --plan <plan.json> [--json]");
  else throw new Error(`Unknown command: ${noun} ${verb}`);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
