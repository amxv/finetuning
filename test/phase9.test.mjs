import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { canonicalSha256 } from "../dist/core/canonical.js";
import {
  AdvancedDistillationError,
  decodePreferenceJsonl,
  encodePreferenceJsonl,
  preflightExperimentalTraining,
  rejectBlackBoxAdvancedCapability,
  validateFeatureTarget,
  validateLogitTarget,
} from "../dist/experimental/index.js";
const exec = promisify(execFile);
const message = (text) => [{ role: "assistant", content: [{ type: "text", text }] }];
test("advanced APIs are package-isolated from the stable root", async () => {
  const root = await import("../dist/index.js");
  assert.equal("validateLogitTarget" in root, false);
  const experimental = await import("../dist/experimental/index.js");
  assert.equal(typeof experimental.validateLogitTarget, "function");
});
test("DPO and ORPO specs enforce preference-pair data shape", () => {
  for (const objective of ["dpo", "orpo"])
    preflightExperimentalTraining({
      version: "1.0.0",
      runId: "r",
      objective,
      recipeId: objective === "dpo" ? "cpu-tiny-dpo" : "cpu-tiny-orpo",
      datasetShape: "preference-pairs",
      outputDirectory: "out",
      seed: 1,
    });
  assert.throws(
    () =>
      preflightExperimentalTraining({
        version: "1.0.0",
        runId: "r",
        objective: "dpo",
        recipeId: "cpu-tiny-dpo",
        datasetShape: "top-k-logits",
        outputDirectory: "out",
        seed: 1,
      }),
    /DATA_SHAPE_MISMATCH/,
  );
});
test("preference codec round-trips stable chosen/rejected lineage and reports loss", () => {
  const chosen = message("good"),
    rejected = message("bad");
  const record = {
    preferenceRecordVersion: "1.0.0",
    id: "p1",
    prompt: [{ role: "user", content: [{ type: "text", text: "help" }] }],
    chosen: {
      id: "c",
      messages: chosen,
      provenance: {
        provider: "local",
        model: "tiny",
        requestId: "r1",
        candidateId: "c",
        createdAt: "1970-01-01T00:00:00Z",
      },
      contentHash: canonicalSha256(chosen),
    },
    rejected: {
      id: "r",
      messages: rejected,
      provenance: {
        provider: "local",
        model: "tiny",
        requestId: "r1",
        candidateId: "r",
        createdAt: "1970-01-01T00:00:00Z",
      },
      contentHash: canonicalSha256(rejected),
    },
    source: { source: "fixture" },
    judge: { provider: "local", model: "judge", requestId: "j1", scores: { chosen: 1, rejected: 0 } },
    decisions: [{ id: "d", kind: "judge", outcome: "accepted" }],
    groupId: "g",
    leakageGroup: "lg",
    split: "train",
    createdAt: "1970-01-01T00:00:00Z",
  };
  const decoded = decodePreferenceJsonl(encodePreferenceJsonl([record]) + "{bad\n");
  assert.equal(decoded.records.length, 1);
  assert.equal(decoded.losses[0].code, "PREFERENCE_ROW_REJECTED");
  assert.equal(decoded.records[0].chosen.provenance.requestId, "r1");
});
test("logit targets validate top-k residual, storage, tokenizer mapping and reject API claims", () => {
  const base = {
    version: "1.0.0",
    teacher: { kind: "local", model: "t", revision: "1" },
    tokenizer: { id: "t", revision: "1", vocabularyHash: "a" },
    studentTokenizer: { id: "s", revision: "1", vocabularyHash: "a" },
    temperature: 1,
    positions: [{ tokenIndex: 0, topK: [{ tokenId: 1, probability: 0.7 }], residualMass: 0.3 }],
    approximation: { kind: "top-k-plus-residual", k: 1 },
    maxBytes: 10000,
  };
  validateLogitTarget(base);
  assert.throws(
    () => validateLogitTarget({ ...base, studentTokenizer: { ...base.studentTokenizer, vocabularyHash: "b" } }),
    /TOKENIZER_MISMATCH/,
  );
  assert.throws(() => validateLogitTarget({ ...base, maxBytes: 1 }), /LOGIT_STORAGE_LIMIT/);
  for (const provider of ["openai", "anthropic"])
    assert.throws(
      () => rejectBlackBoxAdvancedCapability(provider, "logits"),
      (e) => e instanceof AdvancedDistillationError && e.code === "ADVANCED_CAPABILITY_UNSUPPORTED",
    );
});
test("feature layer/projection/shape and content hash gates fail closed", () => {
  const target = {
    version: "1.0.0",
    teacher: { kind: "local", model: "t", revision: "1", layer: "l2", dimension: 2 },
    student: { model: "s", revision: "1", layer: "l1", dimension: 2 },
    projection: { kind: "identity", inputDimension: 2, outputDimension: 2 },
    activations: { uri: "blob", sha256: canonicalSha256([1, 2]), bytes: 2, shape: [1, 2], dtype: "float32" },
    mask: { uri: "mask", sha256: "x", bytes: 1, shape: [1], dtype: "float32" },
    pooling: "token",
    loss: { kind: "mse", weight: 1 },
  };
  validateFeatureTarget(target, new Uint8Array([1, 2]));
  assert.throws(
    () => validateFeatureTarget({ ...target, student: { ...target.student, dimension: 3 } }),
    /FEATURE_PROJECTION_INVALID/,
  );
});
test("Python tiny DPO ORPO logit feature checkpoint and artifact experiments", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phase9-"));
  try {
    const code = `from pathlib import Path\nfrom amxv_finetuning_trainer.experimental import *\np=Path(r'${dir}')\na=preference_loss([2.,1.],[0.,0.],\"dpo\");b=preference_loss([2.,1.],[0.,0.],\"orpo\")\nassert a>0 and b>0\nt=topk_target([1.,2.,3.],2,1.,1000);assert abs(sum(x[\"probability\"] for x in t[\"topK\"])+t[\"residualMass\"]-1)<1e-9\nalign_vocabulary(\"a\",\"b\",{0:1})\nassert feature_loss([[1.,2.]],[[1.,2.]],None,[1])==0\nimmutable={\"objective\":\"dpo\",\"tokenizer\":\"x\"};checkpoint(p/\"checkpoint.json\",{\"immutable\":immutable,\"step\":2});assert resume(p/\"checkpoint.json\",immutable)[\"step\"]==2\nr=write_tensor(p,\"features.bin\",b\"tiny\",[1,4],10);verify_tensor(p,r)\n(p/r[\"path\"]).write_bytes(b\"evil\")\ntry:verify_tensor(p,r);raise AssertionError()\nexcept ValueError as e:assert \"HASH_MISMATCH\" in str(e)\n`;
    await writeFile(join(dir, "run.py"), code);
    await exec("python3", [join(dir, "run.py")], {
      cwd: fileURLToPath(new URL("../python/", import.meta.url)),
      env: { ...process.env, PYTHONPATH: fileURLToPath(new URL("../python/", import.meta.url)) },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
