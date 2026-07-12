import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const docs = ["README.md", "CHANGELOG.md", "MIGRATION.md", "SUPPORT.md", "docs/alpha-chat-workflows.md"];
for (const file of docs) {
  const text = await readFile(join(root, file), "utf8");
  for (const match of text.matchAll(/\[[^\]]+\]\((?!https?:|#)([^)]+)\)/g))
    await access(resolve(dirname(join(root, file)), match[1]));
}
JSON.parse(await readFile(join(root, "examples/provider-config.example.json"), "utf8"));
JSON.parse(await readFile(join(root, "examples/offline-training-spec.json"), "utf8"));
const temp = await mkdtemp(join(tmpdir(), "finetuning-docs-"));
try {
  const spec = JSON.parse(await readFile(join(root, "examples/offline-training-spec.json"), "utf8"));
  spec.outputDirectory = join(temp, "artifacts");
  const path = join(temp, "spec.json");
  await writeFile(path, JSON.stringify(spec));
  const { spawnSync } = await import("node:child_process");
  const run = spawnSync("python3", ["-m", "amxv_finetuning_trainer.fake_runner", path], {
    cwd: join(root, "python"),
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /"type": "completed"/);
} finally {
  await rm(temp, { recursive: true, force: true });
}
