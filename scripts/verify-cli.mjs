import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { retailSupportScenarioProfile } from "../dist/core/index.js";

const execFileAsync = promisify(execFile);
const workspace = new URL("../tmp/cli-verify/", import.meta.url);
const cliPath = new URL("../dist/cli/index.js", import.meta.url).pathname;

await rm(workspace, { recursive: true, force: true });
await mkdir(workspace, { recursive: true });

const configPath = join(workspace.pathname, "retail-scenario.json");
const personasPath = join(workspace.pathname, "personas.json");
const datasetPath = join(workspace.pathname, "dataset.jsonl");
const malformedPath = join(workspace.pathname, "malformed.jsonl");
const unsupportedRolePath = join(workspace.pathname, "unsupported-role.jsonl");

await writeFile(configPath, `${JSON.stringify(retailSupportScenarioProfile, null, 2)}\n`);

const personasRun = await runCli(["generate-personas", "--config", configPath, "--out", personasPath, "--count", "1"]);
if (!personasRun.stdout.includes("Wrote 1 personas")) {
  throw new Error(`generate-personas did not report expected output:\n${personasRun.stdout}`);
}

const personas = JSON.parse(await readFile(personasPath, "utf8"));
if (!Array.isArray(personas) || personas.length !== 1 || personas[0].id !== "persona-product-comparison") {
  throw new Error("generate-personas did not write the expected persona JSON.");
}

const simulateRun = await runCli([
  "simulate-dataset",
  "--profile",
  "sample-retail-support",
  "--out",
  datasetPath,
  "--limit",
  "2",
]);
if (!simulateRun.stdout.includes("Rows: 2") || !simulateRun.stdout.includes("Tool calls: 2")) {
  throw new Error(`simulate-dataset did not report expected summary:\n${simulateRun.stdout}`);
}

const datasetLines = (await readFile(datasetPath, "utf8")).trim().split("\n");
if (datasetLines.length !== 2) {
  throw new Error(`simulate-dataset wrote ${datasetLines.length} rows instead of 2.`);
}

await expectCliFailure([
  "simulate-dataset",
  "--profile",
  "sample-retail-support",
  "--out",
  datasetPath,
  "--limit",
  "1",
]);

const validationRun = await runCli(["validate-dataset", datasetPath]);
if (!validationRun.stdout.includes("Dataset is valid.") || !validationRun.stdout.includes("Rows: 2")) {
  throw new Error(`validate-dataset did not validate generated dataset:\n${validationRun.stdout}`);
}

await writeFile(malformedPath, "{\"messages\":[{\"role\":\"assistant\",\"content\":null,\"tool_calls\":[{\"id\":\"bad\",\"type\":\"function\",\"function\":{\"name\":\"lookup\",\"arguments\":\"not json\"}}]}]}\n");
const malformedRun = await expectCliFailure(["validate-dataset", malformedPath]);
if (!malformedRun.stderr.includes("Validation errors")) {
  throw new Error(`validate-dataset did not report malformed row errors:\n${malformedRun.stderr}`);
}

await writeFile(unsupportedRolePath, "{\"messages\":[{\"role\":\"developer\",\"content\":\"x\"}]}\n");
const unsupportedRoleRun = await expectCliFailure(["validate-dataset", unsupportedRolePath]);
if (
  !unsupportedRoleRun.stderr.includes("messages[0].role") ||
  !unsupportedRoleRun.stderr.includes("message role must be one of system, user, assistant, or tool")
) {
  throw new Error(`validate-dataset did not report unsupported role errors:\n${unsupportedRoleRun.stderr}`);
}

await rm(workspace, { recursive: true, force: true });
console.log("Verified CLI generate-personas, simulate-dataset, validate-dataset, overwrite safety, and invalid validation.");

async function runCli(args) {
  return execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: new URL("..", import.meta.url).pathname,
  });
}

async function expectCliFailure(args) {
  try {
    await runCli(args);
  } catch (error) {
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }

  throw new Error(`Expected CLI command to fail: ${args.join(" ")}`);
}
