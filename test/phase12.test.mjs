import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { canonicalSerialize, canonicalSha256 } from "../dist/core/canonical.js";
import { embeddingText, validateEmbeddingRecord, withEmbeddingHash } from "../dist/experimental/embeddings-phase11.js";
import { decodeEmbeddingRow, encodeEmbeddingRow } from "../dist/embeddings/formats.js";
import {
  dedupeEmbeddingRecords,
  freezeEmbeddingDataset,
  importEmbeddingJsonl,
  readBoundedVectorShard,
  scanEmbeddingContamination,
  splitEmbeddingRecords,
  validateEmbeddingRecords,
  verifyFrozenEmbeddingDataset,
} from "../dist/embeddings/data.js";
import { parseJsonl } from "../dist/formats/streaming.js";

const exec = promisify(execFile),
  root = fileURLToPath(new URL("../", import.meta.url)),
  cli = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));
const teacher = {
  provider: "fixture",
  model: "teacher",
  revision: "a".repeat(40),
  requestId: "req",
  createdAt: "1970-01-01T00:00:00.000Z",
};
const t = (text, ids = {}) => embeddingText(text, { language: "en", domain: "test", ...ids });
const base = (kind, body, id = kind) =>
  withEmbeddingHash({
    embeddingRecordVersion: "1.0.0",
    id,
    kind,
    task: kind,
    split: "train",
    splitGroup: `g-${id}`,
    source: { source: "fixture", sourceId: `s-${id}`, revision: "r1", license: "MIT", rights: "approved" },
    transformations: [],
    createdAt: "1970-01-01T00:00:00.000Z",
    ...body,
  });
const variants = [
  base("query-document", { query: t("q"), document: t("d") }),
  base("triplet", { anchor: t("a"), positive: t("p"), negative: t("n") }),
  base("retrieval-set", { query: t("q2"), positives: [t("p1"), t("p2")], negatives: [t("n1"), t("n2")] }),
  base("boolean-pair", { left: t("l"), right: t("r"), label: true }),
  base("categorical-pair", { left: t("l2"), right: t("r2"), label: "yes", labelDomain: ["yes", "no"] }),
  base("scored-pair", {
    left: t("l3"),
    right: t("r3"),
    score: 0.8,
    scale: { min: 0, max: 1, direction: "higher-is-more-similar" },
  }),
  base("sts", {
    left: t("l4"),
    right: t("r4"),
    score: 4,
    scale: { min: 0, max: 5, direction: "higher-is-more-similar" },
  }),
  base("classification", { text: t("class"), label: "a", labelDomain: ["a", "b"] }),
  base("clustering", { text: t("cluster"), label: "c1", labelDomain: ["c1", "c2"] }),
  base("instruction-aware", { instruction: "Represent the query", text: t("raw query"), role: "query" }),
  base("teacher-vector", {
    text: t("vector"),
    teacher,
    vector: { storage: "inline", values: [1, 0], dimension: 2, norm: "l2" },
  }),
  base("teacher-score", {
    query: t("sq"),
    document: t("sd"),
    teacher,
    score: 0.7,
    scale: { min: 0, max: 1, direction: "higher-is-more-relevant" },
  }),
  base("teacher-ranking", {
    query: t("rq"),
    teacher,
    candidatePoolId: "pool",
    corpusId: "corpus",
    candidates: [
      { id: "a", documentId: "da" },
      { id: "b", documentId: "db" },
    ],
    ranking: ["b", "a"],
  }),
];

test("Phase 12 canonical/ST/HF goldens cover every shape and explicit losses", async () => {
  for (const r of variants) {
    validateEmbeddingRecord(r);
    const canonical = encodeEmbeddingRow(r, "canonical-embedding-jsonl");
    assert(canonical.supported);
    assert.deepEqual(canonical.value, JSON.parse(canonicalSerialize(r)));
    const external = encodeEmbeddingRow(r, "sentence-transformers");
    assert.equal(external.supported, true, r.kind);
  }
  const unsupported = encodeEmbeddingRow(
    base("instruction-aware", { instruction: "Represent queries", text: t("raw text"), role: "query" }),
    "hugging-face",
  );
  assert(unsupported.supported);
  const rows = [
    { anchor: "a", positive: "p", split_group: "g" },
    { anchor: "a", positive: "p", negative: "n", split_group: "g" },
    { query: "q", positives: ["p1", "p2"], negatives: ["n"], split_group: "g" },
  ];
  assert.equal(
    decodeEmbeddingRow(rows[0], { source: { name: "x", revision: "r", license: "l", rights: "y" } }).value.kind,
    "query-document",
  );
  assert.equal(
    decodeEmbeddingRow(rows[1], { source: { name: "x", revision: "r", license: "l", rights: "y" } }).value.kind,
    "triplet",
  );
  assert.equal(
    decodeEmbeddingRow(rows[2], { source: { name: "x", revision: "r", license: "l", rights: "y" } }).value.kind,
    "retrieval-set",
  );
  for (const r of variants.slice(3)) {
    const encoded = encodeEmbeddingRow(r, "hugging-face").value;
    const task = r.kind === "query-document" ? "pair" : r.kind;
    const decoded = decodeEmbeddingRow(encoded, {
      mapping: { task, columns: {} },
      source: { name: "x", revision: "r", license: "l", rights: "y" },
    });
    assert.equal(decoded.supported, true, `${r.kind}: ${decoded.losses.map((x) => x.message)}`);
    assert.equal(decoded.value.kind, r.kind);
  }
  const shard = base("teacher-vector", {
    text: t("v"),
    teacher,
    vector: {
      storage: "shard",
      ref: {
        sha256: "a".repeat(64),
        uri: "blob:a",
        bytes: 4,
        dtype: "float16",
        shape: [2],
        norm: "none",
        dimension: 2,
        model: "m",
        revision: "r",
        pooling: "mean",
        prompt: "none",
      },
    },
  });
  const loss = encodeEmbeddingRow(shard, "hugging-face");
  assert.equal(loss.supported, false);
  assert.equal(loss.losses[0].code, "EMBED_VECTOR_SIDECAR_REQUIRED");
});

test("mapping is explicit, ambiguity and column order cannot select semantics, unknown fields are namespaced", () => {
  for (const row of [
    { text: "x", label: "a", split_group: "g" },
    { left: "a", right: "b", score: 1, split_group: "g" },
    { right: "b", left: "a", label: true, split_group: "g" },
  ])
    assert.equal(decodeEmbeddingRow(row).supported, false);
  const options = {
    mapping: {
      task: "sts",
      columns: { left: "sentence_b", right: "sentence_a", score: "similarity", min: "lo", max: "hi", direction: "dir" },
    },
    source: { name: "x", revision: "r", license: "l", rights: "y" },
  };
  const a = decodeEmbeddingRow(
    {
      sentence_a: "A",
      sentence_b: "B",
      similarity: 2,
      lo: 0,
      hi: 5,
      dir: "higher-is-more-similar",
      split_group: "g",
      custom: "keep",
    },
    options,
  ).value;
  const b = decodeEmbeddingRow(
    {
      custom: "keep",
      dir: "higher-is-more-similar",
      hi: 5,
      lo: 0,
      split_group: "g",
      similarity: 2,
      sentence_b: "B",
      sentence_a: "A",
    },
    options,
  ).value;
  assert.equal(a.id, b.id);
  assert.deepEqual(a.metadata, { "external.embedding": { custom: "keep" } });
});

test("streaming locations, backpressure and vector shard bounds are demand driven", async () => {
  await assert.rejects(
    async () => {
      for await (const _row of parseJsonl(one('{"a":1}\n{bad}\n'))) void _row;
    },
    (e) => e.line === 2 && e.byteOffset === 8,
  );
  let pulled = 0;
  async function* large() {
    for (let i = 0; i < 10000; i++) {
      pulled++;
      yield `${JSON.stringify(variants[0])}\n`;
    }
  }
  const iterator = importEmbeddingJsonl(large())[Symbol.asyncIterator]();
  await iterator.next();
  assert(pulled < 3);
  await iterator.return();
  let chunks = 0;
  async function* shard() {
    for (let i = 0; i < 4; i++) {
      chunks++;
      yield new Uint8Array(4);
    }
  }
  assert.equal((await readBoundedVectorShard(shard(), { expectedBytes: 16, maxBytes: 16 })).byteLength, 16);
  assert.equal(chunks, 4);
  await assert.rejects(() => readBoundedVectorShard(shard(), { expectedBytes: 16, maxBytes: 8 }), /BOUNDS/);
});

test("deterministic identities, canonical order, and validation invariants", async () => {
  assert.equal(canonicalSha256({ b: 2, a: 1 }), canonicalSha256({ a: 1, b: 2 }));
  const child = await exec(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {canonicalSha256} from './dist/core/canonical.js';console.log(canonicalSha256({b:2,a:1}))`,
    ],
    { cwd: root },
  );
  assert.equal(child.stdout.trim(), canonicalSha256({ a: 1, b: 2 }));
  const bad = [
    { ...variants[0], query: { ...variants[0].query, text: "" } },
    { ...variants[4], label: "outside" },
    { ...variants[5], score: NaN },
    { ...variants[10], vector: { storage: "inline", values: [1, 1], dimension: 2, norm: "l2" } },
    { ...variants[12], ranking: ["outside"] },
    { ...variants[9], instruction: "", text: t("") },
    { ...variants[11], teacher: { ...teacher, revision: "" } },
  ];
  for (const r of bad) assert.throws(() => validateEmbeddingRecord(r));
  const duplicate = await validateEmbeddingRecords(iter([variants[0], variants[0]]));
  assert(duplicate.issues.some((x) => x.code === "EMBED_DUPLICATE_ID"));
  const conflict = base("retrieval-set", { query: t("q"), positives: [t("same")], negatives: [t("same")] }, "conflict");
  assert.throws(() => validateEmbeddingRecord(conflict), /CONFLICT/);
  const warning = await validateEmbeddingRecords(
    iter([base("triplet", { anchor: t("a"), positive: t("same"), negative: t("same") }, "warn")]),
  );
  assert(warning.issues.some((x) => x.code === "EMBED_FALSE_NEGATIVE" && x.severity === "warning"));
});

test("salted lineage groups and dedupe clusters never cross splits", async () => {
  const family = [
    base(
      "classification",
      { text: t("one", { documentId: "doc", entityId: "entity" }), label: "a", labelDomain: ["a"] },
      "f1",
    ),
    base(
      "categorical-pair",
      { left: t("one", { documentId: "doc" }), right: t("two"), label: "a", labelDomain: ["a"] },
      "f2",
    ),
  ];
  family[0].translationGroup = "tr";
  family[1].syntheticGroup = "syn";
  family[0].metadata = { timeGroup: "2026-01" };
  family[1].source.sourceId = family[0].source.sourceId;
  const split = splitEmbeddingRecords(family, "salt");
  assert.equal(new Set(split.map((x) => x.split)).size, 1);
  assert.deepEqual(splitEmbeddingRecords(family, "salt"), split);
  const dupes = [
    base("classification", { text: t("Hello   WORLD"), label: "a", labelDomain: ["a"] }, "d1"),
    base("classification", { text: t("hello world"), label: "a", labelDomain: ["a"] }, "d2"),
  ];
  const m = await dedupeEmbeddingRecords(dupes);
  assert.equal(new Set(m.map((x) => x.clusterId)).size, 1);
  assert.equal(m.filter((x) => x.representative).length, 1);
  assert(m.every((x) => x.rationale));
  const near = await dedupeEmbeddingRecords(
    [
      base("classification", { text: t("one two three four"), label: "a", labelDomain: ["a"] }, "n1"),
      base("classification", { text: t("one two three five"), label: "a", labelDomain: ["a"] }, "n2"),
    ],
    { minhashThreshold: 0.1 },
  );
  assert.equal(new Set(near.map((x) => x.clusterId)).size, 1);
  await assert.rejects(
    () =>
      dedupeEmbeddingRecords([variants[0], variants[1]], {
        semantic: {
          id: "x",
          lockHash: "",
          threshold: 0.5,
          async similarity() {
            return 1;
          },
        },
      }),
    /LOCK_REQUIRED/,
  );
});

test("contamination evidence, freeze determinism, fail-closed gates and tampering", async () => {
  const train = { ...variants[0], split: "train" },
    held = { ...base("query-document", { query: t("q"), document: t("held") }, "held"), split: "test" },
    bench = { ...base("query-document", { query: t("q"), document: t("bench") }, "bench"), split: "test" };
  const evidence = scanEmbeddingContamination([train], [held], [bench]);
  assert(evidence.comparisons.some((x) => x.kind === "benchmark"));
  assert.deepEqual(evidence.benchmarkExcludedIds, ["bench"]);
  const records = splitEmbeddingRecords([train], "s"),
    members = await dedupeEmbeddingRecords(records),
    a = await mkdtemp(join(tmpdir(), "embed-freeze-a-")),
    b = await mkdtemp(join(tmpdir(), "embed-freeze-b-"));
  try {
    const ma = await freezeEmbeddingDataset(a, records, evidence, members),
      mb = await freezeEmbeddingDataset(b, records, evidence, members);
    assert.deepEqual(ma, mb);
    assert.equal(JSON.parse(await readFile(join(a, "contamination.json"), "utf8")).thresholds.nearText, 0.85);
    await writeFile(join(a, "records.jsonl"), "tamper\n");
    await assert.rejects(() => verifyFrozenEmbeddingDataset(a), /TAMPERED/);
    await assert.rejects(
      () => freezeEmbeddingDataset(b, [{ ...records[0], splitGroup: "" }], evidence, members),
      /VALIDATION|INCOMPLETE/,
    );
    await assert.rejects(() => freezeEmbeddingDataset(b, records, { ...evidence, hash: "bad" }, members), /TAMPERED/);
  } finally {
    await rm(a, { recursive: true, force: true });
    await rm(b, { recursive: true, force: true });
  }
});

test("embed data CLI covers every subcommand, JSON/dry-run/stdin/overwrite and stays additive", async () => {
  const dir = await mkdtemp(join(tmpdir(), "embed-cli-")),
    input = join(dir, "input.jsonl"),
    out = join(dir, "out.jsonl");
  try {
    await writeFile(
      input,
      variants
        .slice(0, 2)
        .map((x) => canonicalSerialize(x))
        .join("\n") + "\n",
    );
    for (const verb of ["validate", "inspect"]) {
      const { stdout } = await exec(process.execPath, [cli, "embed", "data", verb, input, "--json"]);
      assert.doesNotThrow(() => JSON.parse(stdout));
    }
    for (const verb of ["import", "convert", "export"]) {
      const { stdout } = await exec(process.execPath, [cli, "embed", "data", verb, input, "--out", "-"], {
        cwd: root,
      });
      assert.match(stdout, /embeddingRecordVersion/);
    }
    const split = await exec(process.execPath, [cli, "embed", "data", "split", input, "--salt", "s", "--out", "-"], {
      cwd: root,
    });
    assert.match(split.stdout, /"split"/);
    const dedupe = await exec(process.execPath, [cli, "embed", "data", "dedupe", input, "--out", "-"], {
      cwd: root,
    });
    assert.match(dedupe.stdout, /clusterId/);
    await exec(process.execPath, [cli, "embed", "data", "create", "--out", out, "--json"], { cwd: root });
    await assert.rejects(
      () => exec(process.execPath, [cli, "embed", "data", "create", "--out", out], { cwd: root }),
      /already exists/,
    );
    await exec(process.execPath, [cli, "embed", "data", "create", "--out", out, "--force"], { cwd: root });
    const dry = join(dir, "dry");
    const d = await exec(
      process.execPath,
      [cli, "embed", "data", "import", input, "--out", dry, "--dry-run", "--json"],
      { cwd: root },
    );
    assert.equal(JSON.parse(d.stdout).dryRun, true);
    await assert.rejects(() => readFile(dry));
    const stdin = await cliInput(["embed", "data", "validate", "-", "--json"], await readFile(input));
    assert.equal(JSON.parse(stdin).valid, true);
    const frozen = join(dir, "frozen");
    await exec(process.execPath, [cli, "embed", "data", "freeze", input, "--out", frozen, "--json"], {
      cwd: root,
    });
    assert.equal((await readFile(join(frozen, "manifest.json"), "utf8")).includes("recordsHash"), true);
    const help = await exec(process.execPath, [cli, "--help"], { cwd: root });
    assert.match(help.stdout, /embed data create/);
    assert.doesNotMatch(help.stdout, /Qwen3-Embedding.*available/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("embedding subpaths are additive and model locks remain unavailable", async () => {
  const data = await import("../dist/embeddings/index.js"),
    formats = await import("../dist/embeddings/formats.js"),
    lockfile = JSON.parse(await readFile(new URL("../locks/embedding-models-v1.json", import.meta.url)));
  assert.equal(typeof data.freezeEmbeddingDataset, "function");
  assert.equal(typeof formats.decodeEmbeddingRow, "function");
  assert.equal(lockfile.models.length, 5);
  assert(lockfile.models.every((x) => x.status === "unavailable"));
});
function cliInput(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: root }),
      out = [],
      err = [];
    child.stdout.on("data", (x) => out.push(x));
    child.stderr.on("data", (x) => err.push(x));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(Buffer.concat(out).toString()) : reject(new Error(Buffer.concat(err).toString())),
    );
    child.stdin.end(input);
  });
}
async function* one(x) {
  yield x;
}
async function* iter(x) {
  yield* x;
}
