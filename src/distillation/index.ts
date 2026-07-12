import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  canonicalSerialize,
  canonicalSha256,
  datasetSchemaVersion,
  withContentHash,
  type CanonicalMessageV1,
  type DatasetExampleV1,
  type DatasetSplitV1,
  type DecisionV1,
} from "../core/canonical.js";
import type { JsonObject } from "../core/model.js";
import { atomicWrite } from "../node/storage.js";
import type { NormalizedUsage, TeacherEnvelope, TeacherRequest } from "../providers/contracts.js";
import { ProviderBudgetExceededError } from "../providers/reliable.js";

export const distillationApiVersion = "1.0.0" as const;
export const distillationRecordVersion = "1.0.0" as const;

export type DistillationStage =
  | "ingest"
  | "groups"
  | "quota"
  | "responses"
  | "validate"
  | "policy"
  | "verify"
  | "judge"
  | "filter"
  | "dedupe"
  | "split"
  | "contamination"
  | "freeze";
export interface DistillationCandidateV1 {
  id: string;
  messages: CanonicalMessageV1[];
  generator: { provider: string; model: string; requestId: string; sampleId: string };
  usage: NormalizedUsage;
  createdAt: string;
}
export interface DistillationDecisionV1 extends DecisionV1 {
  stage: DistillationStage;
  candidateId?: string;
  createdAt: string;
  scores?: Record<string, number>;
  audit?: {
    judgments: Array<{
      requestId: string;
      candidateLabel: "A" | "B";
      referenceLabel: "A" | "B";
      scores: Record<string, number>;
    }>;
  };
}
export interface DistillationRecordV1 {
  distillationRecordVersion: typeof distillationRecordVersion;
  id: string;
  source: DatasetExampleV1;
  taxonomy: string[];
  quotaBucket?: string;
  locked: boolean;
  candidates: DistillationCandidateV1[];
  decisions: DistillationDecisionV1[];
  dedupe?: { exact?: string; minhash?: string; semantic?: string; representative: boolean; rationale: string };
  split?: DatasetSplitV1;
  contamination?: string[];
}
export interface ComplianceAttestationsV1 {
  sourceRights: { status: "approved"; basis: string };
  teacherTerms: { url: string; version: string; reviewedAt: string; approver: string };
  intendedUse: string;
  retentionPolicy: string;
  reasoningPolicy: string;
  studentLicense: { id: string; version: string };
}
export interface QuotaRule {
  taxonomy: string;
  target: number;
}
export interface DistillationConfig {
  runId: string;
  salt: string;
  generator: { provider: "openai" | "anthropic"; model: string };
  judge?: { provider: "openai" | "anthropic"; model: string; orderSwap?: boolean };
  compliance: ComplianceAttestationsV1;
  quotas?: QuotaRule[];
  splits?: { train: number; validation: number; test: number };
  lexicalOnly?: boolean;
  minhashThreshold?: number;
  judgeThreshold?: number;
}
export interface DistillationProvider {
  generate(request: TeacherRequest): Promise<TeacherEnvelope>;
}
export interface EmbeddingDedupePlugin {
  id: string;
  embed(texts: string[]): Promise<number[][]>;
  threshold: number;
}
export interface DistillationCostReport {
  generator: NormalizedUsage;
  judge: NormalizedUsage;
  totalCost: number;
  currency: string;
}
export interface DistillationPlan {
  runId: string;
  stageCounts: Record<DistillationStage, number>;
  quotas: Array<QuotaRule & { available: number; deficit: number }>;
  lockedCount: number;
  generationCount: number;
  compliance: "approved";
}
export interface DistillationRunState {
  version: "1.0.0";
  config: DistillationConfig;
  records: DistillationRecordV1[];
  completedStages: DistillationStage[];
  paidSuccesses: Record<string, TeacherEnvelope>;
  costs: DistillationCostReport;
  createdAt: string;
  updatedAt: string;
}

export function validateCompliance(value: ComplianceAttestationsV1): void {
  const missing: string[] = [];
  if (value.sourceRights?.status !== "approved" || !value.sourceRights.basis) missing.push("source rights");
  if (
    !value.teacherTerms?.url ||
    !value.teacherTerms.version ||
    !value.teacherTerms.reviewedAt ||
    !value.teacherTerms.approver
  )
    missing.push("teacher terms review/version/date/approver");
  if (!value.intendedUse) missing.push("intended use");
  if (!value.retentionPolicy) missing.push("retention policy");
  if (!value.reasoningPolicy) missing.push("reasoning policy");
  if (!value.studentLicense?.id || !value.studentLicense.version) missing.push("student license metadata");
  if (missing.length) throw new Error(`Compliance gate failed: missing ${missing.join(", ")}`);
}

export function planDistillation(input: DatasetExampleV1[], config: DistillationConfig): DistillationPlan {
  validateCompliance(config.compliance);
  const locked = input.filter(isLocked);
  const quotas = (config.quotas ?? []).map((q) => {
    const available = input.filter((r) => taxonomy(r).includes(q.taxonomy)).length;
    return { ...q, available, deficit: Math.max(0, q.target - available) };
  });
  const generationCount = input.length - locked.length;
  const stages = [
    "ingest",
    "groups",
    "quota",
    "responses",
    "validate",
    "policy",
    "verify",
    "judge",
    "filter",
    "dedupe",
    "split",
    "contamination",
    "freeze",
  ] as DistillationStage[];
  return {
    runId: config.runId,
    stageCounts: Object.fromEntries(
      stages.map((s) => [s, s === "responses" || s === "judge" ? generationCount : input.length]),
    ) as Record<DistillationStage, number>,
    quotas,
    lockedCount: locked.length,
    generationCount,
    compliance: "approved",
  };
}

export function scanSensitive(text: string): Array<{ kind: "pii" | "secret"; match: string }> {
  const patterns: Array<["pii" | "secret", RegExp]> = [
    ["pii", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
    ["pii", /\b(?:\+?\d[ -]?){10,14}\b/g],
    ["secret", /\b(?:sk-[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{16}|(?:api[_-]?key|password)\s*[:=]\s*[^\s,;]+)/gi],
  ];
  return patterns.flatMap(([kind, regex]) => [...text.matchAll(regex)].map((m) => ({ kind, match: m[0] })));
}

export class DistillationPipeline {
  constructor(
    readonly provider: DistillationProvider,
    readonly judgeProvider: DistillationProvider = provider,
    readonly embedding?: EmbeddingDedupePlugin,
    readonly now = () => new Date().toISOString(),
    readonly checkpoint?: (state: DistillationRunState) => Promise<void>,
  ) {}
  async run(
    input: DatasetExampleV1[],
    config: DistillationConfig,
    previous?: DistillationRunState,
  ): Promise<DistillationRunState> {
    validateCompliance(config.compliance);
    const createdAt = previous?.createdAt ?? this.now();
    const records: DistillationRecordV1[] =
      previous?.records ??
      input.map((source): DistillationRecordV1 => ({
        distillationRecordVersion,
        id: source.id,
        source,
        taxonomy: taxonomy(source),
        locked: isLocked(source),
        candidates: [],
        decisions: [],
      }));
    const costs = previous?.costs ?? { generator: zeroUsage(), judge: zeroUsage(), totalCost: 0, currency: "USD" };
    const paidSuccesses = { ...(previous?.paidSuccesses ?? {}) };
    const completedStages = [...(previous?.completedStages ?? [])];
    const snapshot = (): DistillationRunState => ({
      version: "1.0.0",
      config,
      records,
      completedStages,
      paidSuccesses,
      costs,
      createdAt,
      updatedAt: this.now(),
    });
    const paid = async (
      identity: string,
      provider: DistillationProvider,
      req: TeacherRequest,
      usage: NormalizedUsage,
    ) => {
      const cached = paidSuccesses[identity];
      if (cached) return cached;
      let envelope: TeacherEnvelope;
      let budgetError: ProviderBudgetExceededError | undefined;
      try {
        envelope = await provider.generate(req);
      } catch (error) {
        if (!(error instanceof ProviderBudgetExceededError)) throw error;
        envelope = error.envelope;
        budgetError = error;
      }
      paidSuccesses[identity] = envelope;
      addUsage(usage, envelope.usage);
      await this.checkpoint?.(snapshot());
      if (budgetError) throw budgetError;
      return envelope;
    };
    const doStage = async (stage: DistillationStage, fn: () => Promise<void> | void) => {
      if (!completedStages.includes(stage)) {
        await fn();
        completedStages.push(stage);
      }
    };
    await doStage("ingest", () => undefined);
    await doStage("groups", () =>
      records.forEach((r) => {
        r.source.leakageGroup ??= salted(config.salt, r.source.groupId ?? r.source.provenance.sourceId ?? r.id);
      }),
    );
    await doStage("quota", () =>
      records.forEach((r) => {
        r.quotaBucket = r.taxonomy[0] ?? "uncategorized";
      }),
    );
    await doStage("responses", async () => {
      for (const r of records) {
        if (r.locked || r.candidates.length) continue;
        const requestId = `${config.runId}:generate:${r.id}`;
        const envelope = await paid(
          requestId,
          this.provider,
          request(r.source.messages, config.generator, requestId, r.id),
          costs.generator,
        );
        envelope.candidates.forEach((candidate, i) => {
          const messages = [...r.source.messages, responseMessage(candidate.response)];
          r.candidates.push({
            id: salted(config.salt, `${r.id}:${i}:${canonicalSerialize(messages as never)}`),
            messages,
            generator: { ...config.generator, requestId, sampleId: r.id },
            usage: envelope.usage,
            createdAt: this.now(),
          });
        });
        await this.checkpoint?.(snapshot());
      }
    });
    await doStage("validate", () =>
      records.forEach((r) =>
        r.candidates.forEach((c) =>
          decide(
            r,
            "validate",
            c.id,
            c.messages.at(-1)?.role === "assistant" ? "accepted" : "rejected",
            "assistant target required",
            this.now(),
          ),
        ),
      ),
    );
    await doStage("policy", () =>
      records.forEach((r) =>
        r.candidates.forEach((c) => {
          const findings = scanSensitive(text(c.messages));
          decide(
            r,
            "policy",
            c.id,
            findings.length ? "review" : "accepted",
            findings.length ? `Sensitive annotations: ${findings.map((f) => f.kind).join(",")}` : "clean",
            this.now(),
            { findings } as unknown as JsonObject,
          );
        }),
      ),
    );
    await doStage("verify", () =>
      records.forEach((r) =>
        r.candidates.forEach((c) => {
          const body = text(c.messages.slice(-1));
          decide(
            r,
            "verify",
            c.id,
            body.trim() ? "accepted" : "rejected",
            body.trim() ? "nonempty" : "empty response",
            this.now(),
          );
        }),
      ),
    );
    await doStage("judge", async () => {
      for (const r of records)
        for (const c of r.candidates) {
          const firstSwap = parseInt(salted(config.salt, c.id).slice(0, 2), 16) % 2 === 1;
          const orders = config.judge?.orderSwap ? [firstSwap, !firstSwap] : [firstSwap];
          const audits: NonNullable<DistillationDecisionV1["audit"]>["judgments"] = [];
          for (const swapped of orders) {
            const identity = `${config.runId}:judge:${c.id}:${swapped ? "ba" : "ab"}`;
            const candidateLabel = swapped ? "B" : "A",
              referenceLabel = swapped ? "A" : "B";
            const candidateText = text(c.messages.slice(-1));
            const prompt = `Evaluate two anonymized responses. Response A:\n${swapped ? "[reference unavailable]" : candidateText}\nResponse B:\n${swapped ? candidateText : "[reference unavailable]"}\nReturn JSON with quality, correctness, safety, style scores from 0 to 1.`;
            const envelope = await paid(
              identity,
              this.judgeProvider,
              request(
                [{ role: "user", content: [{ type: "text", text: prompt }] }],
                config.judge ?? config.generator,
                identity,
                c.id,
              ),
              costs.judge,
            );
            audits.push({ requestId: identity, candidateLabel, referenceLabel, scores: parseScores(envelope) });
          }
          const dimensions = ["quality", "correctness", "safety", "style"];
          const scores = Object.fromEntries(
            dimensions.map((d) => [d, audits.reduce((sum, a) => sum + (a.scores[d] ?? 0), 0) / audits.length]),
          );
          scores.disagreement =
            Math.max(...audits.map((a) => a.scores.quality ?? 0)) -
            Math.min(...audits.map((a) => a.scores.quality ?? 0));
          decide(
            r,
            "judge",
            c.id,
            scores.quality! >= (config.judgeThreshold ?? 0.5) ? "accepted" : "rejected",
            `quality=${scores.quality}`,
            this.now(),
            undefined,
            scores,
            { judgments: audits },
          );
        }
    });
    await doStage("filter", () =>
      records.forEach((r) =>
        r.candidates.forEach((c) => {
          const rejected = r.decisions.some((d) => d.candidateId === c.id && d.outcome === "rejected");
          decide(
            r,
            "filter",
            c.id,
            rejected ? "rejected" : "accepted",
            rejected ? "upstream rejection" : "passed",
            this.now(),
          );
        }),
      ),
    );
    await doStage("dedupe", async () =>
      dedupe(records, config.salt, config.minhashThreshold ?? 0.8, config.lexicalOnly ? undefined : this.embedding),
    );
    await doStage("split", () => assignSplits(records, config.salt, config.splits));
    await doStage("contamination", () => contamination(records));
    costs.totalCost = (costs.generator.cost ?? 0) + (costs.judge.cost ?? 0);
    costs.currency = costs.generator.currency ?? costs.judge.currency ?? "USD";
    return snapshot();
  }
}

export async function saveDistillationState(root: string, state: DistillationRunState): Promise<void> {
  await mkdir(root, { recursive: true });
  await atomicWrite(join(root, "distillation-state.json"), `${JSON.stringify(state, null, 2)}\n`);
}
export async function loadDistillationState(root: string): Promise<DistillationRunState> {
  return JSON.parse(await readFile(join(root, "distillation-state.json"), "utf8")) as DistillationRunState;
}
export function distillationDataset(state: DistillationRunState): DatasetExampleV1[] {
  return state.records.flatMap((r) => {
    const candidate = r.candidates.find((c) =>
      r.decisions.some((d) => d.stage === "filter" && d.candidateId === c.id && d.outcome === "accepted"),
    );
    if (!candidate || r.locked || r.dedupe?.representative === false) return [];
    return [
      withContentHash({
        ...r.source,
        datasetSchemaVersion,
        messages: candidate.messages,
        ...(r.split ? { split: r.split } : {}),
        decisions: r.decisions,
        metadata: {
          ...(r.source.metadata ?? {}),
          distillationRunId: state.config.runId,
          candidateId: candidate.id,
          dedupe: r.dedupe as unknown as JsonObject,
        },
      }),
    ];
  });
}

function taxonomy(r: DatasetExampleV1): string[] {
  const raw = r.metadata?.taxonomy;
  return Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string")
    : [typeof raw === "string" ? raw : "uncategorized"];
}
function isLocked(r: DatasetExampleV1) {
  return r.split === "validation" || r.split === "test" || r.metadata?.locked === true;
}
function salted(salt: string, value: string) {
  return createHash("sha256").update(`${salt}\0${value}`).digest("hex");
}
function text(messages: CanonicalMessageV1[]) {
  return messages.flatMap((m) => m.content.filter((p) => p.type === "text").map((p) => p.text)).join("\n");
}
function responseMessage(response: TeacherEnvelope["candidates"][number]["response"]): CanonicalMessageV1 {
  return response.kind === "text"
    ? { role: "assistant", content: [{ type: "text", text: response.content }] }
    : {
        role: "assistant",
        content: [],
        toolCalls: response.toolCalls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments })),
      };
}
function request(
  messages: CanonicalMessageV1[],
  target: { provider: "openai" | "anthropic"; model: string },
  requestId: string,
  sampleId: string,
): TeacherRequest {
  return {
    provider: target.provider,
    model: target.model,
    requestId,
    sampleId,
    messages: messages.map((m) => ({ role: m.role === "tool" ? "user" : m.role, content: text([m]) })),
  };
}
function decide(
  r: DistillationRecordV1,
  stage: DistillationStage,
  candidateId: string | undefined,
  outcome: DecisionV1["outcome"],
  reason: string,
  createdAt: string,
  metadata?: JsonObject,
  scores?: Record<string, number>,
  audit?: DistillationDecisionV1["audit"],
) {
  r.decisions.push({
    id: canonicalSha256({ stage, candidateId: candidateId ?? "", outcome, reason, sequence: r.decisions.length }),
    kind: stage,
    stage,
    ...(candidateId ? { candidateId } : {}),
    outcome,
    reason,
    createdAt,
    ...(metadata ? { metadata } : {}),
    ...(scores ? { scores } : {}),
    ...(audit ? { audit } : {}),
  });
}
function zeroUsage(): NormalizedUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, currency: "USD" };
}
function addUsage(a: NormalizedUsage, b: NormalizedUsage) {
  a.inputTokens += b.inputTokens;
  a.outputTokens += b.outputTokens;
  a.totalTokens += b.totalTokens;
  a.cost = (a.cost ?? 0) + (b.cost ?? 0);
  if (b.currency) a.currency = b.currency;
}
function parseScores(e: TeacherEnvelope): Record<string, number> {
  const c = e.candidates[0];
  const raw = (c?.parsed ?? (c?.response.kind === "text" ? JSON.parse(c.response.content) : {})) as Record<
    string,
    unknown
  >;
  return Object.fromEntries(
    ["quality", "correctness", "safety", "style"].map((key) => [
      key,
      Math.max(0, Math.min(1, Number(raw[key] ?? raw.quality ?? 0))),
    ]),
  );
}
async function dedupe(
  records: DistillationRecordV1[],
  salt: string,
  threshold: number,
  plugin?: EmbeddingDedupePlugin,
) {
  const accepted = records.flatMap((r) =>
    r.candidates.map((c) => ({ r, c, body: text(c.messages.slice(-1)).toLowerCase() })),
  );
  const embeddings = plugin ? await plugin.embed(accepted.map((x) => x.body)) : undefined;
  for (let i = 0; i < accepted.length; i++) {
    const current = accepted[i]!;
    let representative = i;
    let kind: "exact" | "minhash" | "semantic" = "exact";
    for (let j = 0; j < i; j++) {
      const prior = accepted[j]!;
      if (current.body === prior.body) {
        representative = j;
        break;
      }
      if (minhashSimilarity(current.body, prior.body) >= threshold) {
        representative = j;
        kind = "minhash";
        break;
      }
      const a = embeddings?.[i],
        b = embeddings?.[j];
      if (a && b && cosine(a, b) >= plugin!.threshold) {
        representative = j;
        kind = "semantic";
        break;
      }
    }
    const chosen = accepted[representative]!;
    const cluster = salted(salt, chosen.body);
    current.r.dedupe = {
      [kind]: cluster,
      representative: representative === i,
      rationale: representative === i ? "cluster representative" : `${kind} duplicate of ${chosen.c.id}`,
    };
    decide(
      current.r,
      "dedupe",
      current.c.id,
      representative === i ? "accepted" : "rejected",
      current.r.dedupe.rationale,
      new Date(0).toISOString(),
    );
  }
}
function shingles(s: string) {
  const words = s.match(/[a-z0-9]+/g) ?? [];
  return words.length < 3 ? words : words.slice(0, -2).map((_, i) => words.slice(i, i + 3).join(" "));
}
function minhash(s: string) {
  const values = shingles(s);
  return Array.from({ length: 64 }, (_, seed) =>
    values.reduce(
      (min, value) =>
        Math.min(min, parseInt(createHash("sha256").update(`${seed}:${value}`).digest("hex").slice(0, 8), 16)),
      0xffffffff,
    ),
  );
}
function minhashSimilarity(a: string, b: string) {
  const x = minhash(a),
    y = minhash(b);
  return x.filter((v, i) => v === y[i]).length / x.length;
}
function cosine(a: number[], b: number[]) {
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const av = a[i]!,
      bv = b[i]!;
    dot += av * bv;
    aa += av ** 2;
    bb += bv ** 2;
  }
  return dot / (Math.sqrt(aa * bb) || 1);
}
function assignSplits(
  records: DistillationRecordV1[],
  salt: string,
  weights = { train: 0.8, validation: 0.1, test: 0.1 },
) {
  const groups = new Map<string, DistillationRecordV1[]>();
  for (const r of records) {
    const g = r.source.leakageGroup!;
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  for (const [g, items] of groups) {
    const locked = items.find((r) => r.locked && r.source.split)?.source.split;
    const n = parseInt(salted(salt, g).slice(0, 12), 16) / 0xffffffffffff;
    const split =
      locked ?? (n < weights.train ? "train" : n < weights.train + weights.validation ? "validation" : "test");
    items.forEach((r) => (r.split = split));
  }
}
function contamination(records: DistillationRecordV1[]) {
  const train = records.filter((r) => r.split === "train").map((r) => text(r.source.messages).toLowerCase());
  for (const r of records.filter((r) => r.split !== "train")) {
    const body = text(r.source.messages).toLowerCase();
    r.contamination = train.filter((t) => t === body).map(() => "exact-train-overlap");
    decide(
      r,
      "contamination",
      undefined,
      r.contamination.length ? "review" : "accepted",
      r.contamination.length ? "train overlap" : "clean",
      new Date(0).toISOString(),
    );
  }
}
