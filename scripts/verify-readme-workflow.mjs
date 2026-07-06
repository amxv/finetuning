import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const workspace = new URL("../tmp/readme-workflow/", import.meta.url);
const repoRoot = new URL("..", import.meta.url).pathname;
const cliPath = new URL("../dist/cli/index.js", import.meta.url).pathname;

await rm(workspace, { recursive: true, force: true });
await mkdir(workspace, { recursive: true });

const receptionistConfig = "examples/receptionist/scenario.json";
const retailConfig = "examples/retail-support/scenario.json";
const personasPath = join(workspace.pathname, "receptionist-personas.json");
const receptionistDatasetPath = join(workspace.pathname, "receptionist.jsonl");
const retailDatasetPath = join(workspace.pathname, "retail.jsonl");

const personaRun = await runCli([
  "generate-personas",
  "--config",
  receptionistConfig,
  "--out",
  personasPath,
  "--count",
  "2",
]);
if (!personaRun.stdout.includes("Wrote 2 personas")) {
  throw new Error(`README persona workflow did not generate two personas:\n${personaRun.stdout}`);
}

const receptionistRun = await runCli([
  "simulate-dataset",
  "--config",
  receptionistConfig,
  "--out",
  receptionistDatasetPath,
  "--limit",
  "3",
  "--mode",
  "full_tool_trajectory",
]);
assertSummary(receptionistRun.stdout, 3);

const receptionistValidation = await runCli(["validate-dataset", receptionistDatasetPath]);
if (!receptionistValidation.stdout.includes("Dataset is valid.")) {
  throw new Error(`README receptionist workflow did not validate:\n${receptionistValidation.stdout}`);
}

const retailRun = await runCli([
  "simulate-dataset",
  "--config",
  retailConfig,
  "--out",
  retailDatasetPath,
  "--limit",
  "2",
  "--mode",
  "full_tool_trajectory",
]);
assertSummary(retailRun.stdout, 2);

const retailValidation = await runCli(["validate-dataset", retailDatasetPath]);
if (!retailValidation.stdout.includes("Dataset is valid.")) {
  throw new Error(`README retail workflow did not validate:\n${retailValidation.stdout}`);
}

const firstRow = JSON.parse((await readFile(receptionistDatasetPath, "utf8")).trim().split("\n")[0]);
assertFullToolTrajectoryRow(firstRow);

const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const tutorial = await readFile(new URL("../docs/full-tool-trajectory-tutorial.md", import.meta.url), "utf8");
for (const expected of [
  "examples/receptionist/scenario.json",
  "examples/retail-support/scenario.json",
  "--mode full_tool_trajectory",
  "validate-dataset",
]) {
  if (!readme.includes(expected)) {
    throw new Error(`README is missing documented workflow text: ${expected}`);
  }
  if (!tutorial.includes(expected)) {
    throw new Error(`Full tool-trajectory tutorial is missing workflow text: ${expected}`);
  }
}

await rm(workspace, { recursive: true, force: true });
console.log("Verified README and tutorial sample workflows generate and validate full tool-trajectory datasets.");

async function runCli(args) {
  return execFileAsync(process.execPath, [cliPath, ...args], { cwd: repoRoot });
}

function assertSummary(stdout, expectedRows) {
  for (const expected of [
    `Rows: ${expectedRows}`,
    `Tool calls: ${expectedRows}`,
    `Tool results: ${expectedRows}`,
    `Rows with tools: ${expectedRows}`,
  ]) {
    if (!stdout.includes(expected)) {
      throw new Error(`Expected summary line ${expected} was missing:\n${stdout}`);
    }
  }
}

function assertFullToolTrajectoryRow(row) {
  const roles = row.messages?.map((message) => message.role).join(",");
  if (roles !== "system,user,assistant,tool,assistant") {
    throw new Error(`Expected full tool trajectory roles, saw ${roles}`);
  }

  const assistantToolCall = row.messages[2];
  const toolResult = row.messages[3];
  if (!assistantToolCall.tool_calls?.[0]?.id) {
    throw new Error("Expected assistant tool call in generated sample row.");
  }

  if (toolResult.tool_call_id !== assistantToolCall.tool_calls[0].id) {
    throw new Error("Tool result did not reference the generated assistant tool call.");
  }

  if (!Array.isArray(row.tools) || row.tools.length !== 1) {
    throw new Error("Generated tool trajectory row should include one tool definition.");
  }

  JSON.parse(toolResult.content);
}
