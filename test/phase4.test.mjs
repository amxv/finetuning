import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ContentAddressedBlobStore } from "../dist/node/index.js";
import {
  ProviderRateLimitError,
  ProviderResponseError,
  ReliableTeacherProvider,
  inspectProvider,
  listProviders,
} from "../dist/providers/index.js";

const request = {
  provider: "openai",
  model: "model",
  requestId: "request",
  sampleId: "sample",
  messages: [{ role: "user", content: "hello" }],
  estimatedInputTokens: 10,
  estimatedOutputTokens: 10,
};
const success = {
  response: { kind: "text", content: "ok" },
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  finishReason: "stop",
};
const catalog = { price: () => ({ inputPerMillion: 1, outputPerMillion: 2, currency: "USD" }) };

test("registry exposes explicit OpenAI and Anthropic capabilities", () => {
  assert.deepEqual(
    listProviders().map((item) => item.provider),
    ["openai", "anthropic"],
  );
  assert.equal(inspectProvider("openai").structuredOutput, "native");
  assert.throws(() => inspectProvider("custom"));
});
test("429, eligible 5xx, and idempotent transport failures retry with fake sleep", async () => {
  for (const failure of [
    new ProviderRateLimitError("429", { details: { retryAfterMs: 7 } }),
    new ProviderResponseError("500", { details: { status: 500 } }),
    new TypeError("network"),
  ]) {
    let calls = 0;
    const sleeps = [];
    const provider = new ReliableTeacherProvider({
      transport: {
        async invoke() {
          if (calls++ === 0) throw failure;
          return success;
        },
      },
      maxRetries: 1,
      sleep: async (ms) => sleeps.push(ms),
      jitter: () => 0,
    });
    const envelope = await provider.generate({ ...request, requestId: `${failure.name}-${Math.random()}` });
    assert.equal(calls, 2);
    assert.equal(envelope.retries.length, 1);
    assert.ok(sleeps[0] >= (failure instanceof ProviderRateLimitError ? 7 : 100));
  }
  let calls = 0;
  const provider = new ReliableTeacherProvider({
    transport: {
      async invoke(req) {
        calls++;
        return new Promise((_, reject) =>
          req.signal.addEventListener("abort", () => reject(req.signal.reason), { once: true }),
        );
      },
    },
    maxRetries: 1,
    sleep: async () => {},
  });
  await assert.rejects(provider.generate({ ...request, provider: "anthropic", requestId: "timeout", timeoutMs: 1 }));
  assert.equal(calls, 1);
});
test("refusal, content-policy, and schema failures are terminal", async () => {
  for (const finishReason of ["refusal", "content_policy", "schema_failure"]) {
    let calls = 0;
    const provider = new ReliableTeacherProvider({
      transport: {
        async invoke() {
          calls++;
          return { ...success, finishReason };
        },
      },
      maxRetries: 3,
      sleep: async () => {},
    });
    await assert.rejects(provider.generate({ ...request, requestId: finishReason }));
    assert.equal(calls, 1);
  }
  let calls = 0;
  const provider = new ReliableTeacherProvider({
    transport: {
      async invoke() {
        calls++;
        return { ...success, response: { kind: "text", content: "not json" } };
      },
    },
  });
  await assert.rejects(
    provider.generate({
      ...request,
      requestId: "schema-parse",
      structuredOutput: { schema: { type: "object", properties: {} } },
    }),
  );
  assert.equal(calls, 1);
});
test("estimated and actual budget stops and unknown prices fail closed", async () => {
  const unknown = new ReliableTeacherProvider({ transport: { invoke: async () => success }, budgets: { global: 1 } });
  await assert.rejects(unknown.generate(request), /Unknown price/);
  const before = new ReliableTeacherProvider({
    transport: {
      invoke: async () => {
        throw new Error("must not call");
      },
    },
    catalog,
    budgets: { global: 0.000001 },
  });
  await assert.rejects(before.generate(request), /Budget exceeded \(estimated\)/);
  const after = new ReliableTeacherProvider({
    transport: { invoke: async () => ({ ...success, usage: { inputTokens: 2_000_000, outputTokens: 0 } }) },
    catalog,
    budgets: { global: 1 },
  });
  await assert.rejects(
    after.generate({ ...request, estimatedInputTokens: 0, estimatedOutputTokens: 0 }),
    /Budget exceeded \(actual\)/,
  );
});
test("concurrency, request rate, cancellation, and idempotence are enforced", async () => {
  let active = 0,
    maximum = 0,
    release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const provider = new ReliableTeacherProvider({
    transport: {
      async invoke() {
        active++;
        maximum = Math.max(maximum, active);
        await gate;
        active--;
        return success;
      },
    },
    concurrency: 1,
  });
  const a = provider.generate({ ...request, requestId: "a" }),
    b = provider.generate({ ...request, requestId: "b" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(maximum, 1);
  release();
  await Promise.all([a, b]);
  let calls = 0;
  const cachedProvider = new ReliableTeacherProvider({
    transport: {
      async invoke() {
        calls++;
        return success;
      },
    },
  });
  const first = await cachedProvider.generate(request),
    second = await cachedProvider.generate(request);
  assert.equal(calls, 1);
  assert.equal(second.cached, true);
  assert.equal(first.requestId, second.requestId);
  const controller = new AbortController();
  controller.abort(new Error("cancelled"));
  await assert.rejects(
    cachedProvider.generate({ ...request, requestId: "cancel", signal: controller.signal }),
    /cancelled/,
  );
  const sleeps = [];
  let now = 0;
  const rate = new ReliableTeacherProvider({
    transport: { invoke: async () => success },
    requestsPerInterval: 1,
    tokensPerInterval: 10,
    intervalMs: 100,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
  });
  await rate.generate({ ...request, requestId: "r1", estimatedInputTokens: 5 });
  await rate.generate({ ...request, requestId: "r2", estimatedInputTokens: 5 });
  assert.deepEqual(sleeps, [100]);
});
test("native envelopes are redacted and retained with attributable refs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "phase4-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const blobs = new ContentAddressedBlobStore(root);
  const provider = new ReliableTeacherProvider({
    blobStore: blobs,
    transport: {
      async invoke() {
        return {
          ...success,
          providerRequestId: "provider-id",
          modelSnapshot: "snapshot",
          apiVersion: "v1",
          nativeRequest: { authorization: "Bearer secret", okay: "x" },
          nativeResponse: { apiKey: "secret", result: "ok" },
        };
      },
    },
  });
  const envelope = await provider.generate(request);
  assert.equal(envelope.providerRequestId, "provider-id");
  assert.match(await blobs.get(envelope.nativeRequestRef), /\[REDACTED\]/);
  assert.doesNotMatch(await blobs.get(envelope.nativeResponseRef), /secret/);
});
