import { readFile } from "node:fs/promises";
import { canonicalSha256 } from "../core/canonical.js";
import { parseArtifactManifest, type ArtifactManifestV1 } from "../training/index.js";
import { EmbeddingSdkError, TypedRegistry, type EmbeddingServiceDependencies } from "./sdk.js";
export const embeddingTrainingSpecVersion = "1.0.0" as const;
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
    id: "qwen3-embedding-0.6b",
    status: "unavailable",
    reason: "Phase 15 executable trainer evidence is not complete.",
    evidence: [],
    dimensions: [32, 64, 128, 256, 512, 1024],
  },
]);
export const embeddingRecipeRegistry = new TypedRegistry<EmbeddingRecipeDescriptor>([
  {
    id: "qwen3-embedding-lora",
    modelId: "qwen3-embedding-0.6b",
    status: "unavailable",
    reason: "Gated until Phase 15 training and reload evidence exists.",
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
