import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { canonicalSha256 } from "../core/canonical.js";
import { EmbeddingSdkError, TypedRegistry, type EmbeddingServiceDependencies } from "./sdk.js";
export const embeddingTrainingSpecVersion = "embedding.training.v1" as const;
export const embeddingTrainingEventVersion = "embedding.training.event.v1" as const;
export const embeddingArtifactVersion = "embedding.training.artifact.v1" as const;
export interface EmbeddingTrainingSpecV1 {
  embeddingTrainingSpecVersion: typeof embeddingTrainingSpecVersion;
  qualificationSchemaVersion?: "2.0.0";
  runId: string;
  datasetManifest: string;
  recipeId: string;
  objective: "contrastive" | "multiple-negatives" | "cosine" | "margin";
  outputDirectory: string;
  effectiveBatchSize: number;
  dimension?: number;
  adapter?: "lora" | "full";
  seed?: number;
  immutableIdentity: {
    modelRevision: string;
    tokenizerRevision: string;
    configRevision: string;
    dataHash: string;
    splitHash: string;
    taskMapping: unknown;
    prompts: unknown;
    pooling: string;
    padding: string;
    normalization: unknown;
    dimensions: number[];
    objective: string;
    seed: number;
  };
  allowedRuntimeChanges?: string[];
  trustRemoteCode?: boolean;
  executionGates?: {
    allowModelLoad: boolean;
    licenseApproved: boolean;
    revisionPinned: boolean;
    remoteCodeReviewed: boolean;
    gpuQualified: boolean;
    networkApproved?: boolean;
    downloadsApproved?: boolean;
    budgetApproved?: boolean;
    datasetRightsApproved?: boolean;
    uploadApproved?: boolean;
    architectureQualified?: boolean;
    frameworkQualified?: boolean;
    customKernelApproved?: boolean;
  };
  recipeIdentity?: { modelRevision: string; tokenizerRevision: string };
  trainingArguments?: Record<string, unknown>;
}
export interface EmbeddingTrainingEventV1 {
  embeddingTrainingEventVersion: typeof embeddingTrainingEventVersion;
  sequence: number;
  timestamp: string;
  runId: string;
  type: "started" | "preflight" | "progress" | "checkpoint" | "artifact" | "completed" | "failed";
  data?: Record<string, unknown>;
}
export interface EmbeddingArtifactManifestV1 {
  embeddingArtifactVersion: typeof embeddingArtifactVersion;
  runId: string;
  specHash: string;
  artifacts: Array<{ path: string; sha256: string; bytes: number; kind: string }>;
}
export function assertEmbeddingContractMajor(actual: string, expected: string, contract: string) {
  if (actual.split(".v").at(-1) !== expected.split(".v").at(-1))
    throw new EmbeddingSdkError("EMBED_CONFIG_INVALID", `Incompatible ${contract}: ${actual}`, {
      remediation: `Use ${expected}.`,
    });
}
export interface EmbeddingModelDescriptor {
  id: string;
  status: "unavailable" | "available";
  reason: string;
  evidence: string[];
  dimensions: readonly number[];
}
export interface EmbeddingRecipeDescriptor {
  id: string;
  modelId: string;
  status: "unavailable" | "available";
  reason: string;
  objective: string;
}
export const embeddingModelRegistry = new TypedRegistry<EmbeddingModelDescriptor>([
  {
    id: "cpu-tiny-embedding",
    status: "available",
    reason: "Dependency-light deterministic offline CI fixture.",
    evidence: ["stdlib CPU train/resume/reload/export fixture"],
    dimensions: [2, 4, 8],
  },
  {
    id: "qwen3-embedding-0.6b",
    status: "unavailable",
    reason: "Phase 15 executable trainer evidence is not complete.",
    evidence: [],
    dimensions: [32, 64, 128, 256, 512, 1024],
  },
  {
    id: "arctic-m-v2",
    status: "unavailable",
    reason: "Pinned license/remote-code and model-specific smoke evidence are incomplete.",
    evidence: [],
    dimensions: [256, 768],
  },
  {
    id: "bge-m3",
    status: "unavailable",
    reason: "License discrepancy and native-vs-ST parity evidence are unresolved.",
    evidence: [],
    dimensions: [1024],
  },
  {
    id: "nomic-v2-moe",
    status: "unavailable",
    reason: "Reviewed remote code, expert/router, and save-load evidence are incomplete.",
    evidence: [],
    dimensions: [256, 768],
  },
  {
    id: "gte-multilingual-base",
    status: "unavailable",
    reason: "Reviewed pinned remote-code and clean reload evidence are incomplete.",
    evidence: [],
    dimensions: [768],
  },
]);
export const embeddingRecipeRegistry = new TypedRegistry<EmbeddingRecipeDescriptor>([
  {
    id: "cpu-tiny-embedding-fixture",
    modelId: "cpu-tiny-embedding",
    status: "available",
    reason: "Offline deterministic CI fixture only; not a production model.",
    objective: "multiple-negatives",
  },
  {
    id: "qwen3-embed-0.6b-lora",
    modelId: "qwen3-embedding-0.6b",
    status: "unavailable",
    reason: "Gated until Phase 15 training and reload evidence exists.",
    objective: "multiple-negatives",
  },
  {
    id: "arctic-m-v2-full",
    modelId: "arctic-m-v2",
    status: "unavailable",
    reason: "Gated pending model-specific evidence.",
    objective: "multiple-negatives",
  },
  {
    id: "bge-m3-dense",
    modelId: "bge-m3",
    status: "unavailable",
    reason: "Dense-only gate pending license and parity evidence; sparse/ColBERT are later.",
    objective: "multiple-negatives",
  },
  {
    id: "nomic-v2-moe-native",
    modelId: "nomic-v2-moe",
    status: "unavailable",
    reason: "Gated pending expert/router and native reload evidence.",
    objective: "multiple-negatives",
  },
  {
    id: "gte-multilingual-base-full",
    modelId: "gte-multilingual-base",
    status: "unavailable",
    reason: "Dense-only gate pending reviewed remote code and reload evidence; sparse is later.",
    objective: "multiple-negatives",
  },
]);
export function validateEmbeddingTrainingSpec(value: EmbeddingTrainingSpecV1) {
  if (value.embeddingTrainingSpecVersion !== embeddingTrainingSpecVersion)
    throw new EmbeddingSdkError("EMBED_CONFIG_INVALID", "Unsupported embedding training config version", {
      path: "$.embeddingTrainingSpecVersion",
      remediation: `Set embeddingTrainingSpecVersion to ${embeddingTrainingSpecVersion}.`,
    });
  if (value.effectiveBatchSize < 2)
    throw new EmbeddingSdkError("EMBED_CONFIG_INVALID", "Effective batch size is inadequate for contrastive training", {
      path: "$.effectiveBatchSize",
      remediation: "Use an effective batch size of at least 2; larger in-batch-negative batches are recommended.",
    });
  const required = ["runId", "datasetManifest", "recipeId", "objective", "outputDirectory"] as const;
  for (const key of required)
    if (typeof value[key] !== "string" || !value[key])
      throw new EmbeddingSdkError("EMBED_CONFIG_INVALID", `Missing $.${key}`, {
        path: `$.${key}`,
        remediation: `Provide ${key}.`,
      });
  const identity = value.immutableIdentity as Record<string, unknown> | undefined;
  for (const key of [
    "modelRevision",
    "tokenizerRevision",
    "configRevision",
    "dataHash",
    "splitHash",
    "taskMapping",
    "prompts",
    "pooling",
    "padding",
    "normalization",
    "dimensions",
    "objective",
    "seed",
  ])
    if (!identity || !(key in identity))
      throw new EmbeddingSdkError("EMBED_CONFIG_INVALID", `Missing $.immutableIdentity.${key}`, {
        path: `$.immutableIdentity.${key}`,
        remediation: `Provide immutableIdentity.${key}.`,
      });
  const recipe = embeddingRecipeRegistry.get(value.recipeId);
  if (recipe.status !== "available")
    throw new EmbeddingSdkError("EMBED_UNAVAILABLE", `Recipe is unavailable: ${value.recipeId}`, {
      path: "$.recipeId",
      remediation: recipe.reason,
    });
  return value;
}
export class EmbeddingTrainingRun {
  constructor(
    readonly spec: EmbeddingTrainingSpecV1,
    private readonly dependencies: EmbeddingServiceDependencies = {},
  ) {
    validateEmbeddingTrainingSpec(spec);
  }
  plan() {
    const recipe = embeddingRecipeRegistry.get(this.spec.recipeId);
    return {
      spec: this.spec,
      recipe,
      executable: recipe.status === "available",
      network: false,
      uploads: false,
      trustRemoteCode: false,
      planHash: canonicalSha256(this.spec as never),
    };
  }
  async run(): Promise<unknown> {
    if (!this.dependencies.runTraining)
      throw new EmbeddingSdkError("EMBED_UNAVAILABLE", "No embedding trainer runner was injected", {
        remediation: "Inject the local Python runner; network and uploads remain disabled.",
      });
    return this.dependencies.runTraining(this.spec);
  }
}
export async function inspectEmbeddingArtifact(
  path: string,
): Promise<{ manifest: EmbeddingArtifactManifestV1; verified: boolean }> {
  const manifest = JSON.parse(await readFile(path, "utf8")) as EmbeddingArtifactManifestV1;
  if (manifest.embeddingArtifactVersion !== embeddingArtifactVersion || !Array.isArray(manifest.artifacts))
    throw new Error(`Unsupported embedding artifact manifest: ${manifest.embeddingArtifactVersion ?? "missing"}`);
  const root = await realpath(dirname(path));
  const seen = new Set<string>();
  for (const item of manifest.artifacts) {
    if (isAbsolute(item.path) || item.path.split(/[\\/]/).includes("..") || seen.has(item.path))
      throw new Error(`Unsafe artifact path: ${item.path}`);
    seen.add(item.path);
    const candidate = resolve(root, item.path);
    const info = await lstat(candidate);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error(`Artifact is not a regular file: ${item.path}`);
    const actual = await realpath(candidate);
    if (relative(root, actual).startsWith("..")) throw new Error(`Artifact escapes root: ${item.path}`);
    const bytes = await readFile(actual);
    if ((await stat(actual)).size !== item.bytes || createHash("sha256").update(bytes).digest("hex") !== item.sha256)
      throw new Error(`Artifact verification failed: ${item.path}`);
  }
  return { manifest, verified: true };
}
