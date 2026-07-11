import { canonicalSha256, type DatasetSplitV1, type ProvenanceV1, type TransformationV1 } from "../core/canonical.js";
export const embeddingRecordVersion = "1.0.0" as const;
export const embeddingDatasetManifestVersion = "1.0.0" as const;
export interface EmbeddingTextV1 {
  id: string;
  text: string;
  textHash: string;
  entityId?: string;
  documentId?: string;
  corpusId?: string;
  language: string;
  domain: string;
}
interface Base {
  embeddingRecordVersion: typeof embeddingRecordVersion;
  id: string;
  contentHash?: string;
  kind: string;
  task: string;
  split: DatasetSplitV1;
  splitGroup: string;
  parentGroup?: string;
  translationGroup?: string;
  syntheticGroup?: string;
  source: ProvenanceV1 & { revision: string; license: string; rights: string };
  transformations: TransformationV1[];
  /** Safely preserved external fields, keyed by codec namespace. */
  metadata?: Record<string, unknown>;
  createdAt: string;
}
export type EmbeddingRecordV1 = Base &
  (
    | { kind: "query-document"; query: EmbeddingTextV1; document: EmbeddingTextV1 }
    | { kind: "retrieval-set"; query: EmbeddingTextV1; positives: EmbeddingTextV1[]; negatives: EmbeddingTextV1[] }
    | { kind: "triplet"; anchor: EmbeddingTextV1; positive: EmbeddingTextV1; negative: EmbeddingTextV1 }
    | { kind: "boolean-pair"; left: EmbeddingTextV1; right: EmbeddingTextV1; label: boolean }
    | { kind: "categorical-pair"; left: EmbeddingTextV1; right: EmbeddingTextV1; label: string; labelDomain: string[] }
    | {
        kind: "scored-pair" | "sts";
        left: EmbeddingTextV1;
        right: EmbeddingTextV1;
        score: number;
        scale: { min: number; max: number; direction: "higher-is-more-similar" | "lower-is-more-similar" };
      }
    | { kind: "classification" | "clustering"; text: EmbeddingTextV1; label: string; labelDomain: string[] }
    | { kind: "instruction-aware"; instruction: string; text: EmbeddingTextV1; role: "query" | "document" }
    | { kind: "teacher-vector"; text: EmbeddingTextV1; teacher: TeacherV1; vector: VectorV1 }
    | {
        kind: "teacher-score";
        query: EmbeddingTextV1;
        document: EmbeddingTextV1;
        teacher: TeacherV1;
        score: number;
        scale: { min: number; max: number; direction: "higher-is-more-relevant" | "lower-is-more-relevant" };
        margin?: number;
      }
    | {
        kind: "teacher-ranking";
        query: EmbeddingTextV1;
        teacher: TeacherV1;
        candidatePoolId: string;
        corpusId: string;
        candidates: Array<{ id: string; documentId: string }>;
        ranking: string[];
      }
  );
export interface TeacherV1 {
  provider: string;
  model: string;
  revision: string;
  requestId: string;
  createdAt: string;
}
export interface VectorShardRefV1 {
  sha256: string;
  uri: string;
  bytes: number;
  dtype: "float16" | "float32" | "bfloat16";
  shape: number[];
  norm: "l2" | "none";
  dimension: number;
  model: string;
  revision: string;
  pooling: string;
  prompt: string;
  projection?: string;
}
export type VectorV1 =
  | { storage: "inline"; values: number[]; dimension: number; norm: "l2" | "none" }
  | { storage: "shard"; ref: VectorShardRefV1 };
export interface EmbeddingDatasetManifestV1 {
  embeddingDatasetManifestVersion: typeof embeddingDatasetManifestVersion;
  id: string;
  recordsHash: string;
  recordCount: number;
  recordKinds: string[];
  splitGroups: string[];
  sourceRevisions: string[];
  vectorShards: VectorShardRefV1[];
  contaminationScanHash: string;
  createdAt: string;
}
export function embeddingText(
  text: string,
  identity: { entityId?: string; documentId?: string; corpusId?: string; language: string; domain: string },
): EmbeddingTextV1 {
  const textHash = canonicalSha256(text);
  return { id: canonicalSha256({ textHash, ...identity } as never), text, textHash, ...identity };
}
export function withEmbeddingHash<T extends EmbeddingRecordV1>(record: T): T {
  const { contentHash: _, ...content } = record;
  return { ...record, contentHash: canonicalSha256(content as never) };
}
export function validateEmbeddingRecord(record: EmbeddingRecordV1): void {
  if (record.embeddingRecordVersion !== embeddingRecordVersion) fail("EMBED_VERSION");
  if (
    !record.id ||
    !record.splitGroup ||
    !record.split ||
    !record.source?.revision ||
    !record.source.license ||
    !record.source.rights
  )
    fail("EMBED_PROVENANCE_REQUIRED");
  const texts = collectTexts(record);
  for (const text of texts) {
    if (!text.text.trim()) fail("EMBED_TEXT_REQUIRED");
    if (canonicalSha256(text.text) !== text.textHash) fail("EMBED_TEXT_HASH");
  }
  if (
    (record.kind === "scored-pair" || record.kind === "sts") &&
    (!Number.isFinite(record.score) ||
      !Number.isFinite(record.scale.min) ||
      !Number.isFinite(record.scale.max) ||
      !(record.scale.min < record.scale.max) ||
      record.score < record.scale.min ||
      record.score > record.scale.max)
  )
    fail("EMBED_SCORE_SCALE");
  if (
    record.kind === "teacher-score" &&
    (!Number.isFinite(record.score) ||
      !record.scale ||
      !(record.scale.min < record.scale.max) ||
      record.score < record.scale.min ||
      record.score > record.scale.max)
  )
    fail("EMBED_SCORE_SCALE");
  if (
    (record.kind === "categorical-pair" || record.kind === "classification" || record.kind === "clustering") &&
    (!record.labelDomain.length || !record.labelDomain.includes(record.label))
  )
    fail("EMBED_LABEL_DOMAIN");
  if (record.kind === "boolean-pair" && typeof record.label !== "boolean") fail("EMBED_LABEL_DOMAIN");
  if (
    record.kind === "instruction-aware" &&
    (!record.instruction.trim() || record.text.text.startsWith(record.instruction))
  )
    fail("EMBED_INSTRUCTION_SEPARATION");
  if (record.kind === "teacher-ranking") {
    const ids = new Set(record.candidates.map((x) => x.id));
    if (
      !record.candidatePoolId ||
      !record.corpusId ||
      ids.size !== record.candidates.length ||
      new Set(record.ranking).size !== record.ranking.length ||
      record.ranking.some((id) => !ids.has(id))
    )
      fail("EMBED_RANKING_POOL");
  }
  if (record.kind.startsWith("teacher-") && !((record as any).teacher?.revision && (record as any).teacher?.requestId))
    fail("EMBED_TEACHER_PROVENANCE");
  if (record.kind === "teacher-vector" && record.vector.storage === "inline") {
    if (
      record.vector.values.length !== record.vector.dimension ||
      record.vector.values.some((x) => !Number.isFinite(x))
    )
      fail("EMBED_VECTOR_SHAPE");
    const norm = Math.sqrt(record.vector.values.reduce((n, x) => n + x * x, 0));
    if (record.vector.norm === "l2" && Math.abs(norm - 1) > 1e-5) fail("EMBED_VECTOR_NORM");
  }
  if (record.kind === "retrieval-set") {
    if (!record.positives.length) fail("EMBED_POSITIVE_REQUIRED");
    const positives = new Set(record.positives.map((x) => x.textHash));
    if (record.negatives.some((x) => positives.has(x.textHash))) fail("EMBED_POSITIVE_NEGATIVE_CONFLICT");
  }
}
function collectTexts(value: unknown, seen = new Set<EmbeddingTextV1>()): EmbeddingTextV1[] {
  if (!value || typeof value !== "object") return [...seen];
  if ("text" in value && "textHash" in value && typeof value.text === "string") seen.add(value as EmbeddingTextV1);
  for (const child of Array.isArray(value) ? value : Object.values(value)) collectTexts(child, seen);
  return [...seen];
}
function fail(code: string): never {
  throw new Error(code);
}
export type PreflightCode =
  | "EMBED_LOCK_UNAVAILABLE"
  | "EMBED_MUTABLE_REVISION"
  | "EMBED_LICENSE_MUTATED"
  | "EMBED_RIGHTS_MISSING"
  | "EMBED_GROUPS_MISSING"
  | "EMBED_REMOTE_CODE_UNREVIEWED"
  | "EMBED_CONVENTION_UNKNOWN"
  | "EMBED_DIMENSION_UNSAFE"
  | "EMBED_DEPENDENCY_INCOMPATIBLE"
  | "EMBED_CONTAMINATION_MISSING"
  | "EMBED_INTENDED_USE_CONFLICT";
export interface EmbeddingModelLockV1 {
  version: "1.0.0";
  modelId: string;
  commit: string;
  status: "available" | "unavailable";
  license: { declared: string; artifactSha256?: string };
  architecture: string;
  dependencies: string[];
  prompt: string;
  pooling: string;
  padding: string;
  normalization: string;
  safeDimensions: number[];
  context: number;
  nativeHeads: string[];
  remoteCode: { required: boolean; reviewedCommit?: string };
  hardware: string;
  intendedUse: string;
  limitations: string[];
  evidence: Array<{ url: string; retrievedAt: string }>;
  unavailableReasons: string[];
}
export function preflightEmbedding(
  lock: EmbeddingModelLockV1,
  input: {
    dimension: number;
    datasetRights?: string;
    teacherRights?: string;
    splitGroups: boolean;
    contaminationHash?: string;
    intendedUse: string;
    dependenciesCompatible: boolean;
  },
) {
  const errors: Array<{ code: PreflightCode; remediation: string }> = [];
  if (lock.status !== "available")
    errors.push({ code: "EMBED_LOCK_UNAVAILABLE", remediation: lock.unavailableReasons.join("; ") });
  if (!/^[a-f0-9]{40}$/.test(lock.commit))
    errors.push({ code: "EMBED_MUTABLE_REVISION", remediation: "resolve an immutable 40-character commit SHA" });
  if (!lock.license.artifactSha256)
    errors.push({
      code: "EMBED_LICENSE_MUTATED",
      remediation: "review and hash the repository LICENSE/NOTICE artifact",
    });
  if (!input.datasetRights || !input.teacherRights)
    errors.push({
      code: "EMBED_RIGHTS_MISSING",
      remediation: "provide dataset and teacher-output rights attestations",
    });
  if (!input.splitGroups) errors.push({ code: "EMBED_GROUPS_MISSING", remediation: "assign split lineage groups" });
  if (lock.remoteCode.required && !lock.remoteCode.reviewedCommit)
    errors.push({ code: "EMBED_REMOTE_CODE_UNREVIEWED", remediation: "pin and review remote code" });
  if ([lock.prompt, lock.pooling, lock.padding, lock.normalization].some((x) => x === "unknown"))
    errors.push({ code: "EMBED_CONVENTION_UNKNOWN", remediation: "resolve prompt/pooling/padding/normalization" });
  if (!lock.safeDimensions.includes(input.dimension))
    errors.push({ code: "EMBED_DIMENSION_UNSAFE", remediation: `choose one of ${lock.safeDimensions.join(",")}` });
  if (!input.dependenciesCompatible)
    errors.push({ code: "EMBED_DEPENDENCY_INCOMPATIBLE", remediation: "use the tested dependency lock" });
  if (!input.contaminationHash)
    errors.push({ code: "EMBED_CONTAMINATION_MISSING", remediation: "run and record contamination scan" });
  if (!lock.intendedUse.includes(input.intendedUse))
    errors.push({ code: "EMBED_INTENDED_USE_CONFLICT", remediation: "review intended use against model evidence" });
  return { ok: errors.length === 0, errors };
}
export function resolveLockMetadata(
  metadata: { id: string; sha: string; license?: string },
  expectedId: string,
  expectedLicenseHash?: string,
) {
  if (metadata.id !== expectedId || !/^[a-f0-9]{40}$/.test(metadata.sha)) throw new Error("EMBED_MUTABLE_REVISION");
  if (expectedLicenseHash && !metadata.license) throw new Error("EMBED_LICENSE_MUTATED");
  return metadata;
}
