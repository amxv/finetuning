export const trainingApiVersion = "1.0.0" as const;
export const trainingSpecVersion = "1.0.0" as const;
export const trainingEventVersion = "1.0.0" as const;
export const artifactManifestVersion = "1.0.0" as const;

export interface TrainingSpecV1 {
  trainingSpecVersion: typeof trainingSpecVersion;
  runId: string;
  dataset: { manifestPath: string; recordsHash: string };
  recipeId: string;
  outputDirectory: string;
  objective: "sft";
  seed: number;
}
export interface TrainingEventV1 {
  trainingEventVersion: typeof trainingEventVersion;
  sequence: number;
  timestamp: string;
  runId: string;
  type: "started" | "preflight" | "progress" | "artifact" | "completed" | "failed";
  data?: Record<string, unknown>;
}
export interface ArtifactManifestV1 {
  artifactManifestVersion: typeof artifactManifestVersion;
  runId: string;
  createdAt: string;
  artifacts: Array<{ path: string; sha256: string; bytes: number; kind: string }>;
  trainingSpecHash: string;
}
export function assertCompatibleMajor(actual: string, expected: string, contract: string): void {
  if (actual.split(".")[0] !== expected.split(".")[0])
    throw new Error(`Incompatible ${contract} major version ${actual}; expected ${expected}`);
}
export function parseTrainingSpec(value: unknown): TrainingSpecV1 {
  if (!isObject(value) || typeof value.trainingSpecVersion !== "string") throw new Error("Invalid TrainingSpecV1");
  assertCompatibleMajor(value.trainingSpecVersion, trainingSpecVersion, "TrainingSpecV1");
  if (
    typeof value.runId !== "string" ||
    typeof value.recipeId !== "string" ||
    typeof value.outputDirectory !== "string" ||
    value.objective !== "sft" ||
    !Number.isInteger(value.seed) ||
    !isObject(value.dataset) ||
    typeof value.dataset.manifestPath !== "string" ||
    typeof value.dataset.recordsHash !== "string"
  )
    throw new Error("Invalid TrainingSpecV1 fields");
  return value as unknown as TrainingSpecV1;
}
export function parseTrainingEvent(value: unknown): TrainingEventV1 {
  if (!isObject(value) || typeof value.trainingEventVersion !== "string") throw new Error("Invalid TrainingEventV1");
  assertCompatibleMajor(value.trainingEventVersion, trainingEventVersion, "TrainingEventV1");
  if (
    !Number.isInteger(value.sequence) ||
    typeof value.timestamp !== "string" ||
    typeof value.runId !== "string" ||
    typeof value.type !== "string"
  )
    throw new Error("Invalid TrainingEventV1 fields");
  return value as unknown as TrainingEventV1;
}
export function parseArtifactManifest(value: unknown): ArtifactManifestV1 {
  if (!isObject(value) || typeof value.artifactManifestVersion !== "string")
    throw new Error("Invalid ArtifactManifestV1");
  assertCompatibleMajor(value.artifactManifestVersion, artifactManifestVersion, "ArtifactManifestV1");
  if (typeof value.runId !== "string" || !Array.isArray(value.artifacts) || typeof value.trainingSpecHash !== "string")
    throw new Error("Invalid ArtifactManifestV1 fields");
  return value as unknown as ArtifactManifestV1;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
