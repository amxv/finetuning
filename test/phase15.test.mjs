import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  assertEmbeddingContractMajor,
  embeddingModelRegistry,
  embeddingRecipeRegistry,
  embeddingTrainingSpecVersion,
} from "../dist/embeddings/training.js";
const exec = promisify(execFile),
  cli = new URL("../dist/cli/index.js", import.meta.url).pathname;
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
