import { access, mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { DatasetExampleV1 } from "../core/canonical.js";
import type { JsonValue } from "../core/model.js";
import { AttemptLedger, LocalDagExecutor, freezeDataset } from "../orchestration/index.js";
import {
  DistillationPipeline,
  distillationDataset,
  loadDistillationState,
  planDistillation,
  saveDistillationState,
  type DistillationConfig,
  type DistillationProvider,
  type DistillationRunState,
} from "../distillation/index.js";
import { atomicWrite } from "../node/storage.js";
import { runPythonTrainer } from "../node/trainer.js";
import { inspectRecipe, inspectTemplate, preflightRecipe } from "../templates/index.js";
import { trainingSpecVersion, type TrainingSpecV1 } from "../training/index.js";
import {
  inspectQualificationRecipe,
  planRunPodSmoke,
  preflightQualification,
  qualificationRecipes,
  validateQualificationEvidence,
  type AuthorizationGates,
} from "../training/qualification.js";
import { parseArgs, readBooleanFlag, readOptionalStringFlag, readRequiredStringFlag } from "./argv.js";
import { runEmbedCommand } from "./embed-data.js";
import { runEmbedPhase13 } from "./embed-distill.js";
import { printEmbedHelp, runEmbedProduct } from "./embed-product.js";
import { runRunPodCommand } from "./runpod.js";
import { providerDistillation } from "./distill-provider.js";

export async function runNounCommand(noun: string, rawArgs: string[]): Promise<boolean> {
  if (noun === "recipes") {
    await runRecipeQualificationCommand(rawArgs);
    return true;
  }
  if (noun === "runpod") {
    await runRunPodCommand(rawArgs);
    return true;
  }
  if (noun === "embed") {
    if (!rawArgs.length || rawArgs[0] === "--help" || rawArgs[0] === "-h") printEmbedHelp();
    else if (rawArgs[0] === "data") await runEmbedCommand(rawArgs);
    else if (!(await runEmbedProduct(rawArgs))) await runEmbedPhase13(rawArgs);
    return true;
  }
  if (noun !== "dataset" && noun !== "pipeline" && noun !== "distill" && noun !== "template" && noun !== "training")
    return false;
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
  if (noun === "distill" && ["init", "plan", "responses", "resume", "status", "freeze"].includes(verb)) {
    await distillCommand(verb, args);
    return true;
  }
  if (noun === "template" && ["inspect", "render", "audit"].includes(verb)) {
    const id = readRequiredStringFlag(args, "id");
    if (verb === "render")
      throw new Error("Template rendering is Python-only and requires tokenizer.apply_chat_template");
    const descriptor = inspectTemplate(id);
    printResult(
      verb === "audit"
        ? {
            templateId: id,
            status: descriptor.liveAudit,
            executable: descriptor.expectedTemplateHash.status === "pinned",
            reason:
              descriptor.expectedTemplateHash.status === "unresolved"
                ? descriptor.expectedTemplateHash.reason
                : undefined,
          }
        : descriptor,
      args,
    );
    return true;
  }
  if (noun === "training" && verb === "prepare") {
    const recipeId = readRequiredStringFlag(args, "recipe"),
      dryRun = readBooleanFlag(args, "dry-run");
    if (recipeId !== "cpu-tiny-fixture") {
      if (!dryRun) preflightRecipe(recipeId);
      else inspectRecipe(recipeId);
    }
    const spec: TrainingSpecV1 = {
      trainingSpecVersion,
      runId: readRequiredStringFlag(args, "run-id"),
      dataset: {
        manifestPath: readRequiredStringFlag(args, "dataset-manifest"),
        recordsHash: readRequiredStringFlag(args, "records-hash"),
      },
      recipeId,
      outputDirectory: readRequiredStringFlag(args, "out"),
      objective: "sft",
      seed: Number(readOptionalStringFlag(args, "seed") ?? 0),
    };
    const specPath = readRequiredStringFlag(args, "spec-out");
    await atomicWrite(specPath, `${JSON.stringify(spec, null, 2)}\n`);
    printResult({ specPath, dryRun, executable: !dryRun }, args);
    return true;
  }
  if (noun === "training" && ["run", "resume", "status", "evaluate", "export"].includes(verb)) {
    const specPath = readRequiredStringFlag(args, "spec"),
      spec = JSON.parse(await readFile(specPath, "utf8")) as TrainingSpecV1;
    const runtimePath = `${specPath}.${verb}.json`;
    const checkpoint = readOptionalStringFlag(args, "checkpoint");
    if (verb === "resume" && !checkpoint) throw new Error("Training resume requires --checkpoint <path>.");
    await atomicWrite(
      runtimePath,
      `${JSON.stringify({ ...spec, operation: verb, ...(checkpoint ? { checkpointPath: checkpoint } : {}) }, null, 2)}\n`,
    );
    const result = await runPythonTrainer({
      pythonExecutable: readOptionalStringFlag(args, "python") ?? "python3",
      module: "amxv_finetuning_trainer.runner",
      specPath: resolve(runtimePath),
      cwd: resolve(readRequiredStringFlag(args, "python-root")),
    });
    printResult({ exitCode: result.exitCode, events: result.events, stderr: result.stderr }, args);
    if (result.exitCode !== 0)
      throw new Error(
        `Training ${verb} failed: ${result.stderr || result.events.at(-1)?.data?.message || "unknown error"}`,
      );
    return true;
  }
  throw new Error(`Unknown command: ${noun} ${verb}`);
}

async function runRecipeQualificationCommand(rawArgs: string[]): Promise<void> {
  const [verb, ...verbArgs] = rawArgs;
  if (!verb || verb === "--help" || verb === "-h") {
    console.log("Usage: finetuning recipes <list|inspect|preflight|plan|record-evidence> [options]");
    return;
  }
  const args = parseArgs(verbArgs);
  if (verb === "list") {
    printResult(
      qualificationRecipes.map(({ id, track, modelId, revision, qualification, blockers }) => ({
        id,
        track,
        modelId,
        revision,
        qualification,
        blockers,
      })),
      args,
    );
    return;
  }
  if (verb === "inspect") {
    printResult(inspectQualificationRecipe(readRequiredStringFlag(args, "recipe")), args);
    return;
  }
  if (verb === "plan") {
    printResult(planRunPodSmoke(readRequiredStringFlag(args, "recipe")), args);
    return;
  }
  if (verb === "preflight") {
    const authorizationPath = readOptionalStringFlag(args, "authorization");
    const gates = authorizationPath
      ? (JSON.parse(await readFile(authorizationPath, "utf8")) as Partial<AuthorizationGates>)
      : undefined;
    const result = preflightQualification(readRequiredStringFlag(args, "recipe"), gates);
    printResult(result, args);
    if (!result.executable && readBooleanFlag(args, "require-executable")) throw new Error(result.blockers.join("; "));
    return;
  }
  if (verb === "record-evidence") {
    const evidence = await validateQualificationEvidence(readRequiredStringFlag(args, "evidence"));
    printResult({ validated: true, evidence }, args);
    return;
  }
  throw new Error(`Unknown command: recipes ${verb}`);
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
    "\nNoun-oriented local commands:\n  dataset freeze       Freeze canonical JSONL into an immutable dataset directory.\n  embed data create|import|convert|validate|inspect|split|dedupe|freeze|export\n                        Process canonical/ST/HF embedding data without model recipe claims.\n  embed generate queries|documents|pairs | embed mine negatives\n  embed distill vectors|scores|rankings|plan|run|resume|status\n                        Run train-only embedding distillation workflows.\n  pipeline status      Read local stage-attempt status without mutation.\n  pipeline resume      Resume a declarative local constant-stage plan.\n  distill init|plan|responses|resume|status|freeze\n                        Run a compliant local response-distillation pipeline.\n  template inspect|render|audit\n                        Inspect late-bound template metadata and audit status.\n  training prepare|run|resume|status|evaluate|export\n                        Prepare and execute versioned local training runs.",
  );
}
function printNounHelp(noun: string): void {
  console.log(
    noun === "dataset"
      ? "Usage: finetuning dataset freeze <canonical.jsonl> --out <directory> [--force] [--json]"
      : noun === "distill"
        ? "Usage: finetuning distill init|plan|responses|resume|status|freeze [options]"
        : noun === "template"
          ? "Usage: finetuning template inspect|render|audit --id <template> [--json]"
          : noun === "training"
            ? "Usage: finetuning training prepare|run|resume|status|evaluate|export [options]"
            : "Usage: finetuning pipeline status|resume [options]",
  );
}

interface DistillProject {
  config: DistillationConfig;
  input: string;
}
async function distillCommand(verb: string, args: ReturnType<typeof parseArgs>): Promise<void> {
  const root = readRequiredStringFlag(args, "root"),
    projectPath = `${root}/distillation-project.json`;
  if (verb === "init") {
    if (!readBooleanFlag(args, "force")) {
      try {
        await access(projectPath);
        throw new Error(`Distillation project already exists: ${root}. Use --force to replace it.`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const project: DistillProject = {
      config: JSON.parse(await readFile(readRequiredStringFlag(args, "config"), "utf8")) as DistillationConfig,
      input: readRequiredStringFlag(args, "input"),
    };
    planDistillation(await readCanonical(project.input), project.config);
    await mkdir(root, { recursive: true });
    await atomicWrite(projectPath, `${JSON.stringify(project, null, 2)}\n`);
    return printResult({ root, runId: project.config.runId, initialized: true }, args);
  }
  const project = JSON.parse(await readFile(projectPath, "utf8")) as DistillProject;
  if (verb === "plan") return printResult(planDistillation(await readCanonical(project.input), project.config), args);
  if (verb === "status") {
    const state = await loadDistillationState(root);
    return printResult(
      {
        runId: state.config.runId,
        completedStages: state.completedStages,
        recordCount: state.records.length,
        candidateCount: state.records.reduce((n, r) => n + r.candidates.length, 0),
        costs: state.costs,
      },
      args,
    );
  }
  if (verb === "freeze") {
    const output = readRequiredStringFlag(args, "out");
    if (!readBooleanFlag(args, "force")) {
      try {
        await access(output);
        throw new Error(`Output directory already exists: ${output}. Use --force to replace it.`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    } else await rm(output, { recursive: true, force: true });
    const manifest = await freezeDataset(output, distillationDataset(await loadDistillationState(root)));
    return printResult(manifest, args);
  }
  let previous: DistillationRunState | undefined;
  try {
    previous = await loadDistillationState(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!readBooleanFlag(args, "offline-fake") && !readBooleanFlag(args, "allow-network"))
    throw new Error("DISTILL_NETWORK_OPT_IN_REQUIRED: choose --offline-fake or pass --allow-network");
  const providers = readBooleanFlag(args, "offline-fake")
    ? deterministicProvider()
    : providerDistillation(project.config, {
        network: true,
        generationCredentialEnv: readRequiredStringFlag(args, "generation-credential-env"),
        judgingCredentialEnv: readRequiredStringFlag(args, "judging-credential-env"),
        generationBudget: Number(readRequiredStringFlag(args, "generation-budget-usd")),
        judgingBudget: Number(readRequiredStringFlag(args, "judging-budget-usd")),
        generationInputPerMillion: Number(readRequiredStringFlag(args, "generation-input-per-million-usd")),
        generationOutputPerMillion: Number(readRequiredStringFlag(args, "generation-output-per-million-usd")),
        judgingInputPerMillion: Number(readRequiredStringFlag(args, "judging-input-per-million-usd")),
        judgingOutputPerMillion: Number(readRequiredStringFlag(args, "judging-output-per-million-usd")),
        generationSpent: previous?.costs.generator.cost ?? 0,
        judgingSpent: previous?.costs.judge.cost ?? 0,
      });
  const pipeline = new DistillationPipeline(
    providers.generator,
    providers.judge,
    undefined,
    () => new Date(0).toISOString(),
    (state) => saveDistillationState(root, state),
  );
  const state = await pipeline.run(await readCanonical(project.input), project.config, previous);
  await saveDistillationState(root, state);
  printResult(
    {
      runId: state.config.runId,
      completedStages: state.completedStages,
      candidateCount: state.records.reduce((n, r) => n + r.candidates.length, 0),
      costs: state.costs,
    },
    args,
  );
}
async function readCanonical(path: string): Promise<DatasetExampleV1[]> {
  return (await readFile(path, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DatasetExampleV1);
}
function deterministicProvider(): { generator: DistillationProvider; judge: DistillationProvider } {
  const make = (judge: boolean): DistillationProvider => ({
    async generate(request) {
      const content = judge
        ? JSON.stringify({ quality: 0.9, correctness: 0.8, safety: 1, style: 0.7 })
        : `Deterministic response for ${request.sampleId}`;
      return {
        requestId: request.requestId,
        sampleId: request.sampleId,
        provider: "custom",
        model: "offline-fake",
        candidates: [
          {
            response: { kind: "text", content },
            finishReason: "stop",
            ...(judge ? { parsed: JSON.parse(content) } : {}),
          },
        ],
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, cost: judge ? 0.002 : 0.001, currency: "USD" },
        retries: [],
        cached: false,
      };
    },
  });
  return { generator: make(false), judge: make(true) };
}
function printResult(value: unknown, args: ReturnType<typeof parseArgs>): void {
  console.log(readBooleanFlag(args, "json") ? JSON.stringify(value) : JSON.stringify(value, null, 2));
}
function printVerbHelp(noun: string, verb: string): void {
  if (noun === "dataset" && verb === "freeze") return printNounHelp(noun);
  const usage: Record<string, string> = {
    "distill.init":
      "Usage: finetuning distill init --root <dir> --config <config.json> --input <canonical.jsonl> [--force] [--json]",
    "distill.plan": "Usage: finetuning distill plan --root <dir> [--json]",
    "distill.responses":
      "Usage: finetuning distill responses --root <dir> (--offline-fake | --allow-network --generation-credential-env <ENV> --judging-credential-env <ENV> --generation-budget-usd <USD> --judging-budget-usd <USD> --generation-input-per-million-usd <USD> --generation-output-per-million-usd <USD> --judging-input-per-million-usd <USD> --judging-output-per-million-usd <USD>) [--json]",
    "distill.resume":
      "Usage: finetuning distill resume --root <dir> (--offline-fake | --allow-network --generation-credential-env <ENV> --judging-credential-env <ENV> --generation-budget-usd <USD> --judging-budget-usd <USD> --generation-input-per-million-usd <USD> --generation-output-per-million-usd <USD> --judging-input-per-million-usd <USD> --judging-output-per-million-usd <USD>) [--json]",
    "distill.status": "Usage: finetuning distill status --root <dir> [--json]",
    "distill.freeze": "Usage: finetuning distill freeze --root <dir> --out <dir> [--force] [--json]",
    "training.prepare": "Usage: finetuning training prepare --spec <training-spec.json> [--json]",
    "training.run": "Usage: finetuning training run --spec <training-spec.json> --python <executable> [--json]",
    "training.resume": "Usage: finetuning training resume --spec <training-spec.json> --checkpoint <path> [--json]",
    "training.status": "Usage: finetuning training status --spec <training-spec.json> [--json]",
    "training.evaluate": "Usage: finetuning training evaluate --spec <training-spec.json> [--json]",
    "training.export": "Usage: finetuning training export --spec <training-spec.json> [--json]",
  };
  if (usage[`${noun}.${verb}`]) {
    console.log(usage[`${noun}.${verb}`]);
    return;
  }
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
