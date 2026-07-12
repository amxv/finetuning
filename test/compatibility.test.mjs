import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));

test("root and subpath exports match the compatibility snapshot", async () => {
  const specifiers = [
    "../dist/index.js",
    "../dist/core/index.js",
    "../dist/providers/index.js",
    "../dist/simulation/index.js",
    "../dist/translation/index.js",
    "../dist/examples/testing.js",
    "../dist/formats/index.js",
    "../dist/formats/openai.js",
    "../dist/validation/index.js",
    "../dist/generation/index.js",
    "../dist/templates/index.js",
    "../dist/training/index.js",
    "../dist/orchestration/index.js",
    "../dist/distillation/index.js",
    "../dist/node/index.js",
  ];
  const actual = {};
  for (const specifier of specifiers)
    actual[specifier.replace("../dist", "@amxv/finetuning").replace("/index.js", "").replace(".js", "")] = Object.keys(
      await import(specifier),
    ).sort();
  const expected = JSON.parse(await readFile(new URL("snapshots/exports.json", import.meta.url), "utf8"));
  assert.deepEqual(actual, expected);
});

test("CLI help matches the compatibility snapshot", async () => {
  const snapshots = JSON.parse(await readFile(new URL("snapshots/cli-help.json", import.meta.url), "utf8"));
  for (const [command, expected] of Object.entries(snapshots)) {
    const args = command === "root" ? ["--help"] : [command, "--help"];
    const { stdout, stderr } = await execFileAsync(process.execPath, [cli, ...args], { cwd: root });
    assert.equal(stderr, "");
    assert.equal(stdout, expected);
  }
});
