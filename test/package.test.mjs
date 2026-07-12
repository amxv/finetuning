import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { promisify } from "node:util";
import { runNpm } from "../scripts/lib/npm-command.mjs";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);

test("packed package imports and runs its bin in a clean ESM consumer", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "finetuning-consumer-")),
    stage = join(fixture, "stage"),
    source = fileURLToPath(root);
  try {
    await mkdir(stage);
    const sourcePackage = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    for (const entry of ["package.json", ...sourcePackage.files])
      await cp(join(source, entry), join(stage, entry), { recursive: true });
    const { stdout } = await runNpm(
      execFileAsync,
      ["pack", "--ignore-scripts", "--json", "--pack-destination", fixture],
      { cwd: stage },
    );
    const [{ filename }] = JSON.parse(stdout);
    await writeFile(join(fixture, "package.json"), '{"private":true,"type":"module"}\n');
    await runNpm(execFileAsync, ["install", "--ignore-scripts", `./${filename}`], { cwd: fixture });
    await writeFile(
      join(fixture, "consumer.mjs"),
      'import * as sdk from "@amxv/finetuning"; import * as experimental from "@amxv/finetuning/experimental/advanced-distillation"; import * as embeddings from "@amxv/finetuning/embeddings"; import * as formats from "@amxv/finetuning/embeddings/formats"; import * as distillation from "@amxv/finetuning/embeddings/distillation"; import * as training from "@amxv/finetuning/embeddings/training"; import * as evaluation from "@amxv/finetuning/embeddings/evaluation"; if (!sdk.validateOpenAIJsonl || !experimental.validateLogitTarget || !embeddings.EmbeddingDatasetBuilder || !formats.decodeEmbeddingRow || !distillation.EmbeddingDistillationPipeline || !training.EmbeddingTrainingRun || !evaluation.EmbeddingEvaluator || "validateLogitTarget" in sdk || "validateEmbeddingRecord" in sdk) throw new Error("missing or leaked export");\n',
    );
    await execFileAsync(process.execPath, ["consumer.mjs"], { cwd: fixture });
    for (const subpath of Object.keys(sourcePackage.exports).filter((key) => key !== "./package.json")) {
      const specifier = subpath === "." ? "@amxv/finetuning" : `@amxv/finetuning/${subpath.slice(2)}`;
      await execFileAsync(
        process.execPath,
        ["--input-type=module", "--eval", `await import(${JSON.stringify(specifier)})`],
        { cwd: fixture },
      );
    }
    await writeFile(
      join(fixture, "embedding-example.ts"),
      'import { runEmbeddingSdkExample } from "@amxv/finetuning/examples/embedding-sdk"; const result = await runEmbeddingSdkExample(); if (!result.validation.valid) throw new Error("invalid");\n',
    );
    await execFileAsync(
      process.execPath,
      [
        fileURLToPath(new URL("node_modules/typescript/bin/tsc", root)),
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
    const installed = JSON.parse(await readFile(join(fixture, "node_modules/@amxv/finetuning/package.json"), "utf8"));
    assert.equal(installed.private, true);
    assert.deepEqual(installed.bin, { finetuning: "./dist/cli/index.js" });
    const finetuningBin = join(
      fixture,
      "node_modules/.bin",
      process.platform === "win32" ? "finetuning.cmd" : "finetuning",
    );
    await access(finetuningBin);
    const { stdout: help } = await runNpm(execFileAsync, ["exec", "--offline", "--", "finetuning", "--help"], {
      cwd: fixture,
    });
    assert.match(help, /^Usage: finetuning <command>/);
    const { stdout: embedHelp } = await runNpm(
      execFileAsync,
      ["exec", "--offline", "--", "finetuning", "embed", "train", "estimate", "--help"],
      { cwd: fixture },
    );
    assert.match(embedHelp, /^Usage:/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
