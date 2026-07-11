import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  bootstrap,
  classificationMetrics,
  evaluateEmbeddingSpec,
  pearson,
  retrievalMetrics,
  spearman,
  verifyEmbeddingEvaluationReport,
  vMeasure,
} from "../dist/embeddings/evaluation.js";
const rows = [
  {
    id: "q1",
    relevantIds: ["a"],
    candidates: [
      { id: "b", score: 1 },
      { id: "a", score: 1 },
    ],
    language: "en",
    prompt: "on",
    length: 32,
    dimension: 256,
  },
  {
    id: "q2",
    relevantIds: ["c"],
    candidates: [
      { id: "c", score: 2 },
      { id: "d", score: 1 },
    ],
    language: "fr",
    prompt: "off",
    length: 2048,
    dimension: 768,
  },
  {
    id: "q3",
    relevantIds: ["e"],
    candidates: [
      { id: "e", score: 2 },
      { id: "f", score: 1 },
    ],
    language: "zh",
    prompt: "on",
    length: 256,
    dimension: 1024,
  },
];
const spec = {
  embeddingEvaluationSpecVersion: "embedding.evaluation.v1",
  runId: "eval",
  datasetRevision: "fixture-1",
  evaluatorRevision: "1",
  mteb: { revision: "mteb-fixture-1", taskSet: "tiny-local", offlineFixture: true },
  frozenSplitHash: "a".repeat(64),
  contaminationHash: "b".repeat(64),
  retrieval: rows,
  sts: [
    { predicted: 1, expected: 1, language: "en" },
    { predicted: 2, expected: 2, language: "fr" },
    { predicted: 3, expected: 3, language: "zh" },
  ],
  classification: [
    { predicted: "a", expected: "a" },
    { predicted: "b", expected: "a" },
  ],
  clustering: [
    { predicted: "x", expected: "a" },
    { predicted: "y", expected: "b" },
  ],
  baselines: { base: { "recall@10": 0.5 }, "no-distillation": { "recall@10": 0.4 }, random: { "recall@10": 0.1 } },
  thresholds: [{ metric: "recall@10", baseline: "base", minimumDelta: 0.1 }],
  resources: { latencyMs: 1, throughputPerSecond: 1000, peakMemoryBytes: 1024, artifactBytes: 2048 },
  contamination: {
    evalIds: ["q1", "q2", "q3"],
    generationLedgerIds: [],
    miningLedgerIds: [],
    canaries: [],
    projectionFitSplit: "train",
  },
  bootstrap: { seed: 7, samples: 100 },
};
const exec = promisify(execFile),
  cli = new URL("../dist/cli/index.js", import.meta.url).pathname;
test("hand-computed metric goldens and deterministic ties", () => {
  const m = retrievalMetrics(rows);
  assert.equal(m["recall@10"], 1);
  assert.equal(m.mrr, 1);
  assert.equal(pearson([1, 2, 3], [1, 2, 3]), 1);
  assert.equal(spearman([1, 2, 3], [1, 2, 3]), 1);
  assert.deepEqual(
    classificationMetrics([
      { predicted: "a", expected: "a" },
      { predicted: "b", expected: "a" },
    ]),
    { accuracy: 0.5, "macro-f1": 1 / 3 },
  );
  assert.equal(
    vMeasure([
      { predicted: "x", expected: "a" },
      { predicted: "y", expected: "b" },
    ]),
    1,
  );
  assert.deepEqual(bootstrap([0, 1, 1], 7, 100), bootstrap([0, 1, 1], 7, 100));
  assert.throws(
    () =>
      retrievalMetrics([
        {
          ...rows[0],
          candidates: [
            { id: "a", score: 1 },
            { id: "a", score: 0 },
          ],
        },
      ]),
    /DUPLICATE/,
  );
});
test("MTEB fixture, multilingual/prompt/length/dimension slices, baselines and regression", () => {
  const report = evaluateEmbeddingSpec(spec);
  assert.equal(report.regression.passed, true);
  for (const key of [
    "language:en",
    "language:fr",
    "language:zh",
    "prompt:on",
    "prompt:off",
    "dimension:256",
    "dimension:768",
    "dimension:1024",
    "length:short",
    "length:medium",
    "length:long",
  ])
    assert(key in report.slices);
  assert.equal(report.revisions.mteb, "mteb-fixture-1");
  assert.equal(report.resources.peakMemoryBytes, 1024);
  assert.equal(report.contamination.passed, true);
  assert.equal(
    evaluateEmbeddingSpec({ ...spec, thresholds: [{ metric: "recall@10", baseline: "base", minimumDelta: 1 }] })
      .regression.passed,
    false,
  );
  assert.throws(
    () => evaluateEmbeddingSpec({ ...spec, contamination: { ...spec.contamination, generationLedgerIds: ["q1"] } }),
    /LEDGER_LEAK/,
  );
  assert.throws(
    () => evaluateEmbeddingSpec({ ...spec, mteb: { ...spec.mteb, offlineFixture: false } }),
    /NETWORK_OPT_IN/,
  );
});
test("signed report verifies and tampering fails", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "phase16-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = evaluateEmbeddingSpec(spec),
    path = join(root, "report.json");
  await writeFile(path, JSON.stringify(report));
  assert.equal((await verifyEmbeddingEvaluationReport(path)).reportHash, report.reportHash);
  await writeFile(path, JSON.stringify({ ...report, metrics: { ...report.metrics, mrr: 0 } }));
  await assert.rejects(() => verifyEmbeddingEvaluationReport(path), /TAMPER/);
});
test("CLI run compare inspect emits parseable JSON", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "phase16-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = join(root, "report.json"),
    config = join(root, "config.json");
  await writeFile(config, JSON.stringify({ configVersion: "1.0.0", defaults: { ...spec, outputPath: report } }));
  const command = async (...args) =>
    JSON.parse((await exec(process.execPath, [cli, "embed", "evaluate", ...args, "--json"])).stdout);
  const run = await command("run", "--config", config);
  assert.equal(run.result.regression.passed, true);
  assert.equal(
    (await command("inspect", "--config", config, "--report", report)).result.reportHash,
    run.result.reportHash,
  );
  assert.equal(
    (await command("compare", "--config", config, "--left", report, "--right", report)).result.deltas.mrr,
    0,
  );
});
