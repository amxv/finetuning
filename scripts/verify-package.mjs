import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { runNpm } from "./lib/npm-command.mjs";
import { toNativePath } from "./lib/portable-paths.mjs";

const exec = promisify(execFile);
const root = toNativePath(new URL("../", import.meta.url));
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(pkg.private, true, "the alpha package must remain private");
assert.deepEqual(Object.keys(pkg.dependencies ?? {}), [], "NPM runtime dependencies must stay empty");
assert.equal(pkg.peerDependenciesMeta.openai.optional, true);
assert.equal(pkg.peerDependenciesMeta["@anthropic-ai/sdk"].optional, true);
if (process.argv.includes("--source-only")) process.exit(0);

const directory = await mkdtemp(join(tmpdir(), "finetuning-pack-audit-"));
try {
  const { stdout } = await runNpm(exec, ["pack", "--json", "--ignore-scripts", "--pack-destination", directory], {
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
  const consumer = join(directory, "consumer");
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  await runNpm(
    exec,
    ["install", "--ignore-scripts", "--no-package-lock", "--no-audit", join(directory, packed.filename)],
    {
      cwd: consumer,
    },
  );
  await writeFile(
    join(consumer, "chat-sdk.mjs"),
    `import { validateDatasetExample } from "@amxv/finetuning/validation";
const report=validateDatasetExample({datasetSchemaVersion:"1.0.0",id:"sdk-chat-example",messages:[{role:"user",content:[{type:"text",text:"Hello"}]},{role:"assistant",content:[{type:"text",text:"Hello!"}]}],provenance:{source:"docs",sourceId:"sdk-chat-example",license:"CC0-1.0"},createdAt:"2026-07-12T00:00:00.000Z"});
console.log(JSON.stringify({valid:report.valid}));\n`,
  );
  assert.equal(JSON.parse((await exec(process.execPath, ["chat-sdk.mjs"], { cwd: consumer })).stdout).valid, true);
} finally {
  await rm(directory, { recursive: true, force: true });
}
