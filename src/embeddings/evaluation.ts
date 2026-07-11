import { EmbeddingSdkError, type EmbeddingServiceDependencies } from "./sdk.js";
export interface EmbeddingEvaluationSpecV1 {
  embeddingEvaluationSpecVersion: "1.0.0";
  runId: string;
  datasetManifest: string;
  artifactManifest: string;
  tasks: Array<"retrieval" | "sts" | "classification" | "clustering">;
}
export interface EmbeddingEvaluationReport {
  runId: string;
  status: "unavailable" | "complete";
  metrics: Record<string, number>;
  reason?: string;
}
export class EmbeddingEvaluator {
  constructor(private readonly dependencies: EmbeddingServiceDependencies = {}) {}
  plan(spec: EmbeddingEvaluationSpecV1) {
    return { spec, executable: false, network: false, reason: "Phase 16 evaluator evidence is not complete." };
  }
  async evaluate(_spec: EmbeddingEvaluationSpecV1): Promise<EmbeddingEvaluationReport> {
    await this.dependencies.emit?.({ type: "warning", operation: "evaluate", message: "Evaluator unavailable" });
    throw new EmbeddingSdkError("EMBED_UNAVAILABLE", "Embedding evaluation execution is unavailable in this release", {
      remediation: "Inspect the offline evaluation plan; execution is gated until Phase 16.",
    });
  }
}
