import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assertUploadPolicy,
  qloraProfile,
  rankCapacityAlternatives,
  reconcileCosts,
  selectRecovery,
  validateDistributed,
  validateModuleCoverage,
} from "../dist/execution/runpod/index.js";
test("architecture QLoRA matrix fails closed and reports exact coverage", () => {
  for (const id of [
    "qwen3.6-27b",
    "qwen3.6-35b-a3b",
    "nemotron-cascade-2-30b-a3b",
    "nemotron-3-nano-30b-a3b",
    "olmo-3.1-32b-instruct",
    "qwen3-embed-0.6b-lora",
  ]) {
    const p = qloraProfile(id);
    assert.equal(p.productionStatus, "unavailable");
    const modules = p.requiredTargets.map((x) => `layer.${x}`);
    assert.equal(validateModuleCoverage(p, modules, modules).passed, true);
    assert.equal(validateModuleCoverage(p, modules, modules.slice(1)).passed, false);
  }
  assert.throws(() => qloraProfile("unknown"), /UNAVAILABLE/);
});
test("distributed contracts require NCCL evidence and refuse world-size changes", () => {
  const base = {
    mode: "ddp",
    worldSize: 2,
    visibleDevices: ["0", "1"],
    topology: "single-node",
    ncclEvidence: "passed",
    effectiveBatchSize: 8,
    microBatchSize: 2,
    gradientAccumulation: 2,
    samplerSeed: 42,
    checkpointWorldSize: 2,
    metricTolerance: 0.001,
  };
  assert.equal(validateDistributed(base).productionStatus, "unavailable");
  assert.throws(() => validateDistributed({ ...base, ncclEvidence: "not-run" }), /NCCL/);
  assert.throws(() => validateDistributed({ ...base, checkpointWorldSize: 1 }), /WORLD_SIZE/);
  assert.throws(() => validateDistributed({ ...base, effectiveBatchSize: 7 }), /EFFECTIVE_BATCH/);
});
test("recovery skips corrupt/partial latest and enforces loss bound", () => {
  const old = Buffer.from("valid"),
    sha = createHash("sha256").update(old).digest("hex");
  const cps = [
    { path: "latest", step: 10, complete: true, sha256: "0".repeat(64), contents: Buffer.from("bad"), worldSize: 1 },
    { path: "partial", step: 9, complete: false, sha256: sha, contents: old, worldSize: 1 },
    { path: "good", step: 8, complete: true, sha256: sha, contents: old, worldSize: 1 },
  ];
  const r = selectRecovery(cps, 1, 10, 2, 2);
  assert.equal(r.checkpoint, "good");
  assert.equal(r.lossWindowSteps, 2);
  assert.equal(r.fallbacks.length, 2);
  assert.throws(() => selectRecovery(cps, 2, 10, 2, 2), /WORLD_SIZE/);
  assert.throws(() => selectRecovery(cps, 1, 20, 2, 2), /LOSS_BOUND/);
});
test("capacity alternatives never silently change semantics and require confirmation", () => {
  const plan = { volume: { dataCenterId: "A" }, cost: { hourlyUsd: 1 } };
  const ranked = rankCapacityAlternatives(
    plan,
    [
      { gpuType: "cheap", vramGiB: 24, dataCenterId: "A", hourlyUsd: 0.5, available: 1 },
      { gpuType: "foreign", vramGiB: 80, dataCenterId: "B", hourlyUsd: 0.2, available: 1 },
      { gpuType: "small", vramGiB: 8, dataCenterId: "A", hourlyUsd: 0.1, available: 1 },
    ],
    20,
  );
  assert.equal(ranked[0].gpuType, "cheap");
  assert.equal(ranked[0].requiresConfirmation, true);
  assert.equal(ranked[0].changes.precision, false);
  assert.equal(ranked.filter((x) => x.compatible).length, 1);
});
test("cost report separates estimate observed billed and upload defaults off", () => {
  const report = reconcileCosts({
    runId: "r",
    estimatedComputeUsd: 2,
    estimatedStorageUsd: 1,
    estimateAt: "2026-01-01T00:00:00Z",
    elapsedSeconds: 3600,
    hourlyUsd: 1,
    observedAt: "2026-01-02T00:00:00Z",
    billedComputeUsd: 0.9,
    billingThrough: "2026-01-01T23:00:00Z",
    billingRetrievedAt: "2026-01-02T00:00:00Z",
    retainedResources: ["volume:v"],
  });
  assert.equal(report.hardCap, false);
  assert.equal(report.billed.lagging, true);
  assert.deepEqual(assertUploadPolicy({ enabled: false, explicitAction: false }), { enabled: false });
  assert.throws(() => assertUploadPolicy({ enabled: true, explicitAction: false }), /UPLOAD_REQUIRES/);
  assert.equal(
    assertUploadPolicy({ enabled: true, explicitAction: true, credentialEnv: "HF_WRITE_TOKEN" }).credentialEnv,
    "HF_WRITE_TOKEN",
  );
});
test("doctor and resume CLI report support honestly", async () => {
  const { spawnSync } = await import("node:child_process");
  const doctor = spawnSync(process.execPath, ["dist/cli/index.js", "runpod", "doctor", "--json"], { encoding: "utf8" });
  assert.equal(doctor.status, 0);
  const d = JSON.parse(doctor.stdout);
  assert.deepEqual(d.trainingHardening.distributedModes.productionQualified, []);
  assert.equal(d.trainingHardening.spot.startsWith("unavailable"), true);
  const resume = spawnSync(process.execPath, ["dist/cli/index.js", "runpod", "resume", "--dry-run", "--json"], {
    encoding: "utf8",
  });
  assert.equal(resume.status, 0);
  const r = JSON.parse(resume.stdout);
  assert.match(r.worldSizeChange, /refused/);
});
