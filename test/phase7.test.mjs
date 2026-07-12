import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
const exec = promisify(execFile),
  cli = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));
test("training CLI prepare run resume status evaluate export executes CPU fixture", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "phase7-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const frozen = join(root, "frozen");
  await mkdir(frozen);
  const record = {
    messages: [
      { role: "user", content: [{ type: "text", text: "hello" }] },
      { role: "assistant", content: [{ type: "text", text: "answer" }] },
    ],
  };
  await writeFile(join(frozen, "records.jsonl"), JSON.stringify(record) + "\n");
  await writeFile(join(frozen, "manifest.json"), "{}");
  const spec = join(root, "spec.json"),
    out = join(root, "out"),
    pythonRoot = resolve("python");
  const prepared = JSON.parse(
    (
      await exec(process.execPath, [
        cli,
        "training",
        "prepare",
        "--recipe",
        "cpu-tiny-fixture",
        "--run-id",
        "r",
        "--dataset-manifest",
        join(frozen, "manifest.json"),
        "--records-hash",
        "a".repeat(64),
        "--out",
        out,
        "--spec-out",
        spec,
        "--json",
      ])
    ).stdout,
  );
  assert.equal(prepared.executable, true);
  const command = async (verb, extra = []) =>
    JSON.parse(
      (
        await exec(process.execPath, [
          cli,
          "training",
          verb,
          "--spec",
          spec,
          "--python-root",
          pythonRoot,
          "--json",
          ...extra,
        ])
      ).stdout,
    );
  await assert.rejects(command("resume"), /checkpoint/i);
  await assert.rejects(readFile(`${spec}.resume.json`));
  assert.equal((await command("run")).exitCode, 0);
  const checkpoint = join(out, "checkpoint-1.json");
  assert.equal(
    (await command("status", ["--checkpoint", checkpoint])).events.at(-1).data.checkpointClassification,
    "full-resume",
  );
  assert.equal((await command("resume", ["--checkpoint", checkpoint])).exitCode, 0);
  assert.equal((await command("evaluate")).events.at(-1).type, "completed");
  assert.equal(
    (await command("export")).events.some((x) => x.type === "artifact"),
    true,
  );
  assert.equal(
    JSON.parse(await readFile(join(out, "artifact-manifest.json"), "utf8")).artifactManifestVersion,
    "1.0.0",
  );
});
