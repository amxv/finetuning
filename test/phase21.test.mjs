import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createUuidV7 } from "../dist/execution/index.js";
import {
  FakeRunPodLifecycleBackend,
  planRunPodJob,
  RunPodLifecycleController,
  verifyAndFetchArtifacts,
} from "../dist/execution/runpod/index.js";
const h = "a".repeat(64);
function job(task = "chat") {
  return {
    apiVersion: "finetuning.amxv.dev/job/v1",
    runId: createUuidV7(),
    attemptId: "a1",
    attempt: 1,
    task,
    recipe: { id: "fixture", revision: "1", sha256: h },
    model: { id: "fixture", revision: "1", sha256: h },
    tokenizer: { id: "fixture", revision: "1", sha256: h },
    image: { reference: "fixture", digest: `sha256:${h}` },
    inputs: [],
    resources: { cpu: 2, memoryGiB: 4, gpuCount: 1 },
    precision: "fp32",
    quantization: "none",
    checkpoint: { cadenceSteps: 1, requireCompleteState: true },
    evaluation: { enabled: true },
    export: { format: "fixture", destination: "volume" },
    deadline: new Date(Date.now() + 3_600_000).toISOString(),
  };
}
const evidence = (j) => ({
  gpuType: "NVIDIA TEST",
  vramGiB: 24,
  available: 1,
  dataCenterId: "TEST-1",
  volumeId: "volume-1",
  volumeDataCenterId: "TEST-1",
  hourlyUsd: 0.5,
  storageMonthlyUsd: 1,
  containerGiB: 20,
  volumeGiB: 40,
  checkpointHeadroomGiB: 10,
  maxUsd: 1,
  evidenceAt: new Date().toISOString(),
});
test("chat and embedding plans enforce single GPU locality capacity and budget", () => {
  for (const task of ["chat", "embedding"]) {
    const j = job(task),
      p = planRunPodJob(j, evidence(j));
    assert.equal(p.task, task);
    assert.equal(p.cost.hardCap, false);
    assert.match(p.volume.runPrefix, /workspace\/runs/);
  }
  const j = job();
  assert.throws(() => planRunPodJob(j, { ...evidence(j), available: 0 }), /CAPACITY/);
  assert.throws(() => planRunPodJob(j, { ...evidence(j), volumeDataCenterId: "OTHER" }), /LOCALITY/);
  assert.throws(() => planRunPodJob(j, { ...evidence(j), maxUsd: 0.01 }), /BUDGET/);
});
test("fake lifecycle reconciles timeout-after-create and is idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "p21-")),
    backend = new FakeRunPodLifecycleBackend(),
    j = job(),
    p = planRunPodJob(j, evidence(j));
  backend.volumes.push({ id: "volume-1", name: "v", dataCenterId: "TEST-1", sizeGiB: 40, ownershipMarker: "owner" });
  backend.failAfter = "createPod";
  const ctl = new RunPodLifecycleController(backend, join(root, "state.json"), "owner");
  await assert.rejects(() => ctl.launch(j, p), /timeout/);
  backend.failAfter = undefined;
  const reconciled = await new RunPodLifecycleController(backend, join(root, "reconcile.json"), "owner").launch(j, p);
  assert.equal(reconciled.podId, "pod-1");
  assert.equal(backend.pods.length, 1);
  const duplicate = await new RunPodLifecycleController(backend, join(root, "reconcile.json"), "owner").launch(j, p);
  assert.equal(duplicate.podId, "pod-1");
  assert.equal((await statMode(join(root, "reconcile.json"))) & 0o777, 0o600);
  const stopped = await new RunPodLifecycleController(backend, join(root, "reconcile.json"), "owner").stop();
  assert.equal(stopped.status, "stopped");
  await assert.rejects(
    () => new RunPodLifecycleController(backend, join(root, "reconcile.json"), "owner").terminate(false),
    /--yes/,
  );
  const term = await new RunPodLifecycleController(backend, join(root, "reconcile.json"), "owner").terminate(true);
  assert.equal(term.status, "terminated");
  assert.equal(backend.volumes.length, 1);
});
test("cleanup refuses foreign volume and fetch verifies hashes", async () => {
  const root = await mkdtemp(join(tmpdir(), "p21-")),
    backend = new FakeRunPodLifecycleBackend(),
    j = job(),
    p = planRunPodJob(j, evidence(j)),
    ctl = new RunPodLifecycleController(backend, join(root, "state.json"), "owner");
  backend.volumes.push({ id: "volume-1", name: "v", dataCenterId: "TEST-1", sizeGiB: 40, ownershipMarker: "owner" });
  await ctl.launch(j, p);
  backend.volumes[0].ownershipMarker = "foreign";
  await assert.rejects(
    () => ctl.cleanup({ deleteRunPrefix: false, deleteVolume: true, yes: true, dryRun: false }),
    /foreign/,
  );
  const source = join(root, "source"),
    dest = join(root, "dest");
  await import("node:fs/promises").then((fs) => fs.mkdir(source));
  await writeFile(join(source, "result.json"), "ok");
  const sha = createHash("sha256").update("ok").digest("hex");
  assert.equal(
    (
      await verifyAndFetchArtifacts(
        source,
        dest,
        [{ uri: "volume:///result.json", sha256: sha, mediaType: "application/json" }],
        j.runId,
      )
    ).verified,
    1,
  );
  await writeFile(join(source, "result.json"), "tampered");
  await assert.rejects(
    () =>
      verifyAndFetchArtifacts(
        source,
        dest,
        [{ uri: "volume:///result.json", sha256: sha, mediaType: "application/json" }],
        j.runId,
      ),
    /hash mismatch/,
  );
});
async function statMode(path) {
  return (await import("node:fs/promises")).stat(path).then((x) => x.mode);
}
test("CLI exposes every lifecycle verb and requires strict live opt-in", async () => {
  const { spawnSync } = await import("node:child_process");
  const help = spawnSync(process.execPath, ["dist/cli/index.js", "runpod", "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  for (const verb of [
    "init",
    "doctor",
    "plan",
    "launch",
    "status",
    "connect",
    "cancel",
    "stop",
    "terminate",
    "cleanup",
    "resume",
    "fetch",
    "orphans",
    "cost",
    "volume",
  ])
    assert.match(help.stdout, new RegExp(verb));
  const blocked = spawnSync(process.execPath, ["dist/cli/index.js", "runpod", "launch", "--json"], {
    encoding: "utf8",
  });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /LIVE_OPT_IN_REQUIRED/);
  const dry = spawnSync(process.execPath, ["dist/cli/index.js", "runpod", "terminate", "--dry-run", "--json"], {
    encoding: "utf8",
  });
  assert.equal(dry.status, 0);
  const value = JSON.parse(dry.stdout);
  assert.equal(value.dryRun, true);
  assert.equal(value.requiresYes, true);
});
