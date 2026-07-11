import { createHash } from "node:crypto";
import type { JsonObject, JsonValue, ToolSchema } from "./model.js";

export const datasetSchemaVersion = "1.0.0" as const;
export type DatasetSplitV1 = "train" | "validation" | "test";
export type CanonicalRoleV1 = "system" | "user" | "assistant" | "tool";

export type ContentPartV1 =
  | { type: "text"; text: string }
  | { type: "json"; value: JsonValue }
  | { type: "external"; mediaType: string; uri: string; sha256?: string };

export interface CanonicalToolCallV1 {
  id: string;
  name: string;
  arguments: JsonObject;
}

export interface CanonicalMessageV1 {
  role: CanonicalRoleV1;
  content: ContentPartV1[];
  name?: string;
  toolCallId?: string;
  toolCalls?: CanonicalToolCallV1[];
  metadata?: JsonObject;
}

export interface ProvenanceV1 {
  source: string;
  sourceId?: string;
  license?: string;
  collectedAt?: string;
  metadata?: JsonObject;
}

export interface TransformationV1 {
  id: string;
  kind: string;
  createdAt: string;
  configuration?: JsonObject;
  parentHash?: string;
}

export interface DecisionV1 {
  id: string;
  kind: string;
  outcome: "accepted" | "rejected" | "review";
  reason?: string;
  metadata?: JsonObject;
}

export interface DatasetExampleV1 {
  datasetSchemaVersion: typeof datasetSchemaVersion;
  id: string;
  messages: CanonicalMessageV1[];
  tools?: ToolSchema[];
  provenance: ProvenanceV1;
  parentIds?: string[];
  transformations?: TransformationV1[];
  decisions?: DecisionV1[];
  groupId?: string;
  leakageGroup?: string;
  split?: DatasetSplitV1;
  metadata?: JsonObject;
  createdAt: string;
  contentHash?: string;
}

export function canonicalSerialize(value: JsonValue | DatasetExampleV1): string {
  return JSON.stringify(sortJson(value as unknown as JsonValue));
}

export function canonicalSha256(value: JsonValue | DatasetExampleV1): string {
  return createHash("sha256").update(canonicalSerialize(value)).digest("hex");
}

export function withContentHash(example: DatasetExampleV1): DatasetExampleV1 {
  const { contentHash: _ignored, ...content } = example;
  return { ...example, contentHash: canonicalSha256(content as DatasetExampleV1) };
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJson(value[key] as JsonValue)]),
    );
  }
  return value;
}
