import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { inspectRecipe, preflightRecipe, recipeRegistry, templateRegistry } from "../dist/templates/index.js";
import {
  artifactManifestVersion,
  parseArtifactManifest,
  parseTrainingEvent,
  parseTrainingSpec,
  trainingSpecVersion,
} from "../dist/training/index.js";
import { runPythonTrainer } from "../dist/node/index.js";
const execFileAsync = promisify(execFile),
  cli = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));
test("registries keep all model/template identities distinct and unresolved pins fail closed", () => {
  assert.equal(recipeRegistry.length, 7);
  assert.equal(new Set(recipeRegistry.map((x) => x.modelId)).size, 7);
  assert.equal(templateRegistry.length, 7);
  assert.ok(recipeRegistry.filter((x) => x.production).length === 6);
  for (const recipe of recipeRegistry) {
    assert.equal(inspectRecipe(recipe.id), recipe);
    assert.throws(() => preflightRecipe(recipe.id), /unresolved/);
  }
  assert.notEqual(inspectRecipe("olmo-3.1-32b-instruct").templateId, inspectRecipe("olmo-3.1-32b-think").templateId);
});
test("TS contracts accept compatible major and reject incompatible versions", () => {
  const spec = {
    trainingSpecVersion,
    runId: "r",
    dataset: { manifestPath: "/x", recordsHash: "a".repeat(64) },
    recipeId: "cpu-tiny-fixture",
    outputDirectory: "/tmp/out",
    objective: "sft",
    seed: 0,
  };
  assert.deepEqual(parseTrainingSpec(spec), spec);
  assert.throws(() => parseTrainingSpec({ ...spec, trainingSpecVersion: "2.0.0" }), /Incompatible/);
  assert.throws(() => parseTrainingEvent({ trainingEventVersion: "2.0.0" }), /Incompatible/);
  assert.throws(() => parseArtifactManifest({ artifactManifestVersion: "2.0.0" }), /Incompatible/);
});
test("fake Python runner emits ordered events and a valid artifact manifest with safe argv", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "phase6-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, "out"),
    specPath = join(root, "spec ; $(touch nope).json");
  const spec = {
    trainingSpecVersion,
    runId: "fake",
    dataset: { manifestPath: "/tmp/manifest.json", recordsHash: "a".repeat(64) },
    recipeId: "cpu-tiny-fixture",
    outputDirectory: output,
    objective: "sft",
    seed: 0,
  };
  await writeFile(specPath, JSON.stringify(spec));
  const result = await runPythonTrainer({
    pythonExecutable: "python3",
    module: "amxv_finetuning_trainer.fake_runner",
    specPath,
    cwd: resolve("python"),
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(
    result.events.map((x) => x.sequence),
    [0, 1, 2, 3],
  );
  assert.deepEqual(
    result.events.map((x) => x.type),
    ["started", "preflight", "artifact", "completed"],
  );
  assert.equal(
    parseArtifactManifest(JSON.parse(await readFile(join(output, "artifact-manifest.json"), "utf8")))
      .artifactManifestVersion,
    artifactManifestVersion,
  );
  await assert.rejects(
    () => runPythonTrainer({ pythonExecutable: "python3", module: "x", specPath: "relative", cwd: resolve("python") }),
    /absolute/,
  );
});
test("bridge rejects malformed events and forwards cancellation signals", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "phase6-signals-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const malformed = join(root, "malformed.json"),
    slow = join(root, "slow.json");
  await writeFile(malformed, "{}");
  await writeFile(slow, "{}");
  await assert.rejects(
    runPythonTrainer({
      pythonExecutable: "python3",
      module: "amxv_finetuning_trainer.test_runner_cases",
      specPath: malformed,
      cwd: resolve("python"),
    }),
    /Malformed training event/,
  );
  const controller = new AbortController();
  const result = await runPythonTrainer({
    pythonExecutable: "python3",
    module: "amxv_finetuning_trainer.test_runner_cases",
    specPath: slow,
    cwd: resolve("python"),
    signal: controller.signal,
    onEvent: (event) => {
      if (event.type === "started") controller.abort();
    },
  });
  assert.equal(result.exitCode, 130);
  assert.equal(result.events.at(-1).data.reason, "cancelled");
  const preAborted = new AbortController();
  preAborted.abort();
  await assert.rejects(
    runPythonTrainer({
      pythonExecutable: "python3",
      module: "amxv_finetuning_trainer.test_runner_cases",
      specPath: slow,
      cwd: resolve("python"),
      signal: preAborted.signal,
    }),
    { name: "AbortError" },
  );
});
test("chat bridge version, sequence, and callback failures leave no child", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "phase6-protocol-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, pattern] of [
    ["version", /Incompatible/],
    ["sequence", /Out-of-order/],
  ]) {
    const marker = join(root, `${name}.marker`),
      specPath = join(root, `${name}.json`);
    await writeFile(specPath, JSON.stringify({ case: name, track: "chat", marker }));
    await assert.rejects(
      runPythonTrainer({
        pythonExecutable: "python3",
        module: "amxv_finetuning_trainer.test_runner_cases",
        specPath,
        cwd: resolve("python"),
      }),
      pattern,
    );
    await new Promise((resolve) => setTimeout(resolve, 850));
    await assert.rejects(access(marker));
  }
  const callbackPath = join(root, "callback.json");
  await writeFile(callbackPath, JSON.stringify({ case: "cancel", track: "chat" }));
  await assert.rejects(
    runPythonTrainer({
      pythonExecutable: "python3",
      module: "amxv_finetuning_trainer.test_runner_cases",
      specPath: callbackPath,
      cwd: resolve("python"),
      onEvent: () => {
        throw new Error("callback failed");
      },
    }),
    /callback failed/,
  );
});
test("chat abort escalates when SIGTERM is ignored", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "phase6-abort-escalation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const marker = join(root, "orphan.marker"),
    specPath = join(root, "ignore.json");
  await writeFile(specPath, JSON.stringify({ case: "ignore-term", track: "chat", marker }));
  const controller = new AbortController(),
    started = performance.now(),
    observed = [];
  const result = await runPythonTrainer({
    pythonExecutable: "python3",
    module: "amxv_finetuning_trainer.test_runner_cases",
    specPath,
    cwd: resolve("python"),
    signal: controller.signal,
    onEvent: (event) => {
      observed.push(event);
      if (event.type === "started") controller.abort();
    },
  });
  assert.notEqual(result.exitCode, 0);
  const finalEvent = result.events.at(-1);
  assert.strictEqual(observed.at(-1), finalEvent);
  assert.equal(finalEvent.type, "failed");
  assert.equal(finalEvent.data.reason, "cancelled");
  assert.equal(finalEvent.sequence, result.events.at(-2).sequence + 1);
  assert.equal(finalEvent.runId, result.events[0].runId);
  assert(performance.now() - started < 750, "cancellation must complete within escalation bound");
  await new Promise((resolve) => setTimeout(resolve, 350));
  await assert.rejects(access(marker));
});
test("template and training prepare CLI surfaces are additive and fail closed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "phase6-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const inspect = JSON.parse(
    (await execFileAsync(process.execPath, [cli, "template", "inspect", "--id", "qwen3.6-dense", "--json"])).stdout,
  );
  assert.equal(inspect.liveAudit, "not-run");
  const audit = JSON.parse(
    (await execFileAsync(process.execPath, [cli, "template", "audit", "--id", "qwen3.6-dense", "--json"])).stdout,
  );
  assert.equal(audit.executable, false);
  const args = [
    cli,
    "training",
    "prepare",
    "--recipe",
    "qwen3.5-9b-pilot",
    "--run-id",
    "r",
    "--dataset-manifest",
    "/tmp/m.json",
    "--records-hash",
    "a".repeat(64),
    "--out",
    join(root, "out"),
    "--spec-out",
    join(root, "spec.json"),
    "--dry-run",
    "--json",
  ];
  assert.equal(JSON.parse((await execFileAsync(process.execPath, args)).stdout).dryRun, true);
  await assert.rejects(
    execFileAsync(
      process.execPath,
      args.filter((x) => x !== "--dry-run"),
    ),
    (error) => error.stderr.includes("unresolved"),
  );
});
test("direct chat runner rejects resume without checkpoint before output mutation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "phase6-resume-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputDirectory = join(root, "out"),
    specPath = join(root, "resume.json");
  await writeFile(
    specPath,
    JSON.stringify({
      trainingSpecVersion,
      runId: "missing-checkpoint",
      dataset: { manifestPath: join(root, "manifest.json"), recordsHash: "a".repeat(64) },
      recipeId: "cpu-tiny-fixture",
      outputDirectory,
      objective: "sft",
      seed: 0,
      operation: "resume",
    }),
  );
  const result = await runPythonTrainer({
    pythonExecutable: "python3",
    module: "amxv_finetuning_trainer.runner",
    specPath,
    cwd: resolve("python"),
  });
  assert.equal(result.exitCode, 2);
  assert.match(result.events.at(-1).data.message, /CHECKPOINT_REQUIRED/);
  await assert.rejects(access(outputDirectory));
});
