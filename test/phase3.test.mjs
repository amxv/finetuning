import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fullToolTrajectoryConversationFixture, trajectoryToDatasetExample } from "../dist/core/index.js";
import {
  AttemptLedger,
  LocalDagExecutor,
  createStageCacheKey,
  freezeDataset,
  verifyFrozenDataset,
} from "../dist/orchestration/index.js";
import { ContentAddressedBlobStore, ScopedLock, atomicWrite, redactSecrets } from "../dist/node/index.js";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "finetuning-phase3-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("atomic writes clean temporary files across injected boundaries", async (t) => {
  const directory = await fixture(t);
  for (const boundary of ["after-temp-write", "before-rename", "after-rename"]) {
    const path = join(directory, boundary);
    await assert.rejects(
      atomicWrite(path, "value", (current) => {
        if (current === boundary) throw new Error("fault");
      }),
    );
  }
});
test("blob and frozen dataset hashes detect tampering deterministically", async (t) => {
  const directory = await fixture(t);
  const blobs = new ContentAddressedBlobStore(join(directory, "blobs"));
  const hash = await blobs.put("hello");
  await writeFile(join(directory, "blobs", hash.slice(0, 2), hash), "tampered");
  await assert.rejects(blobs.get(hash), /hash mismatch/);
  const frozen = join(directory, "frozen");
  const first = await freezeDataset(frozen, [trajectoryToDatasetExample(fullToolTrajectoryConversationFixture)]);
  assert.deepEqual(await verifyFrozenDataset(frozen), first);
  await writeFile(join(frozen, "records.jsonl"), "tampered\n");
  await assert.rejects(verifyFrozenDataset(frozen), /hash mismatch/);
});
test("stale recovery preserves prior attempts", async (t) => {
  const ledger = new AttemptLedger(join(await fixture(t), "ledger.json"));
  await ledger.start("run", "stage", "record", new Date(0), 1);
  assert.equal(await ledger.recoverAbandoned("run", "stage", "record", new Date(10)), 1);
  const next = await ledger.start("run", "stage", "record", new Date(20), 10);
  assert.equal(next.attempt, 2);
  const state = await ledger.read("run", "stage", "record");
  assert.equal(state.attempts[0].status, "failed_retryable");
});
test("cache identity reuses same config and misses changed config", () => {
  const a = createStageCacheKey(["x"], { b: 2, a: 1 }, "v1");
  assert.equal(a, createStageCacheKey(["x"], { a: 1, b: 2 }, "v1"));
  assert.notEqual(a, createStageCacheKey(["x"], { a: 2, b: 2 }, "v1"));
});
test("executor resumes without duplicate successful output", async (t) => {
  const directory = await fixture(t);
  const executor = new LocalDagExecutor(directory);
  let calls = 0;
  const stages = [
    {
      id: "one",
      implementationVersion: "1",
      config: { x: 1 },
      async execute() {
        calls += 1;
        return { ok: true };
      },
    },
  ];
  const first = await executor.run("run", stages);
  const second = await executor.run("run", stages);
  assert.equal(calls, 1);
  assert.equal(first.get("one"), second.get("one"));
});
test("scoped locks exclude concurrent writers", async (t) => {
  const path = join(await fixture(t), "lock");
  const first = new ScopedLock(path),
    second = new ScopedLock(path);
  await first.acquire();
  await assert.rejects(second.acquire(), (error) => error.code === "EEXIST");
  await first.release();
});
test("persistable structures redact keys tokens and sensitive headers", () => {
  assert.deepEqual(redactSecrets({ apiKey: "x", authorization: "Bearer abc", nested: { token: "x", okay: "value" } }), {
    apiKey: "[REDACTED]",
    authorization: "[REDACTED]",
    nested: { token: "[REDACTED]", okay: "value" },
  });
});
test("deferred log boundary remains unchanged", async () => {
  const source = await readFile(new URL("../src/core/logs.ts", import.meta.url), "utf8");
  assert.match(source, /publicContractStatus: "not-defined"/);
  assert.match(source, /cliCommand: "convert-logs"/);
});
