import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { fullToolTrajectoryConversationFixture, trajectoryToDatasetExample } from "../dist/core/index.js";
import { AttemptLedger } from "../dist/orchestration/index.js";

const execFileAsync = promisify(execFile),
  cli = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "finetuning-cli3-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function run(args) {
  return execFileAsync(process.execPath, [cli, ...args]);
}

test("noun command help is additive", async () => {
  const { stdout } = await run(["--help"]);
  for (const text of ["simulate-dataset", "dataset freeze", "pipeline status", "pipeline resume"])
    assert.match(stdout, new RegExp(text));
});
test("dataset freeze supports JSON and overwrite refusal", async (t) => {
  const root = await fixture(t),
    input = join(root, "records.jsonl"),
    out = join(root, "frozen");
  await writeFile(input, `${JSON.stringify(trajectoryToDatasetExample(fullToolTrajectoryConversationFixture))}\n`);
  const first = await run(["dataset", "freeze", input, "--out", out, "--json"]);
  const manifest = JSON.parse(first.stdout);
  assert.equal(manifest.recordCount, 1);
  await assert.rejects(run(["dataset", "freeze", input, "--out", out]), (error) =>
    error.stderr.includes("Use --force"),
  );
  const forced = await run(["dataset", "freeze", input, "--out", out, "--force", "--json"]);
  assert.deepEqual(JSON.parse(forced.stdout), manifest);
});
test("pipeline status is JSON and read-only", async (t) => {
  const root = await fixture(t),
    path = join(root, "ledger.json"),
    ledger = new AttemptLedger(path);
  await ledger.start("run", "stage", "record", new Date(0), 100);
  const before = await readFile(path, "utf8");
  const { stdout } = await run([
    "pipeline",
    "status",
    "--ledger",
    path,
    "--run-id",
    "run",
    "--stage-id",
    "stage",
    "--record-id",
    "record",
    "--json",
  ]);
  assert.equal(JSON.parse(stdout).attempts.length, 1);
  assert.equal(await readFile(path, "utf8"), before);
});
test("pipeline resume is idempotent and rejects unsupported plans", async (t) => {
  const root = await fixture(t),
    plan = join(root, "plan.json"),
    state = join(root, "state");
  await writeFile(plan, JSON.stringify({ stages: [{ id: "one", kind: "constant", value: { ok: true } }] }));
  const args = ["pipeline", "resume", "--root", state, "--run-id", "run", "--plan", plan, "--json"];
  const first = JSON.parse((await run(args)).stdout),
    second = JSON.parse((await run(args)).stdout);
  assert.deepEqual(second, first);
  await writeFile(plan, JSON.stringify({ stages: [{ id: "bad", kind: "shell", value: "no" }] }));
  await assert.rejects(run(args), (error) => error.stderr.includes('only kind "constant" is supported'));
});
