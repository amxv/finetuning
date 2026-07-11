import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);

test("packed package imports and runs its bin in a clean ESM consumer", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "finetuning-consumer-"));
  try {
    const { stdout } = await execFileAsync("npm", ["pack", "--json", "--pack-destination", fixture], { cwd: root });
    const [{ filename }] = JSON.parse(stdout);
    await writeFile(join(fixture, "package.json"), '{"private":true,"type":"module"}\n');
    await execFileAsync("npm", ["install", "--ignore-scripts", `./${filename}`], { cwd: fixture });
    await writeFile(
      join(fixture, "consumer.mjs"),
      'import * as sdk from "@amxv/finetuning"; if (!sdk.validateOpenAIJsonl) throw new Error("missing export");\n',
    );
    await execFileAsync(process.execPath, ["consumer.mjs"], { cwd: fixture });
    const { stdout: help } = await execFileAsync(join(fixture, "node_modules/.bin/finetuning"), ["--help"], {
      cwd: fixture,
    });
    assert.match(help, /^Usage: finetuning <command>/);
    const installed = JSON.parse(await readFile(join(fixture, "node_modules/@amxv/finetuning/package.json"), "utf8"));
    assert.equal(installed.private, true);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
