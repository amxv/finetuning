import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const out = join(root, "docs-dist");
await access(join(out, "favicon.svg"));
await access(join(out, "pagefind", "pagefind.js"));
const metadata = JSON.parse(await readFile(join(out, "pagefind", "pagefind-entry.json"), "utf8"));
assert(Object.keys(metadata.languages ?? {}).length > 0, "Pagefind must contain a production language index");

const htmlFiles = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name.endsWith(".html")) htmlFiles.push(path);
  }
}
await walk(out);
assert(htmlFiles.length >= 29, "expected landing, index, and complete docs collection");
const html = (await Promise.all(htmlFiles.map((file) => readFile(file, "utf8")))).join("\n");
assert.match(html, /data-docs-search/);
assert.match(html, /\/pagefind\//);
assert.match(html, /docs\/distillation-guide/);
assert.match(html, /docs\/evaluation-artifacts/);
assert.doesNotMatch(html, /blob\/gg\/finetuning-core|Phase 19 will|future Phase 20 work/i);
assert.match(html, /text-decoration-(?:line|color)/, "production CSS must preserve a prose-link affordance");
console.log(
  `Verified production docs: ${htmlFiles.length} HTML pages, favicon, Pagefind index, stable links, and prose-link CSS.`,
);
