import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  cliCommands,
  createDeferredLogConversionError,
  deferredLogConversionBoundary,
  supportedWorkflows,
} from "../dist/index.js";
import { assertDeferredLogTechnicalDocumentation } from "./lib/log-deferment-docs.mjs";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));

if (deferredLogConversionBoundary.status !== "deferred" || deferredLogConversionBoundary.includedInV1 !== false) {
  throw new Error("Log conversion boundary must be explicitly deferred and excluded from v1.");
}

if (deferredLogConversionBoundary.publicContractStatus !== "not-defined") {
  throw new Error("Log conversion boundary must not claim a defined public log source contract.");
}

if (deferredLogConversionBoundary.privacyStatus !== "redaction-required-before-release") {
  throw new Error("Log conversion boundary must require redaction before release.");
}

for (const requirement of [
  "accepted public log record shape",
  "assistant content extraction rules",
  "assistant tool-call extraction rules",
  "tool result extraction rules",
  "caller-supplied redaction hooks for messages, tool arguments, tool results, and metadata",
  "privacy-safe redacted fixture set with validation coverage",
  "provider/runtime-independent converter implementation",
]) {
  if (!deferredLogConversionBoundary.requiredBeforeRelease.includes(requirement)) {
    throw new Error(`Log conversion boundary is missing release prerequisite: ${requirement}`);
  }
}

const workflow = supportedWorkflows.find((candidate) => candidate.id === deferredLogConversionBoundary.workflowId);
if (!workflow || workflow.status !== "deferred" || !workflow.description.includes("no v1 real-log converter")) {
  throw new Error("Supported workflow manifest does not clearly mark log conversion as deferred.");
}

const command = cliCommands.find((candidate) => candidate.name === deferredLogConversionBoundary.cliCommand);
if (!command || command.status !== "deferred" || !command.description.includes("no log-derived dataset converter")) {
  throw new Error("CLI command manifest does not clearly mark convert-logs as deferred.");
}

const helpRun = await runCli(["convert-logs", "--help"]);
for (const expected of [
  "Status: deferred; no v1 log-derived dataset converter is implemented.",
  "accepted public log record shape",
  "caller-supplied redaction hooks",
]) {
  if (!helpRun.stdout.includes(expected)) {
    throw new Error(`convert-logs help is missing expected deferred text: ${expected}\n${helpRun.stdout}`);
  }
}

const failureRun = await expectCliFailure(["convert-logs"]);
if (failureRun.code !== 2) {
  throw new Error(`convert-logs should exit with code 2, saw ${failureRun.code}.`);
}

if (!failureRun.stderr.includes(createDeferredLogConversionError().message)) {
  throw new Error(`convert-logs did not print the shared deferred error:\n${failureRun.stderr}`);
}

const architecture = await readFile(new URL("../docs/architecture.md", import.meta.url), "utf8");
assertDeferredLogTechnicalDocumentation(architecture);

console.log("Verified log-derived dataset support is explicitly deferred across exports, CLI, and docs.");

async function runCli(args) {
  return execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
  });
}

async function expectCliFailure(args) {
  try {
    await runCli(args);
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }

  throw new Error(`Expected CLI command to fail: ${args.join(" ")}`);
}
