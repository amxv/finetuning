import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  assertValidOpenAIFineTuningRow,
  buildOpenAIFineTuningRow,
  checkAvailabilityToolTrajectoryFixture,
  serializeOpenAIJsonlRows,
  translateOpenAIFineTuningRow,
  validateOpenAIJsonl,
} from "../dist/index.js";

const execFileAsync = promisify(execFile);
const workspace = new URL("../tmp/translation-verify/", import.meta.url);
const cliPath = new URL("../dist/cli/index.js", import.meta.url).pathname;

await rm(workspace, { recursive: true, force: true });
await mkdir(workspace, { recursive: true });

const row = buildOpenAIFineTuningRow(checkAvailabilityToolTrajectoryFixture, { mode: "full_tool_trajectory" });
const originalAssistantToolCall = row.messages[2];
const originalToolResult = row.messages[3];

const translated = await translateOpenAIFineTuningRow(row, {
  sourceLocale: "en-US",
  targetLocale: "es-ES",
});

assertValidOpenAIFineTuningRow(translated.row);

if (translated.provider !== "local-pseudo" || translated.requestPath !== "local-pseudo") {
  throw new Error("Translation did not use the explicit local-pseudo provider/request path.");
}

if (translated.row.messages[0].role !== "system" || !translated.row.messages[0].content.startsWith("[es-ES] ")) {
  throw new Error("System content was not translated by the pseudo adapter.");
}

if (translated.row.messages[1].role !== "user" || !translated.row.messages[1].content.startsWith("[es-ES] ")) {
  throw new Error("User content was not translated by the pseudo adapter.");
}

assertDeepEqual(translated.row.messages[2], originalAssistantToolCall, "assistant tool-call message");
assertDeepEqual(translated.row.messages[3], originalToolResult, "tool result message");

const finalAssistant = translated.row.messages[4];
if (finalAssistant.role !== "assistant" || !finalAssistant.content?.startsWith("[es-ES] ")) {
  throw new Error("Final assistant content was not translated by the pseudo adapter.");
}

const sourcePath = join(workspace.pathname, "source.jsonl");
const outPath = join(workspace.pathname, "translated.jsonl");
await writeFile(sourcePath, serializeOpenAIJsonlRows([row]));

const cliRun = await execFileAsync(process.execPath, [
  cliPath,
  "translate-dataset",
  sourcePath,
  "--target-locale",
  "fr-CA",
  "--source-locale",
  "en-US",
  "--out",
  outPath,
]);

if (!cliRun.stdout.includes("Status: experimental") || !cliRun.stdout.includes("Provider: local-pseudo")) {
  throw new Error(`translate-dataset did not report experimental local-pseudo translation:\n${cliRun.stdout}`);
}

const translatedJsonl = await readFile(outPath, "utf8");
const validation = validateOpenAIJsonl(translatedJsonl);
if (!validation.valid || validation.summary.rowCount !== 1 || validation.summary.toolCallCount !== 1) {
  throw new Error("CLI translated JSONL did not remain valid with one preserved tool call.");
}

const cliTranslatedRow = JSON.parse(translatedJsonl.trim());
assertDeepEqual(cliTranslatedRow.messages[2], originalAssistantToolCall, "CLI assistant tool-call message");
assertDeepEqual(cliTranslatedRow.messages[3], originalToolResult, "CLI tool result message");

await rm(workspace, { recursive: true, force: true });
console.log("Verified experimental translation preserves schema, tool calls, tool results, and valid JSONL.");

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label} changed during translation.\nExpected: ${expectedJson}\nActual: ${actualJson}`);
  }
}
