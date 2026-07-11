import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  EmbeddingDatasetBuilder,
  EmbeddingRecordValidator,
  EmbeddingSplitPlanner,
  EmbeddingSdkError,
} from "../dist/embeddings/index.js";
import { parseEmbedProjectConfig, resolveEmbedConfig } from "../dist/cli/embed-config.js";
const exec = promisify(execFile),
  cli = new URL("../dist/cli/index.js", import.meta.url);
test("embedding config is versioned, strict, redacted, and resolves CLI > env > command > defaults", async () => {
  const root = await mkdtemp(join(tmpdir(), "embed-config-"));
  try {
    const path = join(root, "config.json");
    await writeFile(
      path,
      JSON.stringify({
        configVersion: "1.0.0",
        defaults: { dimension: 32, adapter: "lora" },
        commands: { "train.estimate": { dimension: 64 } },
        env: { recipeId: "RECIPE_ID" },
      }),
    );
    const result = await resolveEmbedConfig(
      "train.estimate",
      { positionals: [], flags: { config: path, dimension: "128" } },
      { RECIPE_ID: "secret-recipe" },
    );
    assert.equal(result.resolved.dimension, "128");
    assert.equal(result.resolved.recipeId, "secret-recipe");
    assert.deepEqual(result.environmentReferences, { recipeId: "RECIPE_ID" });
    assert(!JSON.stringify(result.environmentReferences).includes("secret-recipe"));
    await assert.rejects(
      () => resolveEmbedConfig("train.estimate", { positionals: [], flags: { config: path } }, {}),
      /EMBED_CONFIG_ENV_MISSING/,
    );
    assert.throws(() => parseEmbedProjectConfig({ configVersion: "1.0.0", unknown: true }), /UNKNOWN_KEY/);
    assert.throws(() => parseEmbedProjectConfig({ configVersion: "2.0.0" }), /CONFIG_VERSION/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("typed embedding SDK composes without IO side effects", async () => {
  const builder = new EmbeddingDatasetBuilder();
  assert.deepEqual(builder.records(), []);
  assert.equal((await new EmbeddingRecordValidator().validate((async function* () {})())).valid, true);
  assert.deepEqual(new EmbeddingSplitPlanner().plan([], { salt: "s" }).counts, { train: 0, validation: 0, test: 0 });
  assert.equal(new EmbeddingSdkError("EMBED_UNAVAILABLE", "x").toJSON().kind, "embedding-sdk-error");
});
test("every embedding noun and subcommand has process help", async () => {
  const matrix = {
    data: ["create", "import", "convert", "validate", "inspect", "split", "dedupe", "freeze", "export"],
    generate: ["queries", "documents", "pairs"],
    mine: ["negatives"],
    distill: ["vectors", "scores", "rankings", "plan", "run", "resume", "status"],
    models: ["list", "info", "license", "compat"],
    recipes: ["list", "show", "lock"],
    train: ["init", "validate", "estimate", "run", "resume", "status", "evaluate", "export", "inspect"],
    evaluate: ["run", "compare", "inspect"],
  };
  let count = 0;
  for (const [noun, verbs] of Object.entries(matrix))
    for (const verb of verbs) {
      const { stdout } = await exec(process.execPath, [cli.pathname, "embed", noun, verb, "--help"]);
      assert.match(stdout, /Usage:/);
      count++;
    }
  assert.equal(count, 39);
});
