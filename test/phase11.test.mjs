import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { promisify } from "node:util";
import { canonicalSha256 } from "../dist/core/canonical.js";
import {
  embeddingText,
  preflightEmbedding,
  resolveLockMetadata,
  validateEmbeddingRecord,
  withEmbeddingHash,
} from "../dist/experimental/index.js";
const exec = promisify(execFile),
  t = (text, id = {}) => embeddingText(text, { language: "en", domain: "test", ...id }),
  base = {
    embeddingRecordVersion: "1.0.0",
    id: "r",
    task: "fixture",
    split: "train",
    splitGroup: "g",
    source: { source: "fixture", revision: "1", license: "CC0", rights: "approved" },
    transformations: [],
    createdAt: "now",
  },
  teacher = { provider: "local", model: "tiny", revision: "1", requestId: "req", createdAt: "now" };
const variants = [
  { kind: "query-document", query: t("q"), document: t("d", { documentId: "d", corpusId: "c" }) },
  { kind: "retrieval-set", query: t("q"), positives: [t("p")], negatives: [t("n")] },
  { kind: "triplet", anchor: t("a"), positive: t("p"), negative: t("n") },
  { kind: "boolean-pair", left: t("a"), right: t("b"), label: true },
  { kind: "categorical-pair", left: t("a"), right: t("b"), label: "same", labelDomain: ["same", "different"] },
  {
    kind: "scored-pair",
    left: t("a"),
    right: t("b"),
    score: 0.5,
    scale: { min: 0, max: 1, direction: "higher-is-more-similar" },
  },
  {
    kind: "sts",
    left: t("a"),
    right: t("b"),
    score: 3,
    scale: { min: 0, max: 5, direction: "higher-is-more-similar" },
  },
  { kind: "classification", text: t("a"), label: "x", labelDomain: ["x"] },
  { kind: "clustering", text: t("a"), label: "x", labelDomain: ["x"] },
  { kind: "instruction-aware", instruction: "retrieve", text: t("q"), role: "query" },
  {
    kind: "teacher-vector",
    text: t("a"),
    teacher,
    vector: { storage: "inline", values: [1, 0], dimension: 2, norm: "l2" },
  },
  {
    kind: "teacher-score",
    query: t("q"),
    document: t("d"),
    teacher,
    score: 0.8,
    scale: { min: 0, max: 1, direction: "higher-is-more-relevant" },
  },
  {
    kind: "teacher-ranking",
    query: t("q"),
    teacher,
    candidatePoolId: "pool",
    corpusId: "c",
    candidates: [{ id: "x", documentId: "d" }],
    ranking: ["x"],
  },
];
test("cross-language goldens cover every discriminated record kind", async () => {
  for (const [i, variant] of variants.entries()) {
    const record = withEmbeddingHash({ ...base, ...variant, id: `r${i}` });
    validateEmbeddingRecord(record);
    const code = `from amxv_finetuning_trainer.embedding_contracts import validate_record\nimport json\nvalidate_record(json.loads(${JSON.stringify(JSON.stringify(record))}))`;
    await exec("python3", ["-c", code], {
      cwd: new URL("../python/", import.meta.url),
      env: { ...process.env, PYTHONPATH: new URL("../python/", import.meta.url).pathname },
    });
  }
  assert.equal(new Set(variants.map((x) => x.kind)).size, 13);
});
test("stable IDs and hashes ignore key order", () => {
  assert.equal(canonicalSha256({ a: 1, b: 2 }), canonicalSha256({ b: 2, a: 1 }));
  assert.equal(t("same").id, t("same").id);
});
test("invalid score vector ranking groups provenance and teacher metadata fail closed", () => {
  assert.throws(() => validateEmbeddingRecord({ ...base, ...variants[5], scale: undefined }), /SCALE|TypeError/);
  assert.throws(
    () =>
      validateEmbeddingRecord({
        ...base,
        ...variants[10],
        vector: { storage: "inline", values: [1], dimension: 2, norm: "l2" },
      }),
    /VECTOR_SHAPE/,
  );
  assert.throws(() => validateEmbeddingRecord({ ...base, ...variants[12], ranking: ["outside"] }), /RANKING_POOL/);
  assert.throws(() => validateEmbeddingRecord({ ...base, ...variants[0], splitGroup: "" }), /PROVENANCE/);
  assert.throws(
    () => validateEmbeddingRecord({ ...base, ...variants[10], teacher: { ...teacher, revision: "" } }),
    /TEACHER/,
  );
});
test("mock lock refresh rejects branches and reports license mutation", () => {
  assert.throws(() => resolveLockMetadata({ id: "x", sha: "main", license: "Apache" }, "x"), /MUTABLE/);
  assert.throws(() => resolveLockMetadata({ id: "x", sha: "a".repeat(40) }, "x", "expected"), /LICENSE/);
});
test("exact five reviewed locks fail closed with JSON and human-remediation data", async () => {
  const lockfile = JSON.parse(await readFile(new URL("../locks/embedding-models-v1.json", import.meta.url)));
  assert.equal(lockfile.models.length, 5);
  assert.deepEqual(
    lockfile.models.map((x) => x.modelId).sort(),
    [
      "Alibaba-NLP/gte-multilingual-base",
      "BAAI/bge-m3",
      "Qwen/Qwen3-Embedding-0.6B",
      "Snowflake/snowflake-arctic-embed-m-v2.0",
      "nomic-ai/nomic-embed-text-v2-moe",
    ].sort(),
  );
  for (const lock of lockfile.models) {
    assert.match(lock.commit, /^[a-f0-9]{40}$/);
    assert.equal(lock.status, "unavailable");
    const report = preflightEmbedding(lock, {
      dimension: lock.safeDimensions[0],
      splitGroups: false,
      intendedUse: "wrong",
      dependenciesCompatible: false,
    });
    assert.equal(report.ok, false);
    assert(report.errors.some((x) => x.code === "EMBED_LOCK_UNAVAILABLE"));
    assert(report.errors.every((x) => x.remediation));
  }
});
test("embedding phase remains experimental and chat root unchanged", async () => {
  const root = await import("../dist/index.js");
  assert.equal("validateEmbeddingRecord" in root, false);
});
