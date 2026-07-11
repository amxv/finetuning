import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
const runFile = promisify(execFile),
  cli = new URL("../dist/cli/index.js", import.meta.url).pathname;
const run = (args) => runFile(process.execPath, [cli, ...args]);
test("distill CLI init, plan, responses, status, resume, freeze and overwrite rules", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "distill-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, "input.jsonl"),
    configPath = join(root, "config.json"),
    project = join(root, "project"),
    frozen = join(root, "frozen");
  const record = {
    datasetSchemaVersion: "1.0.0",
    id: "one",
    messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    provenance: { source: "fixture" },
    createdAt: new Date(0).toISOString(),
    metadata: { taxonomy: ["support"] },
  };
  const config = {
    runId: "cli",
    salt: "s",
    generator: { provider: "openai", model: "fake" },
    judge: { provider: "anthropic", model: "judge", orderSwap: true },
    compliance: {
      sourceRights: { status: "approved", basis: "owned" },
      teacherTerms: { url: "https://terms.test", version: "1", reviewedAt: "2026-01-01", approver: "owner" },
      intendedUse: "training",
      retentionPolicy: "30d",
      reasoningPolicy: "none",
      studentLicense: { id: "apache", version: "2" },
    },
  };
  await writeFile(input, JSON.stringify(record) + "\n");
  await writeFile(configPath, JSON.stringify(config));
  const base = ["--root", project, "--json"];
  assert.equal(
    JSON.parse((await run(["distill", "init", ...base, "--config", configPath, "--input", input])).stdout).initialized,
    true,
  );
  await assert.rejects(run(["distill", "init", ...base, "--config", configPath, "--input", input]), (e) =>
    e.stderr.includes("--force"),
  );
  assert.equal(JSON.parse((await run(["distill", "plan", ...base])).stdout).generationCount, 1);
  await assert.rejects(run(["distill", "responses", ...base]), (e) =>
    e.stderr.includes("DISTILL_NETWORK_OPT_IN_REQUIRED"),
  );
  assert.equal(JSON.parse((await run(["distill", "responses", ...base, "--offline-fake"])).stdout).candidateCount, 1);
  const status = JSON.parse((await run(["distill", "status", ...base])).stdout);
  assert.equal(status.candidateCount, 1);
  const resumed = JSON.parse((await run(["distill", "resume", ...base, "--offline-fake"])).stdout);
  assert.equal(resumed.costs.totalCost, status.costs.totalCost);
  assert.equal(JSON.parse((await run(["distill", "freeze", ...base, "--out", frozen])).stdout).recordCount, 1);
  await assert.rejects(run(["distill", "freeze", ...base, "--out", frozen]), (e) => e.stderr.includes("--force"));
  assert.equal(
    JSON.parse((await run(["distill", "freeze", ...base, "--out", frozen, "--force"])).stdout).recordCount,
    1,
  );
  assert.match((await run(["--help"])).stdout, /distill init\|plan\|responses\|resume\|status\|freeze/);
});
