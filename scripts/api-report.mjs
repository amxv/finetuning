import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";

const root = new URL("../", import.meta.url);
const reportPath = new URL("../test/snapshots/api-report.md", import.meta.url);
const declarations = [
  "dist/index.d.ts",
  "dist/core/index.d.ts",
  "dist/providers/index.d.ts",
  "dist/simulation/index.d.ts",
  "dist/translation/index.d.ts",
  "dist/examples/testing.d.ts",
  "dist/formats/index.d.ts",
  "dist/formats/openai.d.ts",
  "dist/validation/index.d.ts",
  "dist/generation/index.d.ts",
  "dist/templates/index.d.ts",
  "dist/training/index.d.ts",
  "dist/orchestration/index.d.ts",
  "dist/distillation/index.d.ts",
  "dist/node/index.d.ts",
];

let report = "# Public API declaration report\n\nGenerated from the public package entry points.\n";
for (const declaration of declarations) {
  const url = new URL(declaration, root);
  report += `\n## ${relative(new URL(".", root).pathname, url.pathname)}\n\n\`\`\`ts\n`;
  report += (await readFile(url, "utf8")).trimEnd();
  report += "\n```\n";
}

if (process.argv.includes("--write")) {
  await writeFile(reportPath, report);
  console.log(`Wrote ${reportPath.pathname}`);
} else if (process.argv.includes("--check")) {
  const expected = await readFile(reportPath, "utf8");
  if (expected !== report) {
    throw new Error("Public API declarations changed. Run npm run api:report and review the snapshot.");
  }
  console.log("Public API declaration report matches the snapshot.");
} else {
  process.stdout.write(report);
}
