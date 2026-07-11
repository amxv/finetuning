import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { canonicalJobHash, createUuidV7, parseExecutionJob, validateEventOrdering } from "../dist/execution/index.js";
import {
  parseRunPodConfig,
  RunPodControlPlane,
  RunPodTransport,
  RUNPOD_OPENAPI_SHA256,
} from "../dist/execution/runpod/index.js";
const h = "a".repeat(64);
const job = (task = "chat") => ({
  apiVersion: "finetuning.amxv.dev/job/v1",
  runId: createUuidV7(1),
  attemptId: "attempt-1",
  attempt: 1,
  task,
  recipe: { id: "r", revision: "1", sha256: h },
  model: { id: "m", revision: "1", sha256: h },
  tokenizer: { id: "t", revision: "1", sha256: h },
  image: { reference: "x", digest: `sha256:${h}` },
  inputs: [],
  resources: { cpu: 2, memoryGiB: 4, gpuCount: 0 },
  precision: "fp32",
  quantization: "none",
  checkpoint: { cadenceSteps: 1, requireCompleteState: true },
  evaluation: { enabled: true },
  export: { format: "test", destination: "file:///tmp/out" },
  deadline: "2030-01-01T00:00:00Z",
});
test("job contracts fail closed and hash canonically", () => {
  for (const task of ["chat", "embedding"]) {
    const v = job(task);
    assert.equal(parseExecutionJob(v).task, task);
    assert.equal(canonicalJobHash(v).length, 64);
  }
  assert.throws(() => parseExecutionJob({ ...job(), future: true }), /UNKNOWN_FIELD/);
  assert.throws(() => parseExecutionJob({ ...job(), task: "future" }), /identity/);
  assert.throws(() => validateEventOrdering([{ sequence: 2 }]), /ORDER/);
});
test("pinned snapshot checksum", async () => {
  const b = await readFile("contracts/runpod/openapi-2026-07-12.json");
  assert.equal(createHash("sha256").update(b).digest("hex"), RUNPOD_OPENAPI_SHA256);
});
test("strict config and fake REST", async () => {
  assert.throws(() => parseRunPodConfig({ apiKey: "secret" }), /unknown config|forbidden/);
  process.env.PHASE20_KEY = "hidden";
  const fake = async () =>
    new Response(JSON.stringify([{ id: "p", name: "n", image: "i", desiredStatus: "RUNNING" }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const cp = new RunPodControlPlane(
    new RunPodTransport(
      { apiKeyEnv: "PHASE20_KEY", baseUrl: "https://rest.runpod.io/v1", timeoutMs: 100, maxResponseBytes: 1024 },
      fake,
    ),
  );
  assert.equal((await cp.listPods())[0].id, "p");
  assert.equal(cp.capabilities().genericExecLogs, false);
});
