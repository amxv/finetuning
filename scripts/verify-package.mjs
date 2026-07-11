import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = new URL("../", import.meta.url);
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(pkg.private, true, "the alpha package must remain private");
assert.deepEqual(Object.keys(pkg.dependencies ?? {}), [], "NPM runtime dependencies must stay empty");
assert.equal(pkg.peerDependenciesMeta.openai.optional, true);
assert.equal(pkg.peerDependenciesMeta["@anthropic-ai/sdk"].optional, true);
if (process.argv.includes("--source-only")) process.exit(0);

const directory = await mkdtemp(join(tmpdir(), "finetuning-pack-audit-"));
try {
  const { stdout } = await exec("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", directory], {
    cwd: root,
  });
  const [packed] = JSON.parse(stdout);
  const names = packed.files.map(({ path }) => path);
  for (const required of [
    "package.json",
    "LICENSE",
    "README.md",
    "CHANGELOG.md",
    "MIGRATION.md",
    "SUPPORT.md",
    "dist/index.js",
    "dist/cli/index.js",
  ])
    assert(names.includes(required), `packed NPM artifact is missing ${required}`);
  const forbidden =
    /(^|\/)(\.env|node_modules|python|tmp|outputs|coverage|__pycache__)(\/|$)|\.(pem|key|pt|bin|safetensors)$/i;
  assert.deepEqual(
    names.filter((name) => forbidden.test(name)),
    [],
    "packed NPM artifact contains forbidden content",
  );
  assert(packed.size < 2_000_000, `packed NPM artifact is unexpectedly large: ${packed.size}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
