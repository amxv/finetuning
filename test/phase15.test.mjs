import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  assertEmbeddingContractMajor,
  embeddingModelRegistry,
  embeddingRecipeRegistry,
  embeddingTrainingSpecVersion,
} from "../dist/embeddings/training.js";
import { runPythonEmbeddingTrainer } from "../dist/node/index.js";
const exec = promisify(execFile),
  cli = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));
test("embedding protocol, five-recipe honesty, and CPU CLI train/resume/export", async (t) => {
  assert.equal(embeddingTrainingSpecVersion, "embedding.training.v1");
  assert.throws(
    () => assertEmbeddingContractMajor("embedding.training.v2", embeddingTrainingSpecVersion, "spec"),
    /Incompatible/,
  );
  assert.equal(embeddingModelRegistry.list().filter((x) => x.status === "unavailable").length, 5);
  assert.equal(embeddingRecipeRegistry.list().filter((x) => x.status === "unavailable").length, 5);
  const root = await mkdtemp(join(tmpdir(), "phase15-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const data = join(root, "data"),
    out = join(root, "out");
  await mkdir(data);
  await writeFile(join(data, "manifest.json"), "{}\n");
  await writeFile(
    join(data, "records.jsonl"),
    JSON.stringify({ query: { text: "hello" }, document: { text: "world" } }) + "\n",
  );
  const base = {
    embeddingTrainingSpecVersion: "embedding.training.v1",
    runId: "r",
    datasetManifest: join(data, "manifest.json"),
    recipeId: "cpu-tiny-embedding-fixture",
    objective: "multiple-negatives",
    outputDirectory: out,
    effectiveBatchSize: 2,
    immutableIdentity: {
      modelRevision: "fixture",
      tokenizerRevision: "fixture",
      configRevision: "fixture",
      dataHash: "a".repeat(64),
      splitHash: "b".repeat(64),
      taskMapping: "pair",
      prompts: { query: "q:", document: "" },
      pooling: "mean",
      padding: "right",
      normalization: "l2",
      dimensions: [2],
      objective: "multiple-negatives",
      seed: 7,
    },
    allowedRuntimeChanges: ["operation", "checkpointPath"],
  };
  const config = join(root, "config.json");
  await writeFile(config, JSON.stringify({ configVersion: "1.0.0", defaults: base }));
  const run = async (verb, extra = []) =>
    JSON.parse(
      (
        await exec(process.execPath, [
          cli,
          "embed",
          "train",
          verb,
          "--config",
          config,
          "--python-root",
          resolve("python"),
          "--json",
          ...extra,
        ])
      ).stdout,
    );
  await assert.rejects(run("resume"), /checkpoint/i);
  await assert.rejects(access(join(out, ".embedding-resume.json")));
  await assert.rejects(run("inspect"), /artifact/i);
  await assert.rejects(access(join(out, ".embedding-inspect.json")));

  const directOut = join(root, "direct-out"),
    directSpec = join(root, "direct-resume.json");
  await writeFile(directSpec, JSON.stringify({ ...base, outputDirectory: directOut, operation: "resume" }));
  const direct = await runPythonEmbeddingTrainer({
    pythonExecutable: "python3",
    specPath: directSpec,
    cwd: resolve("python"),
  });
  assert.equal(direct.exitCode, 2);
  assert.match(direct.events.at(-1).data.message, /CHECKPOINT_REQUIRED/);
  await assert.rejects(access(directOut));
  assert.equal((await run("run")).execution.exitCode, 0);
  const checkpoint = join(out, "checkpoint-4.json");
  assert.equal(
    (await run("status", ["--checkpoint", checkpoint])).execution.events.at(-1).data.checkpointClassification,
    "full-resume",
  );
  assert.equal((await run("resume", ["--checkpoint", checkpoint])).execution.events.at(-1).type, "completed");
  assert((await run("export")).execution.events.some((x) => x.type === "artifact"));
  assert.equal(
    JSON.parse(await readFile(join(out, "embedding-artifact-manifest.json"), "utf8")).embeddingArtifactVersion,
    "embedding.training.artifact.v1",
  );
});

test("embedding bridge cancellation and protocol failures close children", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "phase15-bridge-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runCase = async (name, options = {}) => {
    const marker = join(root, `${name}.marker`);
    const specPath = join(root, `${name}.json`);
    await writeFile(specPath, JSON.stringify({ case: name, track: "embedding", marker }));
    const promise = runPythonEmbeddingTrainer({
      pythonExecutable: "python3",
      module: "amxv_finetuning_trainer.test_runner_cases",
      specPath,
      cwd: resolve("python"),
      ...options,
    });
    return { promise, marker };
  };
  for (const [name, pattern] of [
    ["malformed", /Malformed embedding/],
    ["version", /Incompatible/],
    ["sequence", /Out-of-order/],
  ]) {
    const { promise, marker } = await runCase(name);
    await assert.rejects(promise, pattern);
    await new Promise((resolve) => setTimeout(resolve, 850));
    await assert.rejects(access(marker));
  }
  const callback = await runCase("cancel", {
    onEvent: () => {
      throw new Error("callback failed");
    },
  });
  await assert.rejects(callback.promise, /callback failed/);

  const controller = new AbortController();
  const cancelled = await runCase("cancel", { signal: controller.signal, onEvent: () => controller.abort() });
  assert.equal((await cancelled.promise).exitCode, 130);
  const pre = new AbortController();
  pre.abort();
  const preCase = await runCase("cancel", { signal: pre.signal });
  await assert.rejects(preCase.promise, { name: "AbortError" });
});
test("embedding abort escalates when SIGTERM is ignored", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "phase15-abort-escalation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const marker = join(root, "orphan.marker"),
    specPath = join(root, "ignore.json");
  await writeFile(specPath, JSON.stringify({ case: "ignore-term", track: "embedding", marker }));
  const controller = new AbortController(),
    started = performance.now();
  const result = await runPythonEmbeddingTrainer({
    pythonExecutable: "python3",
    module: "amxv_finetuning_trainer.test_runner_cases",
    specPath,
    cwd: resolve("python"),
    signal: controller.signal,
    onEvent: () => controller.abort(),
  });
  assert.notEqual(result.exitCode, 0);
  assert(performance.now() - started < 750, "cancellation must complete within escalation bound");
  await new Promise((resolve) => setTimeout(resolve, 350));
  await assert.rejects(access(marker));
});
