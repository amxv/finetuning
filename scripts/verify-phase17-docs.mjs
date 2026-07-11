import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const startedAt = performance.now();
const root = resolve(new URL("../", import.meta.url).pathname);
const cli = join(root, "dist/cli/index.js");
const run = async (...args) => (await exec(process.execPath, [cli, ...args], { cwd: root })).stdout;

// Every documented embedding command exists. This is the authoritative 39-command matrix.
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
let helpCount = 0;
for (const [noun, verbs] of Object.entries(matrix))
  for (const verb of verbs) {
    assert.match(await run("embed", noun, verb, "--help"), /^Usage:/);
    helpCount++;
  }
assert.equal(helpCount, 39);

// Execute the complete checked-in offline chat tutorial without providers, downloads, GPU, or uploads.
await rm(join(root, "tmp/chat-offline"), { recursive: true, force: true });
assert.equal(JSON.parse(await run("dataset","freeze","examples/chat-offline/records.jsonl","--out","tmp/chat-offline/frozen","--force","--json")).recordCount,1);
assert.equal(JSON.parse(await run("distill","init","--root","tmp/chat-offline/distill","--config","examples/chat-offline/distillation.json","--input","examples/chat-offline/records.jsonl","--force","--json")).initialized,true);
assert.equal(JSON.parse(await run("distill","plan","--root","tmp/chat-offline/distill","--json")).generationCount,1);
assert.equal(JSON.parse(await run("distill","responses","--root","tmp/chat-offline/distill","--offline-fake","--json")).candidateCount,1);
assert.equal(JSON.parse(await run("distill","freeze","--root","tmp/chat-offline/distill","--out","tmp/chat-offline/distilled","--force","--json")).recordCount,1);
for (const verb of ["run","evaluate","export","status"]) assert.equal(JSON.parse(await run("training",verb,"--spec","examples/chat-offline/training.json","--python","python3","--python-root","python","--json")).exitCode,0);
assert.equal(JSON.parse(await run("training","resume","--spec","examples/chat-offline/training.json","--python","python3","--python-root","python","--checkpoint","../tmp/chat-offline/train/checkpoint-1.json","--json")).exitCode,0);
const chatManifest=JSON.parse(await readFile(join(root,"tmp/chat-offline/train/artifact-manifest.json"),"utf8"));
for(const item of chatManifest.artifacts)await access(join(root,"tmp/chat-offline/train",item.path));
for (const verb of ["run","resume","evaluate","export","status"]) await rm(join(root,`examples/chat-offline/training.json.${verb}.json`),{force:true});

// Parse every retained JSON/config fixture and reject common credential material.
for (const file of ["records.jsonl", "manifest.json", "training.json", "evaluation.json"]) {
  const text = await readFile(join(root, "examples/embedding-offline", file), "utf8");
  if (file.endsWith(".jsonl")) for (const line of text.trim().split("\n")) JSON.parse(line);
  else JSON.parse(text);
  assert.doesNotMatch(text, /(sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|BEGIN (RSA |OPENSSH )?PRIVATE KEY)/);
}

const validate = JSON.parse(
  await run(
    "embed",
    "data",
    "validate",
    "examples/embedding-offline/records.jsonl",
    "--task",
    "pair",
    "--columns",
    "query=query,document=document",
    "--split-group-column",
    "group",
    "--source",
    "offline-fixture",
    "--source-revision",
    "1",
    "--license",
    "CC0-1.0",
    "--rights",
    "approved",
    "--json",
  ),
);
assert.equal(validate.valid, true);
assert.equal(validate.recordCount, 2);
const estimate = JSON.parse(
  await run("embed", "train", "estimate", "--config", "examples/embedding-offline/training.json", "--json"),
);
assert.deepEqual(
  [estimate.executable, estimate.network, estimate.uploads, estimate.trustRemoteCode],
  [true, false, false, false],
);

await rm(join(root, "tmp/embedding-offline"), { recursive: true, force: true });
const train = JSON.parse(
  await run(
    "embed",
    "train",
    "run",
    "--config",
    "examples/embedding-offline/training.json",
    "--python-root",
    "python",
    "--json",
  ),
);
assert.equal(train.execution.exitCode, 0);
const checkpoint = "../tmp/embedding-offline/run/checkpoint-4.json";
const status = JSON.parse(
  await run(
    "embed",
    "train",
    "status",
    "--config",
    "examples/embedding-offline/training.json",
    "--checkpoint",
    checkpoint,
    "--python-root",
    "python",
    "--json",
  ),
);
assert.equal(status.execution.events.at(-1).data.checkpointClassification, "full-resume");
const resume = JSON.parse(
  await run(
    "embed",
    "train",
    "resume",
    "--config",
    "examples/embedding-offline/training.json",
    "--checkpoint",
    checkpoint,
    "--python-root",
    "python",
    "--json",
  ),
);
assert.equal(resume.execution.events.at(-1).data.resumeClassification, "full-resume");
const evaluated = JSON.parse(
  await run("embed", "evaluate", "run", "--config", "examples/embedding-offline/evaluation.json", "--json"),
);
assert.equal(evaluated.result.reportHash, "2cde4c4ca321edb82ac2b69346f9986b6693797ba2b9019dab4e9a76a473a6aa");
const compared = JSON.parse(
  await run(
    "embed",
    "evaluate",
    "compare",
    "--config",
    "examples/embedding-offline/evaluation.json",
    "--left",
    "tmp/embedding-offline/evaluation.json",
    "--right",
    "tmp/embedding-offline/evaluation.json",
    "--json",
  ),
);
assert.equal(compared.result.deltas.mrr, 0);
const inspected = JSON.parse(
  await run(
    "embed",
    "evaluate",
    "inspect",
    "--config",
    "examples/embedding-offline/evaluation.json",
    "--report",
    "tmp/embedding-offline/evaluation.json",
    "--json",
  ),
);
assert.equal(inspected.result.reportHash, evaluated.result.reportHash);
const exported = JSON.parse(
  await run(
    "embed",
    "train",
    "export",
    "--config",
    "examples/embedding-offline/training.json",
    "--python-root",
    "python",
    "--json",
  ),
);
assert.equal(exported.execution.exitCode, 0);
const artifacts = JSON.parse(
  await readFile(join(root, "tmp/embedding-offline/run/embedding-artifact-manifest.json"), "utf8"),
);
assert.equal(artifacts.embeddingArtifactVersion, "embedding.training.artifact.v1");
for (const item of artifacts.artifacts) await access(join(root, "tmp/embedding-offline/run", item.path));
const tree = (await readdir(join(root, "tmp/embedding-offline/run"))).sort();
for (const expected of [
  "checkpoint-4.json",
  "embedding-artifact-manifest.json",
  "environment.json",
  "evaluation.json",
  "export-config.json",
  "gpu.json",
  "model-card.json",
  "model.json",
  "packages.json",
  "resolved-spec.json",
])
  assert(tree.includes(expected));

// Machine-readable production locks are authoritative and remain gated in offline docs verification.
const locks = JSON.parse(await readFile(join(root, "locks/embedding-models-v1.json"), "utf8"));
assert.equal(locks.models.length, 5);
assert(locks.models.every((model) => model.status === "unavailable"));
const support = JSON.parse(await readFile(join(root, "locks/recipe-support-v1.json"), "utf8"));
const assertGeneratedReferencesCurrent = (candidate) => {
  for (const model of locks.models) {
    const row = candidate.recipes.find((x) => x.track === "embedding" && x.modelId === model.modelId);
    assert(row, `missing generated recipe reference for ${model.modelId}`);
    assert.equal(row.status, model.status, `stale generated status for ${model.modelId}`);
  }
};
assertGeneratedReferencesCurrent(support);
assert.throws(() =>
  assertGeneratedReferencesCurrent({
    ...support,
    recipes: support.recipes.map((x) => (x.modelId === locks.models[0].modelId ? { ...x, status: "supported" } : x)),
  }),
);
const operations = await readFile(join(root, "src/content/docs/operations-compliance.md"), "utf8");
assert.match(
  operations,
  /model license does not clear data, teacher-output, privacy, trademark, or regulated-use rights/i,
);
assert.match(operations, /not run by the default verification suite/i);

// Markdown hygiene: one H1-equivalent title in frontmatter, ordered headings, useful image alt text, no broken local doc routes.
const docsDir = join(root, "src/content/docs");
const docFiles = (await readdir(docsDir)).filter((x) => x.endsWith(".md"));
const slugs = new Set(docFiles.map((x) => x.slice(0, -3)));
for (const file of docFiles) {
  const text = await readFile(join(docsDir, file), "utf8");
  assert.match(text, /^---\n[\s\S]*?title:/);
  assert.doesNotMatch(text, /^# /m);
  assert.doesNotMatch(text, /!\[\]\(/, `${file} has empty image alt text`);
  for (const match of text.matchAll(/\]\(\/docs\/([^)#]+)(?:#[^)]+)?\)/g))
    assert(slugs.has(match[1]), `${file} links to missing ${match[1]}`);
}

// Stable SDK example executes from compiled output; package and wheel clean-install gates run in verify:product.
const sdk = JSON.parse(
  (await exec(process.execPath, [join(root, "dist/examples/embedding-sdk.js")], { cwd: root })).stdout,
);
assert.equal(sdk.validation.valid, true);
console.log(
  `Verified release-grade docs in ${Math.round(performance.now() - startedAt)}ms: ${helpCount} embedding help entries, 2 data rows, full CPU train/resume/evaluate/export, ${artifacts.artifacts.length} hashed artifacts, ${docFiles.length} site pages, 5 gated production locks.`,
);
