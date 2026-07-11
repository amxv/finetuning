import { canonicalSerialize, canonicalSha256, type DatasetSplitV1 } from "../core/canonical.js";
import {
  embeddingRecordVersion,
  embeddingText,
  validateEmbeddingRecord,
  withEmbeddingHash,
  type EmbeddingRecordV1,
  type EmbeddingTextV1,
  type TeacherV1,
} from "../experimental/embeddings-phase11.js";

export type EmbeddingFormat = "canonical-embedding-jsonl" | "sentence-transformers" | "hugging-face";
export type EmbeddingTaskMapping =
  | "pair"
  | "triplet"
  | "retrieval-set"
  | "scored-pair"
  | "sts"
  | "boolean-pair"
  | "categorical-pair"
  | "classification"
  | "clustering"
  | "instruction-aware"
  | "teacher-vector"
  | "teacher-score"
  | "teacher-ranking";
export interface EmbeddingColumnMapping {
  task: EmbeddingTaskMapping;
  columns: Record<string, string>;
}
export interface EmbeddingCodecOptions {
  mapping?: EmbeddingColumnMapping;
  source?: { name: string; revision: string; license: string; rights: string };
  split?: DatasetSplitV1;
  splitGroupColumn?: string;
  language?: string;
  domain?: string;
}
export interface EmbeddingLoss {
  code: string;
  path: string;
  message: string;
  severity: "warning" | "error";
}
export interface EmbeddingConversion<T> {
  value?: T;
  losses: EmbeddingLoss[];
  supported: boolean;
}

const known = new Set([
  "anchor",
  "query",
  "positive",
  "document",
  "negative",
  "positives",
  "negatives",
  "left",
  "right",
  "text1",
  "text2",
  "score",
  "label",
  "labels",
  "text",
  "instruction",
  "vector",
  "teacher",
  "candidates",
  "ranking",
  "candidate_pool_id",
  "corpus_id",
  "id",
  "split_group",
]);
export function detectEmbeddingTask(
  row: Record<string, unknown>,
  mapping?: EmbeddingColumnMapping,
): EmbeddingTaskMapping {
  if (mapping) return mapping.task;
  const has = (...keys: string[]) => keys.every((k) => k in row);
  if (has("anchor", "positive", "negative") || has("query", "positive", "negative")) return "triplet";
  if (has("query", "positives")) return "retrieval-set";
  if (has("text", "vector", "teacher")) return "teacher-vector";
  if (has("query", "candidates", "ranking", "teacher", "candidate_pool_id", "corpus_id")) return "teacher-ranking";
  if ((has("anchor", "positive") || has("query", "document")) && !has("score", "label")) return "pair";
  if (has("text", "label"))
    throw new Error("EMBED_AMBIGUOUS_COLUMNS: explicit task mapping is required for classification versus clustering");
  if ((has("left", "right") || has("text1", "text2") || has("query", "document")) && has("score"))
    throw new Error(
      "EMBED_AMBIGUOUS_COLUMNS: explicit task mapping is required for scored-pair versus STS/teacher-score",
    );
  if ((has("left", "right") || has("text1", "text2")) && has("label"))
    throw new Error("EMBED_AMBIGUOUS_COLUMNS: explicit task mapping is required for Boolean versus categorical labels");
  throw new Error("EMBED_TASK_MAPPING_REQUIRED: external columns do not identify one unambiguous task");
}

export function decodeEmbeddingRow(
  row: Record<string, unknown>,
  options: EmbeddingCodecOptions = {},
): EmbeddingConversion<EmbeddingRecordV1> {
  const losses: EmbeddingLoss[] = [];
  try {
    if (row.embeddingRecordVersion === embeddingRecordVersion) {
      const value = row as unknown as EmbeddingRecordV1;
      validateEmbeddingRecord(value);
      return { value, losses, supported: true };
    }
    const task = detectEmbeddingTask(row, options.mapping),
      c = options.mapping?.columns ?? {};
    const get = (role: string, fallbacks: string[]): unknown => row[c[role] ?? fallbacks.find((x) => x in row) ?? role];
    const text = (role: string, fallbacks: string[]): EmbeddingTextV1 => {
      const value = get(role, fallbacks);
      if (typeof value !== "string" || !value.trim()) throw new Error(`EMBED_TEXT_REQUIRED:${role}`);
      return embeddingText(value, { language: options.language ?? "und", domain: options.domain ?? "unknown" });
    };
    const source = options.source ?? { name: "external", revision: "unknown", license: "unknown", rights: "unknown" };
    const group = String(options.splitGroupColumn ? (row[options.splitGroupColumn] ?? "") : (row.split_group ?? ""));
    if (!group) throw new Error("EMBED_GROUPS_MISSING: split_group or splitGroupColumn is required");
    const common = {
      embeddingRecordVersion,
      id: "",
      task,
      split: options.split ?? ("train" as const),
      splitGroup: group,
      source: { source: source.name, revision: source.revision, license: source.license, rights: source.rights },
      transformations: [],
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    let specific: Record<string, unknown>;
    if (task === "pair") {
      const query = text("query", ["query", "anchor"]),
        positive = text("document", ["document", "positive"]),
        negative = get("negative", ["negative"]);
      specific =
        negative === undefined
          ? { kind: "query-document", query, document: positive }
          : { kind: "triplet", anchor: query, positive, negative: text("negative", ["negative"]) };
    } else if (task === "triplet")
      specific = {
        kind: "triplet",
        anchor: text("anchor", ["anchor", "query"]),
        positive: text("positive", ["positive", "document"]),
        negative: text("negative", ["negative"]),
      };
    else if (task === "retrieval-set")
      specific = {
        kind: "retrieval-set",
        query: text("query", ["query", "anchor"]),
        positives: textArray(get("positives", ["positives", "positive"]), options),
        negatives: textArray(get("negatives", ["negatives", "negative"]), options),
      };
    else if (task === "classification" || task === "clustering")
      specific = {
        kind: task,
        text: text("text", ["text"]),
        label: String(get("label", ["label"])),
        labelDomain: stringArray(get("labelDomain", ["labels"])),
      };
    else if (task === "instruction-aware")
      specific = {
        kind: task,
        instruction: String(get("instruction", ["instruction"])),
        text: text("text", ["text"]),
        role: get("role", ["role"]),
      };
    else if (task === "teacher-vector")
      specific = {
        kind: task,
        text: text("text", ["text"]),
        teacher: get("teacher", ["teacher"]) as TeacherV1,
        vector: {
          storage: "inline",
          values: numberArray(get("vector", ["vector"])),
          dimension: numberArray(get("vector", ["vector"])).length,
          norm: get("norm", ["norm"]) ?? "none",
        },
      };
    else if (task === "teacher-ranking")
      specific = {
        kind: task,
        query: text("query", ["query"]),
        teacher: get("teacher", ["teacher"]),
        candidatePoolId: String(get("candidatePoolId", ["candidate_pool_id"])),
        corpusId: String(get("corpusId", ["corpus_id"])),
        candidates: get("candidates", ["candidates"]),
        ranking: get("ranking", ["ranking"]),
      };
    else {
      const left = text("left", ["left", "text1", "query"]),
        right = text("right", ["right", "text2", "document"]);
      if (task === "scored-pair" || task === "sts")
        specific = {
          kind: task,
          left,
          right,
          score: Number(get("score", ["score"])),
          scale: {
            min: Number(get("min", ["score_min"])),
            max: Number(get("max", ["score_max"])),
            direction: get("direction", ["score_direction"]),
          },
        };
      else if (task === "boolean-pair") specific = { kind: task, left, right, label: get("label", ["label"]) };
      else if (task === "categorical-pair")
        specific = {
          kind: task,
          left,
          right,
          label: String(get("label", ["label"])),
          labelDomain: stringArray(get("labelDomain", ["labels"])),
        };
      else if (task === "teacher-score")
        specific = {
          kind: task,
          query: left,
          document: right,
          teacher: get("teacher", ["teacher"]),
          score: Number(get("score", ["score"])),
          scale: get("scale", ["scale"]),
        };
      else throw new Error(`EMBED_UNSUPPORTED_TASK:${task}`);
    }
    const unknown = Object.fromEntries(
      Object.entries(row).filter(([k]) => !known.has(k) && !Object.values(c).includes(k)),
    );
    const draft = {
      ...common,
      ...specific,
      ...(Object.keys(unknown).length ? { metadata: { "external.embedding": unknown } } : {}),
    } as unknown as EmbeddingRecordV1;
    draft.id = typeof row.id === "string" ? row.id : canonicalSha256({ task, splitGroup: group, specific } as never);
    const value = withEmbeddingHash(draft);
    validateEmbeddingRecord(value);
    return { value, losses, supported: true };
  } catch (error) {
    losses.push({
      code: String(error instanceof Error ? error.message.split(":")[0] : error),
      path: "$",
      message: error instanceof Error ? error.message : String(error),
      severity: "error",
    });
    return { losses, supported: false };
  }
}

export function encodeEmbeddingRow(
  record: EmbeddingRecordV1,
  format: EmbeddingFormat,
  mapping?: EmbeddingColumnMapping,
): EmbeddingConversion<Record<string, unknown>> {
  validateEmbeddingRecord(record);
  if (format === "canonical-embedding-jsonl")
    return { value: JSON.parse(canonicalSerialize(record as never)), losses: [], supported: true };
  const m = mapping?.columns ?? {},
    out: Record<string, unknown> = { id: record.id, split_group: record.splitGroup };
  const put = (role: string, fallback: string, value: unknown) => {
    out[m[role] ?? fallback] = value;
  };
  if (record.kind === "query-document") {
    put("query", "query", record.query.text);
    put("document", "document", record.document.text);
  } else if (record.kind === "triplet") {
    put("anchor", "anchor", record.anchor.text);
    put("positive", "positive", record.positive.text);
    put("negative", "negative", record.negative.text);
  } else if (record.kind === "retrieval-set") {
    put("query", "query", record.query.text);
    put(
      "positives",
      "positives",
      record.positives.map((x) => x.text),
    );
    put(
      "negatives",
      "negatives",
      record.negatives.map((x) => x.text),
    );
  } else if (record.kind === "classification" || record.kind === "clustering") {
    put("text", "text", record.text.text);
    put("label", "label", record.label);
    out.labels = record.labelDomain;
  } else if (record.kind === "scored-pair" || record.kind === "sts") {
    put("left", "left", record.left.text);
    put("right", "right", record.right.text);
    out.score = record.score;
    out.score_min = record.scale.min;
    out.score_max = record.scale.max;
    out.score_direction = record.scale.direction;
  } else if (record.kind === "boolean-pair" || record.kind === "categorical-pair") {
    put("left", "left", record.left.text);
    put("right", "right", record.right.text);
    out.label = record.label;
    if (record.kind === "categorical-pair") out.labels = record.labelDomain;
  } else if (record.kind === "teacher-vector") {
    if (record.vector.storage === "shard")
      return {
        supported: false,
        losses: [
          {
            code: "EMBED_VECTOR_SIDECAR_REQUIRED",
            path: "$.vector",
            message: "external export requires a vector sidecar writer",
            severity: "error",
          },
        ],
      };
    out.text = record.text.text;
    out.teacher = record.teacher;
    out.vector = record.vector.values;
    out.norm = record.vector.norm;
  } else if (record.kind === "teacher-score") {
    out.query = record.query.text;
    out.document = record.document.text;
    out.teacher = record.teacher;
    out.score = record.score;
    out.scale = record.scale;
    if (record.margin !== undefined) out.margin = record.margin;
  } else if (record.kind === "teacher-ranking") {
    out.query = record.query.text;
    out.teacher = record.teacher;
    out.candidate_pool_id = record.candidatePoolId;
    out.corpus_id = record.corpusId;
    out.candidates = record.candidates;
    out.ranking = record.ranking;
  } else if (record.kind === "instruction-aware") {
    out.instruction = record.instruction;
    out.text = record.text.text;
    out.role = record.role;
  } else
    return {
      supported: false,
      losses: [
        {
          code: "EMBED_UNSUPPORTED_EXPORT",
          path: "$.kind",
          message: `${record.kind} requires canonical export or an explicit sidecar writer`,
          severity: "error",
        },
      ],
    };
  return { value: out, losses: [], supported: true };
}
function textArray(v: unknown, o: EmbeddingCodecOptions): EmbeddingTextV1[] {
  return stringArray(v).map((x) => embeddingText(x, { language: o.language ?? "und", domain: o.domain ?? "unknown" }));
}
function stringArray(v: unknown): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new Error("EMBED_ARRAY_REQUIRED");
  return v as string[];
}
function numberArray(v: unknown): number[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "number" || !Number.isFinite(x)))
    throw new Error("EMBED_VECTOR_SHAPE");
  return v as number[];
}
