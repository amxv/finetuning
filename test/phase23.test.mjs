import test from "node:test";
import assert from "node:assert/strict";
import {
  FakeFleetDispatcher,
  FakeServerlessQueue,
  serverlessCapabilities,
  validateScaling,
  validateServerlessRequest,
  validateWorker,
} from "../dist/execution/runpod/index.js";
const request = () => ({
  version: "1.0.0",
  endpointId: "ep",
  operation: "evaluate",
  idempotencyKey: "k",
  ownershipMarker: "owner",
  input: { text: "hi" },
  limits: { payloadBytes: 1000, outputBytes: 1000, executionTimeoutMs: 10_000, queueTtlMs: 20_000 },
  provider: { runpod: { mode: "run" } },
});
test("bounded Serverless request rejects training and all limit overflow", () => {
  assert.equal(validateServerlessRequest(request()).operation, "evaluate");
  assert.throws(
    () => validateServerlessRequest({ ...request(), input: { training: true, checkpoint: "x" } }),
    /training/,
  );
  assert.throws(
    () => validateServerlessRequest({ ...request(), limits: { ...request().limits, payloadBytes: 2_000_000 } }),
    /payload/,
  );
  assert.throws(
    () => validateServerlessRequest({ ...request(), limits: { ...request().limits, outputBytes: 5_000_000 } }),
    /output/,
  );
  assert.throws(
    () => validateServerlessRequest({ ...request(), limits: { ...request().limits, executionTimeoutMs: 700_000 } }),
    /runtime/,
  );
});
test("fake queue covers states idempotency cancellation and purge semantics", () => {
  const q = new FakeServerlessQueue(() => "2026-01-01T00:00:00Z"),
    a = q.submit(request());
  assert.equal(q.submit(request()).id, a.id);
  assert.equal(q.transition(a.id, "IN_PROGRESS").state, "IN_PROGRESS");
  const cancel = q.cancel(a.id, "owner");
  assert.equal(cancel.state, "IN_PROGRESS");
  assert.equal(cancel.cancelRequested, true);
  assert.equal(q.transition(a.id, "CANCELLED").state, "CANCELLED");
  assert.throws(() => q.transition(a.id, "COMPLETED"), /transition/);
  assert.throws(() => q.status("unknown"), /unknown/);
  const b = q.submit({ ...request(), idempotencyKey: "b" }),
    c = q.submit({ ...request(), idempotencyKey: "c" });
  q.transition(c.id, "IN_PROGRESS");
  const purge = q.purge("owner");
  assert.equal(purge.purged, 1);
  assert.deepEqual(purge.runningUnaffected, [c.id]);
  assert.equal(q.status(b.id).state, "PURGED");
});
test("scaling and worker compatibility fail closed", () => {
  assert.equal(
    validateScaling({
      version: "1.0.0",
      workersMin: 0,
      workersMax: 2,
      idleTimeoutSeconds: 5,
      executionTimeoutMs: 10_000,
      scalerType: "QUEUE_DELAY",
      scalerValue: 4,
      scaleToZero: true,
      coldStartMeasured: false,
    }).workersMax,
    2,
  );
  assert.throws(
    () =>
      validateScaling({
        version: "1.0.0",
        workersMin: 2,
        workersMax: 1,
        idleTimeoutSeconds: 5,
        executionTimeoutMs: 10_000,
        scalerType: "QUEUE_DELAY",
        scalerValue: 4,
        scaleToZero: false,
        coldStartMeasured: false,
      }),
    /scale/,
  );
  const image = {
    version: "1.0.0",
    purpose: "inference",
    reference: "x",
    digest: `sha256:${"a".repeat(64)}`,
    modelRevision: "r",
    runtime: "vllm",
    runtimeRevision: "r",
    tasks: ["chat", "embedding"],
    vllmEmbeddingQualified: false,
    productionStatus: "unavailable",
  };
  assert.equal(validateWorker(image, "chat").purpose, "inference");
  assert.throws(() => validateWorker(image, "embedding"), /vLLM/);
});
test("fleet preserves isolation fairness ownership and orphan reporting", () => {
  const f = new FakeFleetDispatcher(),
    job = (runId, owner = "a") => ({
      version: "1.0.0",
      runId,
      attemptId: `attempt-${runId}`,
      owner,
      runPrefix: `/workspace/runs/${runId}`,
      credentialEnvNames: ["HF_TOKEN_ENV"],
      cacheNamespace: `cache-${runId}`,
      costCenter: owner,
      status: "queued",
    });
  f.submit(job("r1"));
  f.submit(job("r2", "b"));
  assert.equal(f.next().runId, "r1");
  f.assign("r1", "pod-1", "a");
  assert.deepEqual(f.orphans([]), ["r1"]);
  assert.throws(() => f.cleanup("r1", "b"), /cross-owner/);
  assert.equal(f.cleanup("r1", "a").owned, true);
  assert.throws(() => f.submit({ ...job("r3"), credentialEnvNames: ["token=secret"] }), /secrets/);
});
test("capability status remains unavailable with exact evidence", () => {
  const c = serverlessCapabilities();
  assert.equal(c.status, "unavailable");
  assert.equal(c.training, false);
  assert.equal(c.liveEvidence, false);
  assert.equal(c.flashControlPlane, false);
  assert.equal(c.evidence.openapiSha256, "3cde8a56e91915eecb9669dc6cbe21d3e4f1ea8543436f9df04c0173e120e78a");
});
