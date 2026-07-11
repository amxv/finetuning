import { access, readFile } from "node:fs/promises";
import type { EmbeddingRecordV1 } from "../experimental/embeddings-phase11.js";
import {
  EmbeddingDistillationPipeline,
  loadEmbeddingDistillationState,
  saveEmbeddingDistillationState,
  validateEmbeddingDistillationConfig,
  type EmbeddingDistillationConfig,
  type EmbeddingServiceCapabilities,
  type ServiceUsage,
} from "../embeddings/distillation.js";
import { parseArgs, readBooleanFlag, readOptionalStringFlag, readRequiredStringFlag } from "./argv.js";
import { embedCommandHelp } from "./embed-command-reference.js";
export async function runEmbedPhase13(raw: string[]): Promise<void> {
  const [noun, verb, ...rest] = raw,
    a = parseArgs(rest);
  if (readBooleanFlag(a, "help")) {
    console.log(embedCommandHelp(noun ?? "", verb ?? ""));
    return;
  }
  if (noun === "generate" && ["queries", "documents", "pairs"].includes(verb ?? ""))
    return print(
      {
        operation: `generate ${verb}`,
        dryRun: readBooleanFlag(a, "dry-run"),
        network: false,
        trainOnly: true,
        estimatedRequests: Number(readOptionalStringFlag(a, "limit") ?? 1),
      },
      a,
    );
  if (noun === "mine" && verb === "negatives")
    return print(
      {
        operation: "mine negatives",
        dryRun: readBooleanFlag(a, "dry-run"),
        trainOnly: true,
        exclusions: ["positive", "same-group", "near-duplicate", "heldout"],
      },
      a,
    );
  if (noun !== "distill" || !["vectors", "scores", "rankings", "plan", "run", "resume", "status"].includes(verb ?? ""))
    throw new Error(`Unknown command: embed ${raw.join(" ")}`);
  const statePath = readOptionalStringFlag(a, "state") ?? "embedding-distillation-state.json";
  if (verb === "status") {
    const s = await loadEmbeddingDistillationState(statePath);
    return print(
      {
        completedStages: s.completedStages,
        recordCount: s.records.length,
        budgets: s.budgets,
        exclusions: s.exclusions.length,
      },
      a,
    );
  }
  const config = JSON.parse(await readFile(readRequiredStringFlag(a, "config"), "utf8")) as EmbeddingDistillationConfig;
  if (verb === "plan" || readBooleanFlag(a, "dry-run")) {
    validateEmbeddingDistillationConfig(config, [caps(), caps(), caps(), caps()]);
    return print(
      {
        runId: config.runId,
        dryRun: true,
        network: false,
        trainOnly: true,
        budgets: config.budgets,
        objective: config.objective,
      },
      a,
    );
  }
  const input = await rows(readRequiredStringFlag(a, "input"));
  let previous;
  if (verb === "resume") previous = await loadEmbeddingDistillationState(statePath);
  else
    try {
      await access(statePath);
      throw new Error(`Output already exists: ${statePath}. Use embed distill resume.`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  const pipeline = new EmbeddingDistillationPipeline(
    fake(),
    () => new Date(0).toISOString(),
    (s) => saveEmbeddingDistillationState(statePath, s),
  );
  const state = await pipeline.run(input, config, previous);
  await saveEmbeddingDistillationState(statePath, state);
  print(
    {
      runId: config.runId,
      operation: verb,
      completedStages: state.completedStages,
      recordCount: state.records.length,
      budgets: state.budgets,
      trainOnly: true,
    },
    a,
  );
}
function caps(): EmbeddingServiceCapabilities {
  return {
    tasks: ["retrieval"],
    storageAllowed: true,
    retention: "none",
    competitiveTrainingAllowed: true,
    maxDimension: 1024,
    matryoshkaDimensions: [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024],
  };
}
function usage(): ServiceUsage {
  return { requests: 1, units: 1, cost: 0.001, currency: "USD" };
}
function fake(): any {
  return {
    teacher: {
      id: "fake-vector",
      model: "fake",
      revision: "1",
      capabilities: caps,
      async embed(x: any) {
        return {
          vectors: x.texts.map(() => Array.from({ length: x.dimension }, (_, i) => (i === 0 ? 1 : 0))),
          dtype: "float32",
          norm: "l2",
          pooling: "mean",
          prompt: "none",
          usage: usage(),
        };
      },
    },
    scorer: {
      id: "fake-score",
      model: "fake",
      revision: "1",
      capabilities: caps,
      async score(x: any) {
        return {
          scores: x.candidates.map((_: any, i: number) => 1 - i / (x.candidates.length || 1)),
          scale: { min: 0, max: 1, direction: "higher-is-more-relevant" },
          usage: usage(),
        };
      },
    },
    ranker: {
      id: "fake-rank",
      model: "fake",
      revision: "1",
      capabilities: caps,
      async rank(x: any) {
        return {
          ranking: x.candidates.map((c: any) => c.id),
          scores: x.candidates.map((_: any, i: number) => 1 - i),
          prompt: "fixture",
          configuration: { deterministic: true },
          usage: usage(),
        };
      },
    },
    generator: {
      id: "fake-generator",
      capabilities: caps,
      async generate(x: any) {
        return { query: `query about ${x.document.text}`, usage: usage() };
      },
    },
    miner: {
      id: "fake-miner",
      revision: "1",
      async mine(x: any) {
        return { candidateIds: x.corpus.map((c: any) => c.id), usage: usage() };
      },
    },
    verifier: {
      async verify() {
        return { supported: true, reason: "fixture" };
      },
    },
    judge: {
      async judge() {
        return { accepted: true, reason: "fixture", usage: usage() };
      },
    },
  };
}
async function rows(path: string) {
  return (await readFile(path, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((x) => JSON.parse(x) as EmbeddingRecordV1);
}
function print(x: unknown, a: ReturnType<typeof parseArgs>) {
  console.log(readBooleanFlag(a, "json") ? JSON.stringify(x) : JSON.stringify(x, null, 2));
}
