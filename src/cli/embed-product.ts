import {
  EmbeddingEvaluator,
  embeddingModelRegistry,
  embeddingRecipeRegistry,
  EmbeddingTrainingRun,
  inspectEmbeddingArtifact,
  type EmbeddingEvaluationSpecV1,
  type EmbeddingTrainingSpecV1,
} from "../embeddings/index.js";
import { parseArgs, readBooleanFlag, readOptionalStringFlag, readRequiredStringFlag } from "./argv.js";
import { resolveEmbedConfig } from "./embed-config.js";
import { atomicWrite } from "../node/storage.js";
import { runPythonEmbeddingTrainer } from "../node/embedding-trainer.js";
import { join, resolve } from "node:path";
const hierarchy = {
  models: ["list", "info", "license", "compat"],
  recipes: ["list", "show", "lock"],
  train: ["init", "validate", "estimate", "run", "resume", "status", "evaluate", "export", "inspect"],
  evaluate: ["run", "compare", "inspect"],
} as const;
export function printEmbedHelp(): void {
  console.log(
    `Usage: finetuning embed <noun> <command> [options]\n\nData: data create|import|convert|validate|inspect|split|dedupe|freeze|export\nGenerate: generate queries|documents|pairs\nMine: mine negatives\nDistill: distill vectors|scores|rankings|plan|run|resume|status\nModels: models list|info|license|compat\nRecipes: recipes list|show|lock\nTrain: train init|validate|estimate|run|resume|status|evaluate|export|inspect\nEvaluate: evaluate run|compare|inspect\n\nExamples:\n  finetuning embed data import pairs.jsonl --task pair --columns query=query,document=document --dry-run --json\n  finetuning embed mine negatives corpus.jsonl --dry-run --json\n  finetuning embed distill scores --config embed.json --input pairs.jsonl --dry-run --json\n  finetuning embed train estimate --config embed-training.json --json\n  finetuning embed evaluate run --config evaluation.json --dry-run --json\n  finetuning embed train resume --config embed-training.json --checkpoint checkpoint.json --dry-run\n  finetuning embed train export --config embed-training.json --dry-run`,
  );
}
export async function runEmbedProduct(raw: string[]): Promise<boolean> {
  const [noun, verb, ...rest] = raw;
  if (!noun || noun === "--help" || noun === "-h") {
    printEmbedHelp();
    return true;
  }
  if (!(noun in hierarchy)) return false;
  const allowed = hierarchy[noun as keyof typeof hierarchy] as readonly string[];
  if (!verb || verb === "--help" || verb === "-h") {
    console.log(
      `Usage: finetuning embed ${noun} ${allowed.join("|")} [--config <path>] [--json] [--quiet] [--dry-run]`,
    );
    return true;
  }
  if (!allowed.includes(verb)) throw new Error(`Unknown command: embed ${noun} ${verb}`);
  const a = parseArgs(rest);
  if (readBooleanFlag(a, "help")) {
    console.log(`Usage: finetuning embed ${noun} ${verb} [--config <path>] [--json] [--quiet] [--dry-run]`);
    return true;
  }
  const quiet = readBooleanFlag(a, "quiet"),
    json = readBooleanFlag(a, "json"),
    dry = readBooleanFlag(a, "dry-run");
  const print = (x: unknown) => {
    if (!quiet) console.log(json ? JSON.stringify(x) : JSON.stringify(x, null, 2));
  };
  if (noun === "models") {
    const id = readOptionalStringFlag(a, "id");
    print({ operation: verb, models: id ? [embeddingModelRegistry.get(id)] : embeddingModelRegistry.list() });
    return true;
  }
  if (noun === "recipes") {
    const id = readOptionalStringFlag(a, "id");
    print({ operation: verb, recipes: id ? [embeddingRecipeRegistry.get(id)] : embeddingRecipeRegistry.list() });
    return true;
  }
  readRequiredStringFlag(a, "config");
  const config = await resolveEmbedConfig(`${noun}.${verb}`, a),
    value = config.resolved;
  if (noun === "train") {
    if (verb === "inspect" && readOptionalStringFlag(a, "artifact")) {
      print(await inspectEmbeddingArtifact(readRequiredStringFlag(a, "artifact")));
      return true;
    }
    const run = new EmbeddingTrainingRun(value as unknown as EmbeddingTrainingSpecV1),
      plan = run.plan();
    let execution;
    if (["run", "resume", "status", "export", "inspect"].includes(verb) && !dry) {
      if (value.recipeId !== "cpu-tiny-embedding-fixture") await run.run();
      const spec = {
        ...value,
        operation: verb,
        ...(typeof value["checkpoint"] === "string" ? { checkpointPath: value["checkpoint"] } : {}),
        ...(typeof value["artifact"] === "string" ? { artifactPath: value["artifact"] } : {}),
      };
      const specPath = join(String(value.outputDirectory), `.embedding-${verb}.json`);
      await atomicWrite(specPath, JSON.stringify(spec, null, 2) + "\n");
      execution = await runPythonEmbeddingTrainer({
        pythonExecutable: typeof value.python === "string" ? value.python : "python3",
        specPath: resolve(specPath),
        cwd: resolve(typeof value["python-root"] === "string" ? value["python-root"] : "python"),
      });
      if (execution.exitCode !== 0)
        throw new Error(
          execution.stderr || String(execution.events.at(-1)?.data?.message ?? "Embedding trainer failed"),
        );
    }
    print({
      operation: verb,
      dryRun: dry,
      resolvedConfig: value,
      environmentReferences: config.environmentReferences,
      ...(execution ? { execution } : {}),
      ...plan,
    });
    return true;
  }
  const evaluator = new EmbeddingEvaluator(),
    plan = evaluator.plan(value as unknown as EmbeddingEvaluationSpecV1);
  if (verb === "run" && !dry) await evaluator.evaluate(value as unknown as EmbeddingEvaluationSpecV1);
  print({
    operation: verb,
    dryRun: dry,
    resolvedConfig: value,
    environmentReferences: config.environmentReferences,
    ...plan,
  });
  return true;
}
