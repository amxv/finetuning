import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  DistillationPipeline,
  distillationDataset,
  loadDistillationState,
  planDistillation,
  saveDistillationState,
  scanSensitive,
  validateCompliance,
} from "../dist/distillation/index.js";
import { ReliableTeacherProvider } from "../dist/providers/index.js";

const compliance = {
  sourceRights: { status: "approved", basis: "owned" },
  teacherTerms: { url: "https://terms.test", version: "1", reviewedAt: "2026-01-01", approver: "owner" },
  intendedUse: "training",
  retentionPolicy: "30d",
  reasoningPolicy: "do not store",
  studentLicense: { id: "apache-2.0", version: "2" },
};
const config = {
  runId: "run",
  salt: "salt",
  generator: { provider: "openai", model: "generator" },
  judge: { provider: "anthropic", model: "judge", orderSwap: true },
  compliance,
  quotas: [{ taxonomy: "support", target: 4 }],
  splits: { train: 0.5, validation: 0.25, test: 0.25 },
  judgeThreshold: 0.5,
  minhashThreshold: 0.55,
};
function example(id, content, extra = {}) {
  return {
    datasetSchemaVersion: "1.0.0",
    id,
    messages: [{ role: "user", content: [{ type: "text", text: content }] }],
    provenance: { source: "fixture", sourceId: extra.sourceId ?? id },
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: { taxonomy: ["support"], ...(extra.metadata ?? {}) },
    ...(extra.groupId ? { groupId: extra.groupId } : {}),
    ...(extra.split ? { split: extra.split } : {}),
  };
}
function provider(kind, answers, calls, failAt = Infinity) {
  return {
    async generate(request) {
      calls.push(request);
      if (calls.length === failAt) throw new Error("interrupt");
      const body =
        kind === "judge"
          ? JSON.stringify({ quality: 0.8, correctness: 0.9, safety: 1, style: 0.7 })
          : (answers[request.sampleId] ?? `answer ${request.sampleId}`);
      return {
        requestId: request.requestId,
        sampleId: request.sampleId,
        provider: request.provider,
        model: request.model,
        candidates: [
          {
            response: { kind: "text", content: body },
            finishReason: "stop",
            ...(kind === "judge" ? { parsed: JSON.parse(body) } : {}),
          },
        ],
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          cost: kind === "judge" ? 0.02 : 0.01,
          currency: "USD",
        },
        retries: [],
        cached: false,
      };
    },
  };
}

test("complete deterministic pipeline preserves lineage, gates, costs, judge audit, groups, and locked records", async () => {
  const generatorCalls = [],
    judgeCalls = [];
  const input = [
    example("a", "hello", { groupId: "shared" }),
    example("b", "hello again", { groupId: "shared" }),
    example("held", "held out", { split: "test" }),
  ];
  const state = await new DistillationPipeline(
    provider(
      "generator",
      { a: "contact a@test.com sk-abcdefghijkl", b: "contact a@test.com sk-abcdefghijkl" },
      generatorCalls,
    ),
    provider("judge", {}, judgeCalls),
    undefined,
    () => "2026-01-01T00:00:00.000Z",
  ).run(input, config);
  assert.equal(generatorCalls.length, 2);
  assert.ok(generatorCalls.every((c) => c.sampleId !== "held"));
  assert.equal(judgeCalls.length, 4);
  assert.ok(
    judgeCalls.every((c) => !c.messages[0].content.includes("openai") && !c.messages[0].content.includes("anthropic")),
  );
  const generated = state.records.filter((r) => !r.locked);
  assert.ok(generated.every((r) => r.candidates.length === 1));
  assert.ok(
    generated.every((r) =>
      ["validate", "policy", "verify", "judge", "filter", "dedupe"].every((stage) =>
        r.decisions.some((d) => d.stage === stage),
      ),
    ),
  );
  const judgment = generated[0].decisions.find((d) => d.stage === "judge");
  assert.deepEqual(Object.keys(judgment.scores).sort(), ["correctness", "disagreement", "quality", "safety", "style"]);
  assert.equal(judgment.audit.judgments.length, 2);
  assert.notEqual(judgment.audit.judgments[0].candidateLabel, judgment.audit.judgments[1].candidateLabel);
  assert.equal(state.costs.generator.cost, 0.02);
  assert.equal(state.costs.judge.cost, 0.08);
  assert.equal(state.costs.totalCost, 0.1);
  assert.equal(generated[0].split, generated[1].split);
  assert.equal(
    new Set(state.records.map((r) => `${r.source.leakageGroup}:${r.split}`)).size,
    new Set(state.records.map((r) => r.source.leakageGroup)).size,
  );
  assert.equal(generated.filter((r) => r.dedupe.representative).length, 1);
  assert.match(generated[1].dedupe.rationale, /duplicate/);
  assert.ok(generated[0].decisions.find((d) => d.stage === "policy").metadata.findings.length >= 2);
  assert.equal(distillationDataset(state).length, 1);
  const plan = planDistillation(input, config);
  assert.equal(plan.lockedCount, 1);
  assert.deepEqual(plan.quotas[0], { taxonomy: "support", target: 4, available: 3, deficit: 1 });
});

test("compliance and scanners fail closed", () => {
  for (const key of [
    "sourceRights",
    "teacherTerms",
    "intendedUse",
    "retentionPolicy",
    "reasoningPolicy",
    "studentLicense",
  ]) {
    const bad = structuredClone(compliance);
    delete bad[key];
    assert.throws(() => validateCompliance(bad), /Compliance gate failed/);
  }
  assert.deepEqual(
    new Set(scanSensitive("me@site.test password=hunter2").map((x) => x.kind)),
    new Set(["pii", "secret"]),
  );
});

test("MinHash and embedding plugin produce attributable clusters", async () => {
  const minCalls = [],
    judge = [];
  const near = await new DistillationPipeline(
    provider("generator", { a: "alpha beta gamma delta epsilon", b: "alpha beta gamma delta zeta" }, minCalls),
    provider("judge", {}, judge),
    undefined,
    () => new Date(0).toISOString(),
  ).run([example("a", "x"), example("b", "y")], { ...config, minhashThreshold: 0.4, lexicalOnly: true });
  assert.ok(near.records[1].dedupe.minhash);
  const embedding = {
    id: "fixture",
    threshold: 0.9,
    async embed() {
      return [
        [1, 0],
        [1, 0],
      ];
    },
  };
  const semantic = await new DistillationPipeline(
    provider("generator", { a: "red", b: "completely different blue" }, []),
    provider("judge", {}, []),
    embedding,
    () => new Date(0).toISOString(),
  ).run([example("a", "x"), example("b", "y")], { ...config, minhashThreshold: 1 });
  assert.ok(semantic.records[1].dedupe.semantic);
});

test("interrupted paid success resumes without duplicate provider calls or candidates", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "distill-resume-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const checkpoint = (s) => saveDistillationState(root, s);
  await assert.rejects(
    new DistillationPipeline(
      provider("generator", {}, calls, 2),
      provider("judge", {}, []),
      undefined,
      () => new Date(0).toISOString(),
      checkpoint,
    ).run([example("a", "a"), example("b", "b")], config),
    /interrupt/,
  );
  const partial = await loadDistillationState(root);
  assert.equal(Object.keys(partial.paidSuccesses).length, 1);
  const resumedCalls = [],
    judgeCalls = [];
  const state = await new DistillationPipeline(
    provider("generator", {}, resumedCalls),
    provider("judge", {}, judgeCalls),
    undefined,
    () => new Date(0).toISOString(),
    checkpoint,
  ).run([example("a", "a"), example("b", "b")], config, partial);
  assert.equal(resumedCalls.length, 1);
  assert.equal(
    state.records.reduce((n, r) => n + r.candidates.length, 0),
    2,
  );
  assert.equal(Object.keys(state.paidSuccesses).length, 6);
});

function budgetedProvider(kind, calls, initialSpent = 0) {
  return new ReliableTeacherProvider({
    transport: {
      async invoke(request) {
        calls.push(request);
        const content =
          kind === "judge"
            ? JSON.stringify({ quality: 0.8, correctness: 0.9, safety: 1, style: 0.7 })
            : `answer ${request.sampleId}`;
        return {
          response: { kind: "text", content },
          usage: { inputTokens: 2_000_000, outputTokens: 0, totalTokens: 2_000_000 },
          finishReason: "stop",
        };
      },
    },
    catalog: { price: () => ({ inputPerMillion: 1, outputPerMillion: 1, currency: "USD" }) },
    budgets: { global: 1, stage: 1, provider: 1, currency: "USD" },
    initialSpent,
  });
}

test("generator actual overrun persists and cross-instance resume makes no duplicate or subsequent call", async () => {
  let partial;
  const firstCalls = [];
  await assert.rejects(
    new DistillationPipeline(
      budgetedProvider("generator", firstCalls),
      provider("judge", {}, []),
      undefined,
      () => new Date(0).toISOString(),
      async (state) => {
        partial = structuredClone(state);
      },
    ).run([example("a", "a"), example("b", "b")], config),
    /Budget exceeded \(actual\)/,
  );
  assert.equal(firstCalls.length, 1);
  assert.equal(Object.keys(partial.paidSuccesses).length, 1);
  assert.equal(partial.costs.generator.cost, 2);
  const resumedCalls = [];
  await assert.rejects(
    new DistillationPipeline(
      budgetedProvider("generator", resumedCalls, partial.costs.generator.cost),
      provider("judge", {}, []),
    ).run([example("a", "a"), example("b", "b")], config, partial),
    /Budget exceeded \(estimated\)/,
  );
  assert.equal(resumedCalls.length, 0);
  assert.equal(Object.keys(partial.paidSuccesses).length, 1);
});

test("judge actual overrun persists and cross-instance resume makes no duplicate judge call", async () => {
  let partial;
  const judgeCalls = [];
  await assert.rejects(
    new DistillationPipeline(
      provider("generator", {}, []),
      budgetedProvider("judge", judgeCalls),
      undefined,
      () => new Date(0).toISOString(),
      async (state) => {
        partial = structuredClone(state);
      },
    ).run([example("a", "a")], config),
    /Budget exceeded \(actual\)/,
  );
  assert.equal(judgeCalls.length, 1);
  assert.equal(partial.costs.judge.cost, 2);
  const resumedJudgeCalls = [];
  await assert.rejects(
    new DistillationPipeline(
      provider("generator", {}, []),
      budgetedProvider("judge", resumedJudgeCalls, partial.costs.judge.cost),
    ).run([example("a", "a")], config, partial),
    /Budget exceeded \(estimated\)/,
  );
  assert.equal(resumedJudgeCalls.length, 0);
  assert.equal(Object.keys(partial.paidSuccesses).length, 2);
});
