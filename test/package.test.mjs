import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
      'import * as sdk from "@amxv/finetuning"; import * as experimental from "@amxv/finetuning/experimental/advanced-distillation"; import * as embeddings from "@amxv/finetuning/embeddings"; import * as formats from "@amxv/finetuning/embeddings/formats"; import * as distillation from "@amxv/finetuning/embeddings/distillation"; import * as training from "@amxv/finetuning/embeddings/training"; import * as evaluation from "@amxv/finetuning/embeddings/evaluation"; if (!sdk.validateOpenAIJsonl || !experimental.validateLogitTarget || !embeddings.EmbeddingDatasetBuilder || !formats.decodeEmbeddingRow || !distillation.EmbeddingDistillationPipeline || !training.EmbeddingTrainingRun || !evaluation.EmbeddingEvaluator || "validateLogitTarget" in sdk || "validateEmbeddingRecord" in sdk) throw new Error("missing or leaked export");\n',
    );
    await execFileAsync(process.execPath, ["consumer.mjs"], { cwd: fixture });
    await writeFile(
      join(fixture, "embedding-example.ts"),
      'import { runEmbeddingSdkExample } from "@amxv/finetuning/examples/embedding-sdk"; const result = await runEmbeddingSdkExample(); if (!result.validation.valid) throw new Error("invalid");\n',
    );
    await execFileAsync(
      fileURLToPath(new URL("node_modules/.bin/tsc", root)),
      [
        "--noEmit",
        "--target",
        "ES2022",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        "embedding-example.ts",
      ],
      { cwd: fixture },
    );
    await writeFile(
      join(fixture, "embedding-example.mjs"),
      'import { runEmbeddingSdkExample } from "@amxv/finetuning/examples/embedding-sdk"; const result = await runEmbeddingSdkExample(); if (!result.validation.valid) throw new Error("invalid"); console.log(JSON.stringify(result));\n',
    );
    const { stdout: sdkOutput } = await execFileAsync(process.execPath, ["embedding-example.mjs"], { cwd: fixture });
    assert.equal(JSON.parse(sdkOutput).validation.valid, true);
    const { stdout: help } = await execFileAsync(join(fixture, "node_modules/.bin/finetuning"), ["--help"], {
      cwd: fixture,
    });
    assert.match(help, /^Usage: finetuning <command>/);
    const { stdout: embedHelp } = await execFileAsync(
      join(fixture, "node_modules/.bin/finetuning"),
      ["embed", "train", "estimate", "--help"],
      { cwd: fixture },
    );
    assert.match(embedHelp, /^Usage:/);
    const installed = JSON.parse(await readFile(join(fixture, "node_modules/@amxv/finetuning/package.json"), "utf8"));
    assert.equal(installed.private, true);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
