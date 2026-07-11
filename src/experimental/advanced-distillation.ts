import { canonicalSha256 } from "../core/canonical.js";

export const advancedDistillationVersion = "1.0.0" as const;
export interface ExperimentalTrainingSpecV1 {
  version: typeof advancedDistillationVersion;
  runId: string;
  objective: "dpo" | "orpo" | "logit" | "feature";
  recipeId: "cpu-tiny-dpo" | "cpu-tiny-orpo" | "local-logit" | "local-feature";
  datasetShape: "preference-pairs" | "top-k-logits" | "layer-features";
  outputDirectory: string;
  seed: number;
}
export type AdvancedDistillationErrorCode =
  | "ADVANCED_LOCAL_TEACHER_REQUIRED"
  | "ADVANCED_CAPABILITY_UNSUPPORTED"
  | "LOGIT_TOPK_INVALID"
  | "LOGIT_RESIDUAL_INVALID"
  | "LOGIT_STORAGE_LIMIT"
  | "TOKENIZER_MISMATCH"
  | "VOCAB_ALIGNMENT_INVALID"
  | "FEATURE_LAYER_INVALID"
  | "FEATURE_SHAPE_MISMATCH"
  | "FEATURE_PROJECTION_INVALID"
  | "TENSOR_HASH_MISMATCH";
export class AdvancedDistillationError extends Error {
  constructor(
    readonly code: AdvancedDistillationErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
  }
}
export function preflightExperimentalTraining(spec: ExperimentalTrainingSpecV1): void {
  const expected =
    spec.objective === "dpo" || spec.objective === "orpo"
      ? "preference-pairs"
      : spec.objective === "logit"
        ? "top-k-logits"
        : "layer-features";
  if (spec.version !== advancedDistillationVersion || spec.datasetShape !== expected)
    throw new Error(`EXPERIMENTAL_DATA_SHAPE_MISMATCH: ${spec.objective} requires ${expected}`);
  if (!Number.isInteger(spec.seed) || !spec.outputDirectory || !spec.runId)
    throw new Error("EXPERIMENTAL_SPEC_INVALID");
}
export interface TensorReferenceV1 {
  uri: string;
  sha256: string;
  bytes: number;
  shape: number[];
  dtype: "float32" | "float16" | "bfloat16";
}
export interface LocalLogitTargetV1 {
  version: typeof advancedDistillationVersion;
  teacher: { kind: "local"; model: string; revision: string };
  tokenizer: { id: string; revision: string; vocabularyHash: string };
  studentTokenizer: { id: string; revision: string; vocabularyHash: string };
  vocabularyMap?: Record<number, number>;
  temperature: number;
  positions: Array<{ tokenIndex: number; topK: Array<{ tokenId: number; probability: number }>; residualMass: number }>;
  approximation: { kind: "top-k-plus-residual"; k: number };
  maxBytes: number;
}
export interface LocalFeatureTargetV1 {
  version: typeof advancedDistillationVersion;
  teacher: { kind: "local"; model: string; revision: string; layer: string; dimension: number };
  student: { model: string; revision: string; layer: string; dimension: number };
  projection: {
    kind: "identity" | "linear";
    inputDimension: number;
    outputDimension: number;
    tensor?: TensorReferenceV1;
  };
  activations: TensorReferenceV1;
  mask: TensorReferenceV1;
  pooling: "token" | "mean" | "last";
  loss: { kind: "mse" | "cosine"; weight: number };
}
export function rejectBlackBoxAdvancedCapability(provider: string, capability: "logits" | "features"): never {
  throw new AdvancedDistillationError(
    provider === "openai" || provider === "anthropic"
      ? "ADVANCED_CAPABILITY_UNSUPPORTED"
      : "ADVANCED_LOCAL_TEACHER_REQUIRED",
    `${provider} response teachers cannot provide ${capability}; use an explicitly local teacher plugin`,
  );
}
export function validateLogitTarget(target: LocalLogitTargetV1): void {
  if (target.teacher.kind !== "local")
    throw new AdvancedDistillationError("ADVANCED_LOCAL_TEACHER_REQUIRED", "logits require a local teacher");
  if (!(target.temperature > 0) || target.approximation.k < 1)
    throw new AdvancedDistillationError("LOGIT_TOPK_INVALID", "temperature and k must be positive");
  if (target.tokenizer.vocabularyHash !== target.studentTokenizer.vocabularyHash && !target.vocabularyMap)
    throw new AdvancedDistillationError("TOKENIZER_MISMATCH", "provide an explicit vocabulary mapping");
  for (const position of target.positions) {
    const sum = position.topK.reduce((n, item) => n + item.probability, 0);
    if (
      position.topK.length > target.approximation.k ||
      new Set(position.topK.map((x) => x.tokenId)).size !== position.topK.length
    )
      throw new AdvancedDistillationError("LOGIT_TOPK_INVALID", "top-k entries are invalid");
    if (position.residualMass < 0 || Math.abs(sum + position.residualMass - 1) > 1e-6)
      throw new AdvancedDistillationError(
        "LOGIT_RESIDUAL_INVALID",
        "top-k probability plus residual mass must equal one",
      );
  }
  const estimated = Buffer.byteLength(JSON.stringify(target));
  if (estimated > target.maxBytes)
    throw new AdvancedDistillationError("LOGIT_STORAGE_LIMIT", `${estimated} bytes exceeds ${target.maxBytes}`);
}
export function validateFeatureTarget(target: LocalFeatureTargetV1, tensorBytes?: Uint8Array): void {
  if (target.teacher.kind !== "local")
    throw new AdvancedDistillationError("ADVANCED_LOCAL_TEACHER_REQUIRED", "features require a local teacher");
  if (!target.teacher.layer || !target.student.layer)
    throw new AdvancedDistillationError("FEATURE_LAYER_INVALID", "teacher and student layer identities are required");
  if (
    target.projection.inputDimension !== target.teacher.dimension ||
    target.projection.outputDimension !== target.student.dimension
  )
    throw new AdvancedDistillationError("FEATURE_PROJECTION_INVALID", "projection dimensions do not align");
  if (target.projection.kind === "identity" && target.teacher.dimension !== target.student.dimension)
    throw new AdvancedDistillationError("FEATURE_SHAPE_MISMATCH", "identity projection requires equal dimensions");
  if (tensorBytes && canonicalSha256(Array.from(tensorBytes) as never) !== target.activations.sha256)
    throw new AdvancedDistillationError("TENSOR_HASH_MISMATCH", "activation tensor digest does not match");
}
