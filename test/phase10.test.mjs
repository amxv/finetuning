import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AppendOnlyReviewLog,
  DurableRemoteRunner,
  InMemoryLeaseLock,
  InMemoryManifestStore,
  InMemoryObjectStore,
  ProviderBatchLedger,
  ingestGovernedLogs,
  parquetPreflight,
  planLineageDeletion,
  reconcileDedupeShards,
} from "../dist/experimental/index.js";
test("remote runners are idempotent and status reconstructs from durable manifests", async () => {
  for (const kind of ["docker", "slurm", "cloud"]) {
    const store = new InMemoryManifestStore(),
      runner = new DurableRemoteRunner(kind, store, () => "1970-01-01T00:00:00Z");
    const first = await runner.submit("same"),
      duplicate = await runner.submit("same");
    assert.equal(first.jobId, duplicate.jobId);
    await runner.transition(first.jobId, "running");
    await runner.transition(first.jobId, "failed_retryable");
    await runner.retry(first.jobId);
    const reconstructed = await new DurableRemoteRunner(kind, store).status(first.jobId);
    assert.equal(reconstructed.status, "queued");
    assert.equal(reconstructed.attempt, 1);
    await runner.cancel(first.jobId);
    assert.equal((await runner.status(first.jobId)).status, "cancelled");
  }
});
test("object store injects faults, enforces CAS and integrity; leases conflict", async () => {
  const store = new InMemoryObjectStore();
  const bytes = new Uint8Array([1, 2]);
  const etag = await store.put("x", bytes);
  assert.deepEqual(await store.get("x", etag), bytes);
  await assert.rejects(() => store.put("x", bytes), /CAS_CONFLICT/);
  await assert.rejects(() => store.get("x", "bad"), /INTEGRITY/);
  store.fault = (op) => {
    if (op === "get") throw new Error("injected");
  };
  await assert.rejects(() => store.get("x"), /injected/);
  const locks = new InMemoryLeaseLock();
  locks.acquire("k", "a", 0, 10);
  assert.throws(() => locks.acquire("k", "b", 1, 10), /LEASE_CONFLICT/);
  locks.renew("k", "a", 2, 10);
  locks.release("k", "a");
});
test("provider batches reconcile partial results without duplicates and account budget/cost", () => {
  const batch = new ProviderBatchLedger(3);
  assert.deepEqual(
    batch.submit([
      { requestId: "a", estimatedCost: 1, payload: {} },
      { requestId: "b", estimatedCost: 2, payload: {} },
    ]),
    ["a", "b"],
  );
  batch.submit([{ requestId: "a", estimatedCost: 1, payload: {} }]);
  let state = batch.reconcile([
    { requestId: "a", cost: 0.8, response: { ok: true }, rawRef: "secret envelope" },
    { requestId: "a", cost: 99 },
  ]);
  assert.deepEqual(state.pending, ["b"]);
  assert.equal(state.cost, 0.8);
  state = batch.reconcile([{ requestId: "b", cost: 1.5 }]);
  assert.equal(state.completed, 2);
  assert.equal(state.cost, 2.3);
  assert.throws(() => new ProviderBatchLedger(0).submit([{ requestId: "x", estimatedCost: 1, payload: {} }]), /BUDGET/);
});
test("dedupe shards and append-only human review reconcile deterministically", () => {
  assert.deepEqual(
    reconcileDedupeShards([[{ shard: "b", hash: "h", recordId: "2" }], [{ shard: "a", hash: "h", recordId: "1" }]]),
    [{ hash: "h", representative: "1", members: ["1", "2"] }],
  );
  const log = new AppendOnlyReviewLog();
  const first = {
    version: "1.0.0",
    taskId: "t",
    recordId: "r",
    reviewer: "alice",
    decision: "accept",
    reason: "ok",
    createdAt: "now",
  };
  log.append(first);
  assert.throws(() => log.append({ ...first, reviewer: "bob" }), /PROVENANCE/);
});
test("governed logs fail closed then redact with consent retention residency and immutable audit", () => {
  const log = {
    id: "1",
    source: "prod",
    revision: "rev1",
    messages: [{ role: "user", content: "email me at x@y.com" }],
    createdAt: "now",
  };
  assert.throws(() => ingestGovernedLogs([log]), /GOVERNED_LOGS_DISABLED/);
  const governance = {
    version: "1.0.0",
    consent: { basis: "contract", recordedAt: "now" },
    rightsBasis: "owned",
    retention: { days: 30, deleteDescendants: true },
    encryption: { atRest: true, keyReference: "kms-env-name" },
    residency: { region: "in", allowedRegions: ["in"] },
    sourceRevision: "rev1",
    reasoningPolicy: "exclude",
    redact: (text) => text.replace(/\S+@\S+/g, "[EMAIL]"),
  };
  const result = ingestGovernedLogs([log], governance);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].provenance.metadata.retentionDays, 30);
  assert.equal(result.audit[0].type, "log_ingested");
  assert.throws(
    () => ingestGovernedLogs([log], { ...governance, residency: { region: "us", allowedRegions: ["in"] } }),
    /residency/,
  );
});
test("lineage deletion propagates required descendants and emits auditable tombstone", async () => {
  const assets = [
    { id: "source:s:1", kind: "source", parentIds: [], deleteRequired: true, hash: "a" },
    { id: "canonical", kind: "canonical", parentIds: ["source:s:1"], deleteRequired: true, hash: "b" },
    { id: "training", kind: "training", parentIds: ["canonical"], deleteRequired: true, hash: "c" },
    { id: "retained", kind: "evaluation", parentIds: ["canonical"], deleteRequired: false },
  ];
  await assert.rejects(() => planLineageDeletion("source:s:1", assets), /CONFIRMATION/);
  const report = await planLineageDeletion("source:s:1", assets, true);
  assert.deepEqual(
    report.deleted.map((x) => x.id),
    ["canonical", "source:s:1", "training"],
  );
  assert.deepEqual(report.retained, ["retained"]);
  assert.match(report.tombstoneId, /^[a-f0-9]{64}$/);
});
test("Parquet stays explicitly gated and experimental surfaces do not leak root", async () => {
  assert.throws(() => parquetPreflight(false), /OPTIONAL_DEPENDENCY/);
  assert.equal(parquetPreflight(true).lossReporting, "required");
  const root = await import("../dist/index.js");
  assert.equal("DurableRemoteRunner" in root, false);
});
