import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  blockersForState,
  inspectQualificationRecipe,
  qualificationEvidenceDigest,
  qualificationRecipes,
  qualificationTrustPolicyDigest,
  recipeIdentityHash,
  recordQualificationEvidence,
  requiredAuthorizationGates,
} from "../dist/training/qualification.js";

const root = process.argv[2];
if (!root) throw new Error("output directory is required");
await mkdir(root, { recursive: true });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const sortDeep = (value) => {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortDeep(value[key])]),
    );
  return value;
};
const canonical = (value) => JSON.stringify(sortDeep(value));
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const trustPolicy = {
  policyVersion: "1.0.0",
  policyId: "cross-runtime-golden",
  keys: { reviewer: publicKey.export({ type: "spki", format: "pem" }).toString() },
};
const trustPolicySha256 = qualificationTrustPolicyDigest(trustPolicy);
const trustPolicyPath = join(root, "trust-policy.json");
await writeFile(trustPolicyPath, JSON.stringify(trustPolicy));
const v2Gates = {
  ...Object.fromEntries(requiredAuthorizationGates.map((gate) => [gate, true])),
  uploadRequested: false,
  uploadApproved: false,
};
const executionGates = {
  allowModelLoad: true,
  licenseApproved: true,
  revisionPinned: true,
  remoteCodeReviewed: true,
  gpuQualified: true,
  ...v2Gates,
};
const phases = [
  {
    state: "smokeAuthorized",
    operationClass: "mechanicsSmoke",
    operation: "run",
    assertions: {
      policyGatesReviewed: true,
      licenseAccepted: true,
      architectureReviewed: true,
      frameworkReviewed: true,
      datasetRightsReviewed: true,
      offlineExecutionNoUpload: true,
    },
  },
  {
    state: "smokePassed",
    operationClass: "qualificationRun",
    operation: "evaluate",
    assertions: {
      forwardBackward: true,
      finiteLoss: true,
      finiteNonzeroGradients: true,
      checkpointResume: true,
      offlineReload: true,
    },
  },
  {
    state: "qualified",
    operationClass: "experimentalUse",
    operation: "export",
    assertions: { repeatedCleanRun: true, evaluation: true, export: true, artifactManifestVerified: true },
  },
];
const previousStates = ["configured", "smokeAuthorized", "smokePassed"];
const bundles = [];

async function createLifecycle(recipe, suffix, expiries, recordNow) {
  const directory = join(root, `${recipe.id}-${suffix}`);
  await mkdir(directory, { recursive: true });
  const artifactPath = join(directory, "artifact.bin");
  const artifact = Buffer.from(`cross-runtime-artifact:${recipe.id}:${suffix}`);
  await writeFile(artifactPath, artifact);
  const bindings = Object.fromEntries(
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
    ].map((key) => [key, hash(`${recipe.id}:${suffix}:${key}`)]),
  );
  const architectureEvidence = { inventorySha256: bindings.targetInventorySha256 };
  const architectureEvidenceSha256 = hash(canonical(architectureEvidence));
  const liveStorePath = join(directory, "store.json");
  let predecessorDigest = recipeIdentityHash(recipe);
  for (const [index, phase] of phases.entries()) {
    const sequence = index + 1;
    const evidence = {
      evidenceVersion: "2.0.0",
      evidenceId: `${recipe.id}-${suffix}-${sequence}`,
      sequence,
      recipeId: recipe.id,
      recipeIdentityHash: recipeIdentityHash(recipe),
      architecture: recipe.architecture.modelType,
      revision: recipe.revision,
      state: phase.state,
      previousState: previousStates[index],
      predecessorDigest,
      issuedAt: recordNow.toISOString(),
      expiresAt: expiries[index],
      signerKeyId: "reviewer",
      trustPolicySha256,
      artifactSha256: hash(artifact),
      bindings,
      assertions: phase.assertions,
      authorization: {
        operationClass: phase.operationClass,
        gates: v2Gates,
        dischargedBlockers: blockersForState(recipe, phase.state),
      },
      signatureBase64: "",
    };
    evidence.signatureBase64 = sign(
      null,
      Buffer.from(JSON.stringify({ ...evidence, signatureBase64: "" })),
      privateKey,
    ).toString("base64");
    const evidencePath = join(directory, `evidence-${sequence}.json`);
    await writeFile(evidencePath, JSON.stringify(evidence));
    const result = await recordQualificationEvidence({
      evidencePath,
      artifactPath,
      storePath: liveStorePath,
      trustPolicy,
      expectedTrustPolicySha256: trustPolicySha256,
      now: recordNow,
    });
    predecessorDigest = qualificationEvidenceDigest(evidence);
    if (result.digest !== predecessorDigest) throw new Error("recorded evidence digest drifted");
    const snapshotPath = join(directory, `store-${sequence}.json`);
    await copyFile(liveStorePath, snapshotPath);
    const outputDirectory = join(directory, `output-${sequence}`);
    const authorization = {
      state: phase.state,
      recipeId: recipe.id,
      recipeIdentityHash: recipeIdentityHash(recipe),
      evidenceDigest: result.digest,
      sequence,
      dischargedBlockers: blockersForState(recipe, phase.state),
      storePath: snapshotPath,
      storeSha256: hash(await readFile(snapshotPath)),
      trustPolicySha256,
      expiresAt: expiries[index],
      architectureEvidenceSha256,
      operationClass: phase.operationClass,
      operation: phase.operation,
      outputDirectory,
      artifactSha256: hash(artifact),
      evidenceBindings: bindings,
      signerKeyId: "reviewer",
      authorizationSignatureBase64: "",
    };
    const payload = {
      recipeId: authorization.recipeId,
      recipeIdentityHash: authorization.recipeIdentityHash,
      evidenceDigest: authorization.evidenceDigest,
      sequence: authorization.sequence,
      dischargedBlockers: authorization.dischargedBlockers,
      storeSha256: authorization.storeSha256,
      trustPolicySha256: authorization.trustPolicySha256,
      expiresAt: authorization.expiresAt,
      architectureEvidenceSha256,
      operationClass: authorization.operationClass,
      operation: authorization.operation,
      outputDirectory,
      artifactSha256: authorization.artifactSha256,
      evidenceBindings: bindings,
      executionGates,
    };
    authorization.authorizationSignatureBase64 = sign(null, Buffer.from(canonical(payload)), privateKey).toString(
      "base64",
    );
    if (suffix !== "expired-predecessor" || sequence === 2)
      bundles.push({
        recipeId: recipe.id,
        state: phase.state,
        scenario: suffix,
        spec: {
          qualificationSchemaVersion: "2.0.0",
          recipeId: recipe.id,
          operation: phase.operation,
          outputDirectory,
          executionGates,
          qualificationAuthorization: authorization,
          architectureEvidence,
        },
      });
    if (suffix === "expired-predecessor" && sequence === 2) return;
  }
}

for (const recipe of qualificationRecipes)
  await createLifecycle(
    recipe,
    "current",
    ["2099-01-01T00:00:00Z", "2099-01-01T00:00:00Z", "2099-01-01T00:00:00Z"],
    new Date("2026-07-12T00:00:00Z"),
  );
await createLifecycle(
  inspectQualificationRecipe("qwen3-embed-0.6b-lora"),
  "expired-predecessor",
  ["2026-07-11T00:00:00Z", "2099-01-01T00:00:00Z", "2099-01-01T00:00:00Z"],
  new Date("2026-07-10T00:00:00Z"),
);
await writeFile(join(root, "bundle.json"), JSON.stringify({ trustPolicyPath, trustPolicySha256, bundles }));
