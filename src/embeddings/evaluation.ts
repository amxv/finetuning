import { readFile } from "node:fs/promises";
import { canonicalSha256 } from "../core/canonical.js";
import { atomicWrite } from "../node/storage.js";
import { type EmbeddingServiceDependencies } from "./sdk.js";
export const embeddingEvaluationSpecVersion = "embedding.evaluation.v1" as const,
  embeddingEvaluationReportVersion = "embedding.evaluation.report.v1" as const;
export interface RankedQuery {
  id: string;
  relevantIds: string[];
  candidates: Array<{ id: string; score: number }>;
  language?: string;
  prompt?: "on" | "off";
  length?: number;
  dimension?: number;
}
export interface EmbeddingEvaluationSpecV1 {
  embeddingEvaluationSpecVersion: typeof embeddingEvaluationSpecVersion;
  runId: string;
  datasetRevision: string;
  evaluatorRevision: string;
  mteb?: { revision: string; taskSet: string; offlineFixture: boolean };
  frozenSplitHash: string;
  contaminationHash: string;
  artifactManifest?: string;
  outputPath?: string;
  retrieval?: RankedQuery[];
  sts?: Array<{ predicted: number; expected: number; language?: string }>;
  classification?: Array<{ predicted: string; expected: string; language?: string }>;
  clustering?: Array<{ predicted: string; expected: string; language?: string }>;
  baselines?: Record<string, Record<string, number>>;
  thresholds?: Array<{ metric: string; baseline: string; minimumDelta?: number; minimum?: number; maximum?: number }>;
  resources?: { latencyMs: number; throughputPerSecond: number; peakMemoryBytes: number; artifactBytes: number };
  contamination?: {
    evalIds: string[];
    generationLedgerIds: string[];
    miningLedgerIds: string[];
    canaries: string[];
    projectionFitSplit: "train";
  };
  bootstrap?: { seed: number; samples: number };
}
export interface MetricInterval {
  value: number;
  low: number;
  high: number;
}
export interface EmbeddingEvaluationReport {
  embeddingEvaluationReportVersion: typeof embeddingEvaluationReportVersion;
  runId: string;
  status: "complete";
  comparable: boolean;
  metrics: Record<string, number>;
  intervals: Record<string, MetricInterval>;
  slices: Record<string, Record<string, number>>;
  baselines: Record<string, Record<string, number>>;
  regression: { passed: boolean; failures: string[] };
  resources?: EmbeddingEvaluationSpecV1["resources"];
  revisions: { dataset: string; evaluator: string; mteb?: string; taskSet?: string };
  raw: { retrieval?: RankedQuery[] };
  contamination: { passed: boolean; teacherLimitation: string };
  reportHash: string;
}
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
export function retrievalMetrics(rows: RankedQuery[], k = 10) {
  if (!rows.length) throw new Error("EMBED_EVAL_EMPTY_RETRIEVAL");
  const values = rows.map((row) => {
    if (new Set(row.candidates.map((x) => x.id)).size !== row.candidates.length)
      throw new Error(`EMBED_EVAL_DUPLICATE_CANDIDATE:${row.id}`);
    const ranked = [...row.candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)),
      rel = new Set(row.relevantIds);
    if (!rel.size) throw new Error(`EMBED_EVAL_EMPTY_RELEVANCE:${row.id}`);
    const hits = ranked.slice(0, k).filter((x) => rel.has(x.id)).length,
      first = ranked.findIndex((x) => rel.has(x.id)),
      dcg = ranked.slice(0, 10).reduce((n, x, i) => n + (rel.has(x.id) ? 1 / Math.log2(i + 2) : 0), 0),
      ideal = [...Array(Math.min(10, rel.size))].reduce((n, _, i) => n + 1 / Math.log2(i + 2), 0);
    return { recall: hits / rel.size, mrr: first < 0 ? 0 : 1 / (first + 1), ndcg: dcg / ideal };
  });
  return {
    [`recall@${k}`]: mean(values.map((x) => x.recall)),
    mrr: mean(values.map((x) => x.mrr)),
    "ndcg@10": mean(values.map((x) => x.ndcg)),
  };
}
function ranks(v: number[]) {
  return v
    .map((x, i) => ({ x, i }))
    .sort((a, b) => a.x - b.x || a.i - b.i)
    .reduce((out, item, index, all) => {
      const same = all.filter((x) => x.x === item.x),
        first = all.findIndex((x) => x.x === item.x);
      out[item.i] = first + (same.length + 1) / 2;
      return out;
    }, Array(v.length).fill(0));
}
export function pearson(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) throw new Error("EMBED_EVAL_CORRELATION_SHAPE");
  const am = mean(a),
    bm = mean(b),
    num = a.reduce((n, x, i) => n + (x - am) * (b[i]! - bm), 0),
    den = Math.sqrt(a.reduce((n, x) => n + (x - am) ** 2, 0) * b.reduce((n, x) => n + (x - bm) ** 2, 0));
  return den ? num / den : 0;
}
export const spearman = (a: number[], b: number[]) => pearson(ranks(a), ranks(b));
export function classificationMetrics(rows: Array<{ predicted: string; expected: string }>) {
  if (!rows.length) throw new Error("EMBED_EVAL_EMPTY_CLASSIFICATION");
  const labels = [...new Set(rows.flatMap((x) => [x.predicted, x.expected]))].sort(),
    accuracy = mean(rows.map((x) => (x.predicted === x.expected ? 1 : 0))),
    f1 = mean(
      labels.map((label) => {
        const tp = rows.filter((x) => x.predicted === label && x.expected === label).length,
          fp = rows.filter((x) => x.predicted === label && x.expected !== label).length,
          fn = rows.filter((x) => x.predicted !== label && x.expected === label).length;
        return (2 * tp) / (2 * tp + fp + fn || 1);
      }),
    );
  return { accuracy, "macro-f1": f1 };
}
export function vMeasure(rows: Array<{ predicted: string; expected: string }>) {
  if (!rows.length) throw new Error("EMBED_EVAL_EMPTY_CLUSTERING");
  const entropy = (values: string[]) => {
      const n = values.length;
      return -[...new Set(values)].reduce((s, x) => {
        const p = values.filter((v) => v === x).length / n;
        return s + p * Math.log(p);
      }, 0);
    },
    conditional = (a: string[], b: string[]) =>
      [...new Set(b)].reduce((sum, x) => {
        const idx = b.map((v, i) => (v === x ? i : -1)).filter((i) => i >= 0),
          p = idx.length / b.length;
        return sum + p * entropy(idx.map((i) => a[i]!));
      }, 0),
    expected = rows.map((x) => x.expected),
    predicted = rows.map((x) => x.predicted),
    hc = entropy(expected),
    hk = entropy(predicted),
    h = hc ? 1 - conditional(expected, predicted) / hc : 1,
    c = hk ? 1 - conditional(predicted, expected) / hk : 1;
  return (2 * h * c) / (h + c || 1);
}
export function bootstrap(values: number[], seed: number, samples: number): MetricInterval {
  if (!values.length) throw new Error("EMBED_EVAL_BOOTSTRAP_EMPTY");
  let state = seed >>> 0;
  const random = () => (state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32,
    draws = Array.from({ length: samples }, () =>
      mean(Array.from({ length: values.length }, () => values[Math.floor(random() * values.length)]!)),
    ).sort((a, b) => a - b);
  return {
    value: mean(values),
    low: draws[Math.floor(samples * 0.025)] ?? mean(values),
    high: draws[Math.min(samples - 1, Math.floor(samples * 0.975))] ?? mean(values),
  };
}
export function evaluateEmbeddingSpec(spec: EmbeddingEvaluationSpecV1): EmbeddingEvaluationReport {
  if (spec.embeddingEvaluationSpecVersion !== embeddingEvaluationSpecVersion) throw new Error("EMBED_EVAL_VERSION");
  if (spec.mteb && !spec.mteb.offlineFixture) throw new Error("EMBED_EVAL_NETWORK_OPT_IN_REQUIRED");
  const c = spec.contamination;
  if (!c || c.projectionFitSplit !== "train" || c.canaries.length) throw new Error("EMBED_EVAL_CONTAMINATION_GATE");
  const overlap = c.evalIds.filter((id) => c.generationLedgerIds.includes(id) || c.miningLedgerIds.includes(id));
  if (overlap.length) throw new Error(`EMBED_EVAL_LEDGER_LEAK:${overlap.join(",")}`);
  const metrics: Record<string, number> = {};
  if (spec.retrieval) Object.assign(metrics, retrievalMetrics(spec.retrieval));
  if (spec.sts) {
    metrics.pearson = pearson(
      spec.sts.map((x) => x.predicted),
      spec.sts.map((x) => x.expected),
    );
    metrics.spearman = spearman(
      spec.sts.map((x) => x.predicted),
      spec.sts.map((x) => x.expected),
    );
  }
  if (spec.classification) Object.assign(metrics, classificationMetrics(spec.classification));
  if (spec.clustering) metrics["v-measure"] = vMeasure(spec.clustering);
  const slices: Record<string, Record<string, number>> = {};
  for (const row of spec.retrieval ?? []) {
    for (const [kind, value] of [
      ["language", row.language],
      ["prompt", row.prompt],
      ["dimension", row.dimension],
      [
        "length",
        row.length === undefined ? undefined : row.length < 128 ? "short" : row.length < 1024 ? "medium" : "long",
      ],
    ] as const)
      if (value !== undefined) {
        const key = `${kind}:${value}`,
          bucket = (spec.retrieval ?? []).filter(
            (x) =>
              (kind === "language"
                ? x.language
                : kind === "prompt"
                  ? x.prompt
                  : kind === "dimension"
                    ? x.dimension
                    : x.length === undefined
                      ? undefined
                      : x.length < 128
                        ? "short"
                        : x.length < 1024
                          ? "medium"
                          : "long") === value,
          );
        slices[key] = retrievalMetrics(bucket);
      }
  }
  const failures: string[] = [];
  for (const t of spec.thresholds ?? []) {
    const value = metrics[t.metric],
      base = spec.baselines?.[t.baseline]?.[t.metric];
    if (
      value === undefined ||
      (t.minimum !== undefined && value < t.minimum) ||
      (t.maximum !== undefined && value > t.maximum) ||
      (t.minimumDelta !== undefined && (base === undefined || value - base < t.minimumDelta))
    )
      failures.push(t.metric);
  }
  const boot = spec.bootstrap ?? { seed: 0, samples: 200 },
    intervals: Record<string, MetricInterval> = {};
  if (spec.retrieval)
    for (const name of ["recall@10", "mrr", "ndcg@10"])
      intervals[name] = bootstrap(
        spec.retrieval.map((row) => retrievalMetrics([row])[name]!),
        boot.seed,
        boot.samples,
      );
  if (spec.sts)
    intervals.spearman = bootstrap(
      spec.sts.map((_, i) =>
        spearman(
          spec.sts!.slice(0, i + 1).map((x) => x.predicted),
          spec.sts!.slice(0, i + 1).map((x) => x.expected),
        ),
      ),
      boot.seed,
      boot.samples,
    );
  const value = {
    embeddingEvaluationReportVersion,
    runId: spec.runId,
    status: "complete" as const,
    comparable: true,
    metrics,
    intervals,
    slices,
    baselines: spec.baselines ?? {},
    regression: { passed: !failures.length, failures },
    ...(spec.resources ? { resources: spec.resources } : {}),
    revisions: {
      dataset: spec.datasetRevision,
      evaluator: spec.evaluatorRevision,
      ...(spec.mteb ? { mteb: spec.mteb.revision, taskSet: spec.mteb.taskSet } : {}),
    },
    raw: { ...(spec.retrieval ? { retrieval: spec.retrieval } : {}) },
    contamination: {
      passed: true,
      teacherLimitation: "Teacher pretraining contamination cannot be excluded without provider disclosure.",
    },
  };
  return { ...value, reportHash: canonicalSha256(value as never) };
}
export async function verifyEmbeddingEvaluationReport(path: string) {
  const report = JSON.parse(await readFile(path, "utf8")) as EmbeddingEvaluationReport;
  const { reportHash, ...value } = report;
  if (canonicalSha256(value as never) !== reportHash) throw new Error("EMBED_EVAL_REPORT_TAMPER");
  return report;
}
export async function evaluationForModelCard(path: string) {
  const report = await verifyEmbeddingEvaluationReport(path);
  return {
    reportHash: report.reportHash,
    evaluatorRevision: report.revisions.evaluator,
    datasetRevision: report.revisions.dataset,
    metrics: report.metrics,
    regressionPassed: report.regression.passed,
  };
}
export class EmbeddingEvaluator {
  constructor(private readonly dependencies: EmbeddingServiceDependencies = {}) {}
  plan(spec: EmbeddingEvaluationSpecV1) {
    return { spec, executable: spec.mteb?.offlineFixture ?? true, network: false };
  }
  async evaluate(spec: EmbeddingEvaluationSpecV1) {
    await this.dependencies.emit?.({
      type: "progress",
      operation: "evaluate",
      message: "Running deterministic offline evaluation",
    });
    const report = evaluateEmbeddingSpec(spec);
    if (spec.outputPath) await atomicWrite(spec.outputPath, JSON.stringify(report, null, 2) + "\n");
    return report;
  }
}
