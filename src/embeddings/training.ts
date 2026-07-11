import { readFile } from "node:fs/promises";
import { canonicalSha256 } from "../core/canonical.js";
import { parseArtifactManifest, type ArtifactManifestV1 } from "../training/index.js";
import { EmbeddingSdkError, TypedRegistry, type EmbeddingServiceDependencies } from "./sdk.js";
export const embeddingTrainingSpecVersion = "embedding.training.v1" as const;
export const embeddingTrainingEventVersion = "embedding.training.event.v1" as const;
export const embeddingArtifactVersion = "embedding.training.artifact.v1" as const;
export interface EmbeddingTrainingSpecV1 {
  embeddingTrainingSpecVersion: typeof embeddingTrainingSpecVersion;
  runId: string;
  datasetManifest: string;
  recipeId: string;
  objective: "contrastive" | "multiple-negatives" | "cosine" | "margin";
  outputDirectory: string;
  effectiveBatchSize: number;
  dimension?: number;
  adapter?: "lora" | "full";
  seed?: number;
  immutableIdentity?: Record<string, unknown>;
  allowedRuntimeChanges?: string[];
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
    id: "qwen3-embedding-lora",
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
  async run(): Promise<never> {
    await this.dependencies.emit?.({ type: "warning", operation: "train", message: "Trainer unavailable" });
    throw new EmbeddingSdkError("EMBED_UNAVAILABLE", "Embedding training execution is unavailable in this release", {
      remediation: "Use the dry-run plan; execution is gated until Phase 15.",
    });
  }
}
export async function inspectEmbeddingArtifact(
  path: string,
): Promise<{ manifest: ArtifactManifestV1; verified: boolean }> {
  const manifest = parseArtifactManifest(JSON.parse(await readFile(path, "utf8")));
  return { manifest, verified: manifest.artifacts.every((x) => /^[a-f0-9]{64}$/.test(x.sha256)) };
}
