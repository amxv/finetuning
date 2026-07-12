import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { embeddingModelRegistry, embeddingRecipeRegistry } from "../dist/embeddings/training.js";
import { recipeRegistry as chatRecipes } from "../dist/templates/index.js";
import { trainingEventVersion, trainingSpecVersion } from "../dist/training/index.js";
import { embeddingTrainingEventVersion, embeddingTrainingSpecVersion } from "../dist/embeddings/training.js";
import { qloraProfile } from "../dist/execution/runpod/hardening.js";
import { runNpm } from "./lib/npm-command.mjs";

const exec = promisify(execFile),
  root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const json = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const support = await json("locks/recipe-support-v1.json");
const modelLocks = await json("locks/embedding-models-v1.json");
const compatibility = await json("schemas/protocol-compatibility-v1.json");
const provenance = await json("RELEASE-PROVENANCE.json");
const inventory = await json("locks/license-notice-inventory-v1.json");
const pythonEvidence = await json("python/amxv_finetuning_trainer/recipe-evidence.json");
assert.equal(provenance.publishAuthorized, false);
assert.equal(provenance.independentAcceptanceComplete, false);
assert.equal(inventory.packageLicense.expression, "Apache-2.0");
assert.equal(compatibility.npm.version, compatibility.python.version);
assert.equal(compatibility.protocols.chatTrainingSpec, trainingSpecVersion);
assert.equal(compatibility.protocols.chatEvents, trainingEventVersion);
assert.equal(compatibility.protocols.embeddingTrainingSpec, embeddingTrainingSpecVersion);
assert.equal(compatibility.protocols.embeddingEvents, embeddingTrainingEventVersion);
assert.deepEqual(
  modelLocks.models.map((x) => x.status),
  Array(5).fill("unavailable"),
);
assert.deepEqual(
  embeddingModelRegistry
    .list()
    .filter((x) => x.id !== "cpu-tiny-embedding")
    .map((x) => x.status),
  Array(5).fill("unavailable"),
);
assert.deepEqual(
  embeddingRecipeRegistry
    .list()
    .filter((x) => x.id !== "cpu-tiny-embedding-fixture")
    .map((x) => x.status),
  Array(5).fill("unavailable"),
);
const canonicalEmbeddingRecipeIds = support.recipes.filter((x) => x.track === "embedding").map((x) => x.id);
assert.deepEqual(
  embeddingRecipeRegistry
    .list()
    .filter((x) => x.id !== "cpu-tiny-embedding-fixture")
    .map((x) => x.id),
  canonicalEmbeddingRecipeIds.filter((x) => x !== "cpu-tiny-embedding-fixture"),
);
const pythonRecipeIds = JSON.parse(
  (
    await exec(
      "python3",
      ["-c", "import json; from amxv_finetuning_trainer.framework import RECIPES; print(json.dumps(list(RECIPES)))"],
      { cwd: root, env: { ...process.env, PYTHONPATH: join(root, "python") } },
    )
  ).stdout,
);
assert.deepEqual(Object.keys(pythonEvidence.recipes), pythonRecipeIds);
assert.deepEqual(
  pythonRecipeIds.filter((x) => pythonEvidence.recipes[x]),
  Object.keys(pythonEvidence.recipes),
);
assert.equal(qloraProfile("qwen3-embed-0.6b-lora").recipeId, "qwen3-embed-0.6b-lora");
assert.throws(() => qloraProfile("qwen3-embedding-lora"), /QLORA_RECIPE_UNAVAILABLE/);
assert(!pythonRecipeIds.includes("qwen3-embedding-lora"));
assert(!embeddingRecipeRegistry.list().some((x) => x.id === "qwen3-embedding-lora"));
for (const recipe of chatRecipes) assert(support.recipes.some((x) => x.track === "chat" && x.id === recipe.id));
for (const model of modelLocks.models) {
  const row = support.recipes.find((x) => x.track === "embedding" && x.modelId === model.modelId);
  assert(row);
  assert.equal(row.status, model.status);
}
assert.equal(support.recipes.find((x) => x.id === "cpu-tiny-embedding-fixture").status, "supported");
assert(support.recipes.find((x) => x.id === "bge-m3-dense").laterExperimental.includes("hybrid"));
assert(support.recipes.find((x) => x.id === "gte-multilingual-base-full").laterExperimental.includes("sparse"));

const directory = await mkdtemp(join(tmpdir(), "finetuning-release-"));
try {
  const pack = async (dest) =>
    JSON.parse(
      (await runNpm(exec, ["pack", "--json", "--ignore-scripts", "--pack-destination", dest], { cwd: root })).stdout,
    )[0];
  const first = await pack(directory),
    second = await pack(directory);
  assert.equal(first.integrity, second.integrity, "npm pack is not reproducible");
  const names = first.files.map((x) => x.path);
  for (const required of [
    "NOTICE",
    "RELEASE-PROVENANCE.json",
    "locks/recipe-support-v1.json",
    "locks/license-notice-inventory-v1.json",
    "schemas/protocol-compatibility-v1.json",
    "examples/embedding-offline/records.jsonl",
    "schemas/embedding-training-spec-v1.schema.json",
  ])
    assert(names.includes(required), `missing ${required}`);
  assert.deepEqual(
    names.filter((x) =>
      /(^|\/)(python|node_modules|tmp|gg|__pycache__)(\/|$)|\.(safetensors|pt|bin|pem|key)$/i.test(x),
    ),
    [],
  );
  const secretPattern = /(sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|BEGIN (RSA |OPENSSH )?PRIVATE KEY)/;
  for (const file of names.filter((x) => /\.(json|jsonl|md|js|d\.ts)$|^(NOTICE|README|LICENSE)/.test(x))) {
    const source = join(root, file);
    try {
      assert.doesNotMatch(await readFile(source, "utf8"), secretPattern, `secret-like value in ${file}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log(
  `Verified release readiness: ${support.recipes.length} recipe statuses, ${modelLocks.models.length} unavailable production embedding locks, reproducible private NPM artifact, compatibility/license/provenance inventories.`,
);
