import {
  canonicalSerialize,
  canonicalSha256,
  type CanonicalMessageV1,
  type DatasetSplitV1,
  type DecisionV1,
  type ProvenanceV1,
} from "../core/canonical.js";
import type { JsonValue } from "../core/model.js";

export const preferenceRecordVersion = "1.0.0" as const;
export interface PreferenceCandidateV1 {
  id: string;
  messages: CanonicalMessageV1[];
  provenance: { provider: string; model: string; requestId: string; candidateId: string; createdAt: string };
  contentHash: string;
}
export interface PreferenceRecordV1 {
  preferenceRecordVersion: typeof preferenceRecordVersion;
  id: string;
  prompt: CanonicalMessageV1[];
  chosen: PreferenceCandidateV1;
  rejected: PreferenceCandidateV1;
  source: ProvenanceV1;
  judge: { provider: string; model: string; requestId: string; scores: Record<string, number>; rationale?: string };
  decisions: DecisionV1[];
  groupId: string;
  leakageGroup: string;
  split: DatasetSplitV1;
  createdAt: string;
  contentHash?: string;
}
export interface PreferenceCodecResult {
  records: PreferenceRecordV1[];
  losses: Array<{ line: number; code: string; message: string }>;
}
export function withPreferenceHash(record: PreferenceRecordV1): PreferenceRecordV1 {
  const { contentHash: _ignored, ...content } = record;
  return { ...record, contentHash: canonicalSha256(content as never) };
}
export function validatePreferenceRecord(value: unknown): asserts value is PreferenceRecordV1 {
  if (!isObject(value) || value.preferenceRecordVersion !== preferenceRecordVersion)
    throw new Error("PREFERENCE_VERSION_UNSUPPORTED");
  for (const key of ["id", "groupId", "leakageGroup", "createdAt"] as const)
    if (typeof value[key] !== "string" || !value[key]) throw new Error(`PREFERENCE_FIELD_INVALID: ${key}`);
  if (!Array.isArray(value.prompt) || !isObject(value.chosen) || !isObject(value.rejected))
    throw new Error("PREFERENCE_PAIR_INVALID");
  if (value.chosen.id === value.rejected.id)
    throw new Error("PREFERENCE_PAIR_IDENTICAL: chosen and rejected must differ");
  if (!isObject(value.judge) || !Array.isArray(value.decisions) || !isObject(value.source))
    throw new Error("PREFERENCE_PROVENANCE_REQUIRED");
  if (!["train", "validation", "test"].includes(String(value.split))) throw new Error("PREFERENCE_SPLIT_INVALID");
  for (const side of [value.chosen, value.rejected]) {
    if (!Array.isArray(side.messages) || typeof side.contentHash !== "string" || !isObject(side.provenance))
      throw new Error("PREFERENCE_CANDIDATE_INVALID");
    if (canonicalSha256(side.messages as never) !== side.contentHash)
      throw new Error("PREFERENCE_CANDIDATE_HASH_MISMATCH");
  }
}
export function encodePreferenceJsonl(records: PreferenceRecordV1[]): string {
  return `${records
    .map((record) => {
      validatePreferenceRecord(record);
      return canonicalSerialize(withPreferenceHash(record) as unknown as JsonValue);
    })
    .join("\n")}\n`;
}
export function decodePreferenceJsonl(text: string): PreferenceCodecResult {
  const records: PreferenceRecordV1[] = [],
    losses: PreferenceCodecResult["losses"] = [];
  text.split("\n").forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const value: unknown = JSON.parse(line);
      validatePreferenceRecord(value);
      records.push(value);
    } catch (error) {
      losses.push({
        line: index + 1,
        code: "PREFERENCE_ROW_REJECTED",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return { records, losses };
}
function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
