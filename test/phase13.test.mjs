import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { embeddingText, withEmbeddingHash } from "../dist/experimental/embeddings-phase11.js";
import {
  EmbeddingDistillationPipeline,
  listwiseKl,
  marginMse,
  pairwiseLogisticLoss,
  validateEmbeddingDistillationConfig,
} from "../dist/embeddings/distillation.js";
const exec = promisify(execFile),
  root = new URL("../", import.meta.url),
  cli = new URL("../dist/cli/index.js", import.meta.url);
const t = (x, id) => embeddingText(x, { language: "en", domain: "test", documentId: id, corpusId: "c" });
const record = (id, split = "train") =>
  withEmbeddingHash({
    embeddingRecordVersion: "1.0.0",
    id,
    kind: "query-document",
    task: "retrieval",
    split,
    splitGroup: `g-${id}`,
    query: t(`query ${id}`, `q-${id}`),
    document: t(`document ${id}`, `d-${id}`),
    source: { source: "fixture", revision: "1", license: "MIT", rights: "approved" },
    transformations: [],
    createdAt: "1970-01-01T00:00:00.000Z",
  });
const caps = () => ({
  tasks: ["retrieval"],
  storageAllowed: true,
  retention: "none",
  competitiveTrainingAllowed: true,
  maxDimension: 4,
  matryoshkaDimensions: [2, 4],
});
const usage = () => ({ requests: 1, units: 1, cost: 0.01, currency: "USD" });
const config = {
  runId: "r",
  dimension: 2,
  objective: { kind: "mse", projection: { kind: "pca", fitSplit: "train", artifactHash: "pca" }, dimensions: [2] },
  budgets: { generation: 10, scoring: 10, judging: 10, mining: 10, vectors: 10, ranking: 10 },
  compliance: {
    datasetRights: "approved",
    teacherOutputRights: "approved",
    terms: { url: "https://example.test", version: "1", reviewedAt: "2026-01-01", approver: "a" },
    retentionAllowed: "none",
    intendedUse: "training",
    contaminationHash: "hash",
  },
  nearDuplicateThreshold: 0.8,
  candidateLimit: 10,
  teacherStorageRights: "approved",
  seed: "s",
};
function services(log, unsupported = false) {
  return {
    teacher: {
      id: "vectors",
      model: "v",
      revision: "1",
      capabilities: caps,
      async embed(x) {
        log.push(["vector", ...x.texts.map((y) => y.id)]);
        return {
          vectors: x.texts.map(() => [1, 0]),
          dtype: "float32",
          norm: "l2",
          pooling: "mean",
          prompt: "none",
          usage: usage(),
        };
      },
    },
    scorer: {
      id: "scores",
      model: "s",
      revision: "1",
      capabilities: caps,
      async score(x) {
        log.push(["score", x.query.id, ...x.candidates.map((y) => y.id)]);
        return {
          scores: x.candidates.map(() => 0.5),
          scale: { min: 0, max: 1, direction: "higher-is-more-relevant" },
          usage: usage(),
        };
      },
    },
    ranker: {
      id: "rank",
      model: "r",
      revision: "1",
      capabilities: caps,
      async rank(x) {
        log.push(["rank", x.query.id, ...x.candidates.map((y) => y.id)]);
        return {
          ranking: x.candidates.map((y) => y.id),
          scores: x.candidates.map(() => 1),
          prompt: "rank",
          configuration: {},
          usage: usage(),
        };
      },
    },
    generator: {
      id: "gen",
      capabilities: caps,
      async generate(x) {
        log.push(["generate", x.document.id]);
        return { query: `synthetic ${x.document.text}`, usage: usage() };
      },
    },
    miner: {
      id: "mine",
      revision: "1",
      async mine(x) {
        log.push(["mine", x.query.id, ...x.corpus.map((y) => y.id)]);
        return { candidateIds: x.corpus.map((y) => y.id), usage: usage() };
      },
    },
    verifier: {
      async verify(x) {
        return { supported: !unsupported, reason: unsupported ? "unsupported" : "ok" };
      },
    },
    judge: {
      async judge() {
        return { accepted: true, reason: "ok", usage: usage() };
      },
    },
  };
}
test("deterministic fake vector/scorer/ranker/generator pipeline is train-only and resumable", async () => {
  const log = [],
    checkpoints = [];
  const p = new EmbeddingDistillationPipeline(
    services(log),
    () => "1970-01-01T00:00:00.000Z",
    async (s) => checkpoints.push(Object.keys(s.paidSuccesses).length),
  );
  const state = await p.run([record("a"), record("b"), record("held", "test")], config);
  assert(state.completedStages.includes("freeze"));
  assert(state.records.every((x) => x.split === "train"));
  assert(
    log.every((x) => !x.includes(record("held", "test").query.id) && !x.includes(record("held", "test").document.id)),
  );
  assert(Object.values(state.budgets).every((x) => x.usage.requests >= 0 && x.spent <= x.limit));
  const calls = log.length,
    targets = state.records.length;
  const resumed = await p.run([record("a"), record("b"), record("held", "test")], config, state);
  assert.equal(log.length, calls);
  assert.equal(resumed.records.length, targets);
  assert(checkpoints.length > 0);
  assert(state.exclusions.some((x) => ["positive", "same-group", "near-duplicate"].includes(x.reason)));
});
test("unsupported query, service rights/retention, projection and dimensions fail closed", async () => {
  const log = [];
  const state = await new EmbeddingDistillationPipeline(services(log, true), () => "1970-01-01T00:00:00.000Z").run(
    [record("a"), record("b")],
    config,
  );
  assert(state.exclusions.some((x) => x.reason === "unsupported-query"));
  assert.throws(
    () =>
      validateEmbeddingDistillationConfig(
        {
          ...config,
          objective: { kind: "mse", projection: { kind: "pca", fitSplit: "validation", artifactHash: "x" } },
        },
        [caps()],
      ),
    /TRAIN_ONLY/,
  );
  assert.throws(
    () => validateEmbeddingDistillationConfig(config, [{ ...caps(), storageAllowed: false }]),
    /STORAGE_RIGHTS/,
  );
  assert.throws(
    () => validateEmbeddingDistillationConfig(config, [{ ...caps(), retention: "persistent" }]),
    /RETENTION/,
  );
  assert.throws(
    () =>
      validateEmbeddingDistillationConfig({ ...config, dimension: 3, objective: { kind: "mse", dimensions: [1, 3] } }, [
        caps(),
      ]),
    /DIMENSION|MATRYOSHKA/,
  );
});
test("score, margin, pairwise and listwise numerical fixtures and calibration gates", async () => {
  assert(Math.abs(marginMse(0.8, 0.2, 0.7, 0.1)) < 1e-12);
  assert(Math.abs(pairwiseLogisticLoss(1, 0) - 0.3132616875) < 1e-8);
  assert(Math.abs(listwiseKl([1, 0], [1, 0], 1)) < 1e-12);
  const bad = services([]);
  bad.scorer.score = async (x) => ({
    scores: x.candidates.map(() => 2),
    scale: { min: 0, max: 1, direction: "higher-is-more-relevant" },
    usage: usage(),
  });
  await assert.rejects(
    () => new EmbeddingDistillationPipeline(bad).run([record("a"), record("b")], config),
    /SCORE_CALIBRATION/,
  );
  const rank = services([]);
  rank.ranker.rank = async () => ({
    ranking: ["outside"],
    scores: [1],
    prompt: "x",
    configuration: {},
    usage: usage(),
  });
  await assert.rejects(
    () => new EmbeddingDistillationPipeline(rank).run([record("a"), record("b")], config),
    /RANKING_POOL/,
  );
});
test("Phase 13 CLI verbs provide dry-run JSON, run/resume/status and additive help", async () => {
  const d = await mkdtemp(join(tmpdir(), "phase13-")),
    input = join(d, "input.jsonl"),
    cfg = join(d, "config.json"),
    state = join(d, "state.json");
  try {
    await writeFile(input, [record("a"), record("b")].map(JSON.stringify).join("\n") + "\n");
    await writeFile(cfg, JSON.stringify(config));
    for (const args of [
      ["embed", "generate", "queries", "--dry-run", "--json"],
      ["embed", "generate", "documents", "--dry-run", "--json"],
      ["embed", "generate", "pairs", "--dry-run", "--json"],
      ["embed", "mine", "negatives", "--dry-run", "--json"],
      ["embed", "distill", "plan", "--config", cfg, "--json"],
    ])
      JSON.parse((await exec(process.execPath, [cli.pathname, ...args], { cwd: root })).stdout);
    const run = JSON.parse(
      (
        await exec(
          process.execPath,
          [cli.pathname, "embed", "distill", "run", "--config", cfg, "--input", input, "--state", state, "--json"],
          { cwd: root },
        )
      ).stdout,
    );
    assert.equal(run.trainOnly, true);
    const status = JSON.parse(
      (
        await exec(process.execPath, [cli.pathname, "embed", "distill", "status", "--state", state, "--json"], {
          cwd: root,
        })
      ).stdout,
    );
    assert(status.completedStages.includes("freeze"));
    const resume = JSON.parse(
      (
        await exec(
          process.execPath,
          [cli.pathname, "embed", "distill", "resume", "--config", cfg, "--input", input, "--state", state, "--json"],
          { cwd: root },
        )
      ).stdout,
    );
    assert.equal(resume.recordCount, run.recordCount);
    const help = (await exec(process.execPath, [cli.pathname, "--help"], { cwd: root })).stdout;
    assert.match(help, /embed distill vectors\|scores\|rankings/);
    assert.doesNotMatch(help, /Qwen3-Embedding.*supported/i);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});
