import type { JsonObject, JsonValue } from "../core/model.js";

export const runManifestVersion = "1.0.0" as const;
export const datasetManifestVersion = "1.0.0" as const;
export const stageStateVersion = "1.0.0" as const;
export const eventProtocolVersion = "1.0.0" as const;
export type StageStatus =
  "pending" | "running" | "succeeded" | "failed_retryable" | "failed_terminal" | "skipped" | "review";
export interface DatasetManifestV1 {
  datasetManifestVersion: typeof datasetManifestVersion;
  id: string;
  recordsHash: string;
  recordCount: number;
  blobHashes: string[];
  createdAt: string;
  lineageRoots: string[];
}
export interface RunManifestV1 {
  runManifestVersion: typeof runManifestVersion;
  runId: string;
  stages: StageManifestV1[];
  createdAt: string;
  metadata?: JsonObject;
}
export interface StageManifestV1 {
  stageId: string;
  cacheKey: string;
  dependencies: string[];
  inputManifestHashes: string[];
  normalizedConfig: JsonValue;
  implementationVersion: string;
}
export interface StageAttemptV1 {
  attempt: number;
  status: StageStatus;
  startedAt: string;
  finishedAt?: string;
  leaseExpiresAt?: string;
  outputHash?: string;
  error?: string;
}
export interface StageRecordStateV1 {
  stageStateVersion: typeof stageStateVersion;
  runId: string;
  stageId: string;
  recordId: string;
  attempts: StageAttemptV1[];
}
export interface StructuredEventV1 {
  eventProtocolVersion: typeof eventProtocolVersion;
  timestamp: string;
  runId: string;
  stageId?: string;
  recordId?: string;
  type: string;
  data?: JsonObject;
}
export interface StageDefinition {
  id: string;
  dependencies?: string[];
  inputManifestHashes?: string[];
  config?: JsonValue;
  implementationVersion: string;
  execute(context: {
    runId: string;
    stageId: string;
    emit(type: string, data?: JsonObject): Promise<void>;
  }): Promise<JsonValue>;
}
