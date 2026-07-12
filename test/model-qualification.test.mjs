import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  inspectQualificationRecipe,
  planRunPodSmoke,
  preflightQualification,
  qualificationRecipes,
  requiredAuthorizationGates,
  validateQualificationEvidence,
} from "../dist/training/qualification.js";

const expected = new Map([
  ["qwen3.6-27b", ["Qwen/Qwen3.6-27B", "6a9e13bd6fc8f0983b9b99948120bc37f49c13e9", "Apache-2.0"]],
  ["qwen3.6-35b-a3b", ["Qwen/Qwen3.6-35B-A3B", "995ad96eacd98c81ed38be0c5b274b04031597b0", "Apache-2.0"]],
  [
    "nemotron-cascade-2-30b-a3b",
    ["nvidia/Nemotron-Cascade-2-30B-A3B", "6327cdbcf907e1c7cec9cb29fb6e6cebdf8feaf7", "LicenseRef-NVIDIA-Open-Model"],
  ],
  [
    "nemotron-3-nano-30b-a3b",
    [
      "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16",
      "cbd3fa9f933d55ef16a84236559f4ee2a0526848",
      "LicenseRef-NVIDIA-Nemotron-Open-Model",
    ],
  ],
  [
    "olmo-3.1-32b-instruct",
    ["allenai/Olmo-3.1-32B-Instruct", "ac0587e4a7744a551c059d8cd17ba220bc940dae", "Apache-2.0"],
  ],
  ["olmo-3.1-32b-think", ["allenai/Olmo-3.1-32B-Think", "832c3f543499af8fe68b88359501de9cb7840544", "Apache-2.0"]],
  ["qwen3-embed-0.6b-lora", ["Qwen/Qwen3-Embedding-0.6B", "97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3", "Apache-2.0"]],
  [
    "arctic-m-v2-full",
    ["Snowflake/snowflake-arctic-embed-m-v2.0", "95c2741480856aa9666782eb4afe11959938017f", "Apache-2.0"],
  ],
  ["bge-m3-dense", ["BAAI/bge-m3", "5617a9f61b028005a4858fdac845db406aefb181", "MIT"]],
  [
    "nomic-v2-moe-native",
    ["nomic-ai/nomic-embed-text-v2-moe", "1066b6599d099fbb93dfcb64f9c37a7c9e503e85", "Apache-2.0"],
  ],
  [
    "gte-multilingual-base-full",
    ["Alibaba-NLP/gte-multilingual-base", "9bbca17d9273fd0d03d5725c7a4b0f6b45142062", "Apache-2.0"],
  ],
]);

test("all exact recipes are configured but neither qualified nor supported", () => {
  assert.equal(qualificationRecipes.length, expected.size);
  for (const recipe of qualificationRecipes) {
    assert.deepEqual([recipe.modelId, recipe.revision, recipe.license.spdx], expected.get(recipe.id));
    assert.equal(recipe.qualification.state, "configured");
    assert.equal(recipe.qualification.supportState, "unavailable");
    assert.ok(recipe.blockers.length > 0);
  }
  assert.equal(inspectQualificationRecipe("bge-m3-dense").license.spdx, "MIT");
  assert.notEqual(inspectQualificationRecipe("nemotron-cascade-2-30b-a3b").license.spdx, "Apache-2.0");
});

test("machine-readable lock records explicit blockers for every configured recipe", async () => {
  const lock = JSON.parse(await readFile(new URL("../locks/model-qualification-v2.json", import.meta.url), "utf8"));
  assert.equal(lock.version, "2.0.0");
  assert.deepEqual(lock.states, ["configured", "smokeAuthorized", "smokePassed", "qualified", "supported"]);
  for (const recipe of lock.recipes) {
    assert.equal(recipe.qualification, "configured");
    assert.equal(recipe.support, "unavailable");
    assert.ok(recipe.blockers.length > 0, `${recipe.id} must record explicit blockers`);
  }
});

test("preflight fails closed and first-wave exclusions cannot execute", () => {
  const allOpen = Object.fromEntries(requiredAuthorizationGates.map((gate) => [gate, true]));
  assert.equal(preflightQualification("qwen3-embed-0.6b-lora").executable, false);
  for (const id of [
    "qwen3.6-35b-a3b",
    "nomic-v2-moe-native",
    "nemotron-cascade-2-30b-a3b",
    "nemotron-3-nano-30b-a3b",
  ]) {
    const result = preflightQualification(id, allOpen);
    assert.equal(result.executable, false);
    assert.match(result.blockers.join(" "), /first smoke wave/);
  }
});

test("RunPod plans are offline and create no resources", () => {
  for (const recipe of qualificationRecipes) {
    const plan = planRunPodSmoke(recipe.id);
    assert.equal(plan.createsResources, false);
    assert.equal(plan.networkCalls, false);
    assert.ok(plan.minimumVramGiB >= 24);
    assert.ok(plan.storageGiB >= 100);
  }
});

test("evidence cannot skip states or claim promotion with an unbound signature", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "qualification-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "evidence.json");
  await writeFile(
    path,
    JSON.stringify({
      evidenceVersion: "1.0.0",
      recipeId: "qwen3-embed-0.6b-lora",
      recipeIdentityHash: "0".repeat(64),
      architecture: "qwen3",
      revision: expected.get("qwen3-embed-0.6b-lora")[1],
      state: "supported",
      previousState: "configured",
      artifactSha256: "a".repeat(64),
      assertions: { smoke: true },
      signatureSha256: "b".repeat(64),
    }),
  );
  await assert.rejects(validateQualificationEvidence(path), /identity|transition|signature/i);
});

test("qualification CLI lists and plans without side effects", async () => {
  const exec = promisify(execFile),
    cli = new URL("../dist/cli/index.js", import.meta.url).pathname;
  const listed = JSON.parse((await exec(process.execPath, [cli, "recipes", "list", "--json"])).stdout);
  assert.equal(listed.length, 11);
  const plan = JSON.parse(
    (await exec(process.execPath, [cli, "recipes", "plan", "--recipe", "qwen3-embed-0.6b-lora", "--json"])).stdout,
  );
  assert.equal(plan.createsResources, false);
});
