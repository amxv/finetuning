import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
  cli = new URL("../dist/cli/index.js", import.meta.url).pathname;
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
    recipeId: "qwen3.5-9b-pilot",
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
    recipeId: "pilot",
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
  setTimeout(() => controller.abort(), 50);
  const result = await runPythonTrainer({
    pythonExecutable: "python3",
    module: "amxv_finetuning_trainer.test_runner_cases",
    specPath: slow,
    cwd: resolve("python"),
    signal: controller.signal,
  });
  assert.equal(result.exitCode, 130);
  assert.equal(result.events.at(-1).data.reason, "cancelled");
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
