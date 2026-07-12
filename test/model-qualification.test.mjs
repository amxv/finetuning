import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  inspectQualificationRecipe,
  planRunPodSmoke,
  preflightQualification,
  qualificationRecipes,
  qualificationEvidenceDigest,
  qualificationTrustPolicyDigest,
  recipeIdentityHash,
  recordQualificationEvidence,
  requiredAuthorizationGates,
} from "../dist/training/qualification.js";
import { parseTrainingSpec, trainingSpecVersion } from "../dist/training/index.js";

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
    assert.equal(recipe.identity.tokenizerRevision, recipe.revision);
    assert.equal(recipe.identity.configRevision, recipe.revision);
    if (recipe.track === "chat") {
      assert.equal(recipe.identity.templateHash.status, "required");
      assert.equal(recipe.rendering.fixtureStatus, "blocked-pending-upstream-artifact-capture");
      assert.deepEqual(recipe.rendering.goldenFixtureIds, []);
    } else {
      assert.equal(recipe.embedding.normalization, "l2");
      assert.ok(["left", "right"].includes(recipe.embedding.paddingSide));
      assert.ok(recipe.embedding.dimensions.length > 0);
    }
  }
  assert.equal(inspectQualificationRecipe("bge-m3-dense").license.spdx, "MIT");
  assert.notEqual(inspectQualificationRecipe("nemotron-cascade-2-30b-a3b").license.spdx, "Apache-2.0");
});

test("machine-readable lock records explicit blockers for every configured recipe", async () => {
  const lock = JSON.parse(await readFile(new URL("../locks/model-qualification-v2.json", import.meta.url), "utf8"));
  assert.equal(lock.version, "2.0.0");
  assert.deepEqual(lock.qualificationStates, ["configured", "smokeAuthorized", "smokePassed", "qualified"]);
  assert.deepEqual(lock.supportStates, ["unavailable", "experimental", "supported"]);
  for (const recipe of lock.recipes) {
    const sdk = inspectQualificationRecipe(recipe.id);
    assert.equal(recipe.qualification, "configured");
    assert.equal(recipe.support, "unavailable");
    assert.ok(recipe.blockers.length > 0, `${recipe.id} must record explicit blockers`);
    assert.deepEqual(
      {
        modelId: recipe.modelId,
        revision: recipe.revision,
        license: recipe.license,
        architecture: recipe.architecture,
        firstWaveExecutable: recipe.firstWaveExecutable,
        blockers: recipe.blockers,
      },
      {
        modelId: sdk.modelId,
        revision: sdk.revision,
        license: sdk.license.spdx,
        architecture: sdk.architecture.modelType,
        firstWaveExecutable: sdk.qualification.firstWaveExecutable,
        blockers: sdk.blockers,
      },
      `${recipe.id} lock/SDK parity`,
    );
  }
});

test("existing support registry keeps every planned recipe unavailable", async () => {
  const support = JSON.parse(await readFile(new URL("../locks/recipe-support-v1.json", import.meta.url), "utf8"));
  for (const id of expected.keys()) {
    const recipe = support.recipes.find((candidate) => candidate.id === id);
    assert.ok(recipe, `${id} must exist in support registry`);
    assert.equal(recipe.status, "unavailable", `${id} cannot be supported without qualification evidence`);
  }
});

test("preflight requires persisted signed evidence and first-wave exclusions cannot execute", async () => {
  assert.equal((await preflightQualification("qwen3-embed-0.6b-lora")).executable, false);
  for (const id of [
    "qwen3.6-27b",
    "qwen3.6-35b-a3b",
    "nomic-v2-moe-native",
    "nemotron-cascade-2-30b-a3b",
    "nemotron-3-nano-30b-a3b",
  ]) {
    const result = await preflightQualification(id);
    assert.equal(result.executable, false);
    assert.match(result.blockers.join(" "), /first smoke wave/);
  }
});

test("qualification v2 training contracts reject raw gates without accepted authorization", () => {
  const gates = {
    allowModelLoad: true,
    licenseApproved: true,
    revisionPinned: true,
    remoteCodeReviewed: true,
    gpuQualified: true,
    ...Object.fromEntries(requiredAuthorizationGates.map((gate) => [gate, true])),
    uploadRequested: false,
    uploadApproved: false,
  };
  const spec = {
    trainingSpecVersion,
    qualificationSchemaVersion: "2.0.0",
    runId: "qualification-contract",
    dataset: { manifestPath: "manifest.json", recordsHash: "a".repeat(64) },
    recipeId: "qwen3-embed-0.6b-lora",
    outputDirectory: "out",
    objective: "sft",
    seed: 1,
    adapter: "lora",
    quantization: "bf16",
    executionGates: gates,
    recipeIdentity: {
      modelRevision: expected.get("qwen3-embed-0.6b-lora")[1],
      tokenizerRevision: expected.get("qwen3-embed-0.6b-lora")[1],
      templateHash: "b".repeat(64),
      reasoningPolicy: "none",
    },
    trainingArguments: {},
  };
  assert.throws(() => parseTrainingSpec(spec), /authorization evidence/i);
  spec.qualificationAuthorization = {
    state: "smokeAuthorized",
    recipeId: spec.recipeId,
    recipeIdentityHash: "c".repeat(64),
    evidenceDigest: "d".repeat(64),
    sequence: 1,
    dischargedBlockers: ["reviewed"],
    storePath: "qualification-store.json",
    storeSha256: "e".repeat(64),
    trustPolicySha256: "f".repeat(64),
    expiresAt: "2026-07-13T00:00:00.000Z",
    architectureEvidenceSha256: "1".repeat(64),
    authorizationHmacSha256: "2".repeat(64),
  };
  assert.equal(parseTrainingSpec(spec).qualificationAuthorization.state, "smokeAuthorized");
});

test("RunPod plans are offline and create no resources", () => {
  for (const recipe of qualificationRecipes) {
    const plan = planRunPodSmoke(recipe.id);
    assert.equal(plan.createsResources, false);
    assert.equal(plan.networkCalls, false);
    assert.equal(plan.executableEnvironment, false);
    assert.deepEqual(plan.image.status, "required");
    assert.equal(plan.image.digest, null);
    assert.ok(plan.minimumVramGiB >= 24);
    assert.ok(plan.storageGiB >= 100);
  }
});

test("evidence promotion is signed, artifact-bound, linked, stateful, and replay-safe", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "qualification-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifactPath = join(root, "artifact.json"),
    evidencePath = join(root, "evidence.json"),
    storePath = join(root, "store.json"),
    artifact = Buffer.from("reviewed manifest bytes"),
    recipe = inspectQualificationRecipe("qwen3-embed-0.6b-lora"),
    { privateKey, publicKey } = generateKeyPairSync("ed25519"),
    trustPolicy = {
      policyVersion: "1.0.0",
      policyId: "independently-pinned-test-admin",
      keys: { reviewer: publicKey.export({ type: "spki", format: "pem" }).toString() },
    },
    expectedTrustPolicySha256 = qualificationTrustPolicyDigest(trustPolicy),
    hash = (value) => createHash("sha256").update(value).digest("hex"),
    bindings = Object.fromEntries(
      [
        "commandSha256",
        "imageDigest",
        "environmentLockSha256",
        "tokenizerSha256",
        "configSha256",
        "templateOrCodeSha256",
        "datasetSha256",
        "targetInventorySha256",
        "dependencyIdentitySha256",
      ].map((key, index) => [key, hash(`${key}-${index}`)]),
    ),
    now = new Date("2026-07-12T12:00:00.000Z");
  await writeFile(artifactPath, artifact);
  const make = (overrides = {}) => {
    const evidence = {
      evidenceVersion: "2.0.0",
      evidenceId: `evidence-${overrides.sequence ?? 1}`,
      sequence: 1,
      recipeId: recipe.id,
      recipeIdentityHash: recipeIdentityHash(recipe),
      architecture: recipe.architecture.modelType,
      revision: recipe.revision,
      state: "smokeAuthorized",
      previousState: "configured",
      predecessorDigest: recipeIdentityHash(recipe),
      issuedAt: "2026-07-12T11:00:00.000Z",
      expiresAt: "2026-07-13T11:00:00.000Z",
      signerKeyId: "reviewer",
      trustPolicySha256: expectedTrustPolicySha256,
      artifactSha256: hash(artifact),
      bindings,
      assertions: {
        policyGatesReviewed: true,
        licenseAccepted: true,
        architectureReviewed: true,
        frameworkReviewed: true,
        datasetRightsReviewed: true,
        offlineExecutionNoUpload: true,
      },
      authorization: {
        gates: {
          ...Object.fromEntries(requiredAuthorizationGates.map((gate) => [gate, true])),
          uploadRequested: false,
          uploadApproved: false,
        },
        dischargedBlockers: [...recipe.blockers],
      },
      signatureBase64: "",
      ...overrides,
    };
    evidence.signatureBase64 = sign(
      null,
      Buffer.from(JSON.stringify({ ...evidence, signatureBase64: "" })),
      privateKey,
    ).toString("base64");
    return evidence;
  };
  const write = async (value) => writeFile(evidencePath, JSON.stringify(value));
  const record = (path = storePath, extra = {}) =>
    recordQualificationEvidence({
      evidencePath,
      artifactPath,
      storePath: path,
      trustPolicy,
      expectedTrustPolicySha256,
      now,
      ...extra,
    });
  await write(make());
  const first = await record();
  assert.equal(first.store.recipes[recipe.id].state, "smokeAuthorized");
  assert.equal(
    (
      await preflightQualification(recipe.id, {
        storePath,
        artifactPath,
        trustPolicy,
        expectedTrustPolicySha256,
        expectedBindings: bindings,
        now,
      })
    ).executable,
    true,
  );
  const fabricatedStorePath = join(root, "fabricated-preflight-store.json");
  const fabricatedStore = structuredClone(first.store);
  fabricatedStore.recipes[recipe.id].currentDigest = "a".repeat(64);
  fabricatedStore.recipes[recipe.id].acceptedEvidence[0].authorization.gates.budgetApproved = false;
  fabricatedStore.recipes[recipe.id].acceptedEvidence[0].authorization.dischargedBlockers = [];
  await writeFile(fabricatedStorePath, JSON.stringify(fabricatedStore));
  assert.equal(
    (
      await preflightQualification(recipe.id, {
        storePath: fabricatedStorePath,
        artifactPath,
        trustPolicy,
        expectedTrustPolicySha256,
        now,
      })
    ).executable,
    false,
  );
  const concurrentStorePath = join(root, "concurrent-store.json");
  await writeFile(`${concurrentStorePath}.lock`, "held by another recorder");
  await assert.rejects(record(concurrentStorePath), /compare-and-swap/i);
  await assert.rejects(
    record(join(root, "untrusted-store.json"), { expectedTrustPolicySha256: "0".repeat(64) }),
    /independently pinned/i,
  );
  await assert.rejects(record(), /transition|replay/i);
  const secondEvidence = make({
    evidenceId: "evidence-2",
    sequence: 2,
    state: "smokePassed",
    previousState: "smokeAuthorized",
    predecessorDigest: first.digest,
    assertions: {
      forwardBackward: true,
      finiteLoss: true,
      finiteNonzeroGradients: true,
      checkpointResume: true,
      offlineReload: true,
    },
    authorization: undefined,
  });
  await write(secondEvidence);
  const second = await record();
  assert.equal(second.store.recipes[recipe.id].state, "smokePassed");
  assert.equal(second.store.recipes[recipe.id].currentDigest, qualificationEvidenceDigest(secondEvidence));
  const forged = make({ evidenceId: "forged-self-consistent", assertions: { invented: true } });
  await write(forged);
  await assert.rejects(record(join(root, "forged-store.json")), /assertions/i);
  await write(make({ artifactSha256: "0".repeat(64) }));
  await assert.rejects(record(join(root, "artifact-store.json")), /artifact digest/i);
  const staleBindings = { ...bindings, dependencyIdentitySha256: hash("drifted-dependencies") };
  await write(make({ bindings: staleBindings }));
  await assert.rejects(record(join(root, "stale-store.json"), { expectedBindings: bindings }), /stale/i);
  await write(
    make({
      evidenceId: "never-accepted-predecessor",
      sequence: 2,
      state: "smokePassed",
      previousState: "smokeAuthorized",
      predecessorDigest: "f".repeat(64),
      assertions: {
        forwardBackward: true,
        finiteLoss: true,
        finiteNonzeroGradients: true,
        checkpointResume: true,
        offlineReload: true,
      },
      authorization: undefined,
    }),
  );
  await assert.rejects(record(join(root, "orphan-store.json")), /transition/i);
  await write(make({ recipeId: "arctic-m-v2-full" }));
  await assert.rejects(record(join(root, "cross-store.json")), /identity/i);
});

test("qualification CLI lists and plans without side effects", async () => {
  const exec = promisify(execFile),
    cli = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));
  const listed = JSON.parse((await exec(process.execPath, [cli, "recipes", "list", "--json"])).stdout);
  assert.equal(listed.length, 11);
  const plan = JSON.parse(
    (await exec(process.execPath, [cli, "recipes", "plan", "--recipe", "qwen3-embed-0.6b-lora", "--json"])).stdout,
  );
  assert.equal(plan.createsResources, false);
});
