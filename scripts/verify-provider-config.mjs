import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ProviderConfigurationError,
  assertSupportedModelProviderKind,
  resolveProviderClientOptions,
} from "../dist/providers/index.js";

const execFileAsync = promisify(execFile);
const workspace = new URL("../tmp/provider-config-verify/", import.meta.url);
const repoRoot = new URL("..", import.meta.url).pathname;
const cliPath = new URL("../dist/cli/index.js", import.meta.url).pathname;

await rm(workspace, { recursive: true, force: true });
await mkdir(workspace, { recursive: true });

await assertMissingApiKey();
await assertResolvedClientOptions();
await assertUnsupportedProvider();
await assertDeterministicCliStillRunsOffline();
await assertExplicitProviderCliValidatesBeforeAdapterUse();

await rm(workspace, { recursive: true, force: true });
console.log("Verified provider runtime config, missing-key errors, unsupported providers, and offline CLI defaults.");

async function assertMissingApiKey() {
  try {
    resolveProviderClientOptions(
      {
        provider: "openai",
        model: "gpt-5.4",
        apiKeyEnv: "OPENAI_API_KEY",
      },
      {},
    );
  } catch (error) {
    if (
      error instanceof ProviderConfigurationError &&
      error.message === "Missing OPENAI_API_KEY for openai provider"
    ) {
      return;
    }

    throw error;
  }

  throw new Error("Expected missing API key to produce ProviderConfigurationError.");
}

async function assertResolvedClientOptions() {
  const options = resolveProviderClientOptions(
    {
      provider: "anthropic",
      model: "claude-opus-4-8",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      baseUrl: "https://example.test",
      temperature: 0.2,
      maxOutputTokens: 512,
      headers: { "x-provider-test": "yes" },
      metadata: { purpose: "verify-provider-config" },
    },
    { ANTHROPIC_API_KEY: "test-key" },
  );

  if (
    options.model !== "claude-opus-4-8" ||
    options.apiKey !== "test-key" ||
    options.baseUrl !== "https://example.test" ||
    options.temperature !== 0.2 ||
    options.maxOutputTokens !== 512 ||
    options.headers?.["x-provider-test"] !== "yes" ||
    options.metadata?.purpose !== "verify-provider-config"
  ) {
    throw new Error(`Resolved provider options were not preserved: ${JSON.stringify(options)}`);
  }
}

async function assertUnsupportedProvider() {
  try {
    assertSupportedModelProviderKind("unknown-provider");
  } catch (error) {
    if (
      error instanceof ProviderConfigurationError &&
      error.message === "Unsupported provider: unknown-provider"
    ) {
      return;
    }

    throw error;
  }

  throw new Error("Expected unsupported provider to be rejected.");
}

async function assertDeterministicCliStillRunsOffline() {
  const datasetPath = join(workspace.pathname, "deterministic.jsonl");
  const run = await runCli([
    "simulate-dataset",
    "--profile",
    "sample-retail-support",
    "--out",
    datasetPath,
    "--limit",
    "1",
  ]);

  if (!run.stdout.includes("Rows: 1") || !run.stdout.includes("Tool calls: 1")) {
    throw new Error(`Deterministic CLI flow did not run offline:\n${run.stdout}`);
  }

  const contents = await readFile(datasetPath, "utf8");
  if (contents.trim().split("\n").length !== 1) {
    throw new Error("Deterministic CLI flow did not write one JSONL row.");
  }
}

async function assertExplicitProviderCliValidatesBeforeAdapterUse() {
  const missingKeyRun = await expectCliFailure([
    "simulate-dataset",
    "--profile",
    "sample-retail-support",
    "--out",
    join(workspace.pathname, "provider.jsonl"),
    "--simulation-provider",
    "openai",
    "--simulation-model",
    "gpt-5.4",
    "--simulation-api-key-env",
    "PHASE1_OPENAI_KEY",
  ]);

  if (!missingKeyRun.stderr.includes("Missing PHASE1_OPENAI_KEY for openai provider")) {
    throw new Error(`Provider CLI path did not report missing API key:\n${missingKeyRun.stderr}`);
  }

  const unsupportedRun = await expectCliFailure(
    [
      "generate-personas",
      "--profile",
      "sample-retail-support",
      "--out",
      join(workspace.pathname, "personas.json"),
      "--persona-provider",
      "anthropic",
      "--persona-model",
      "claude-opus-4-8",
      "--persona-api-key-env",
      "PHASE1_ANTHROPIC_KEY",
    ],
    { PHASE1_ANTHROPIC_KEY: "test-key" },
  );

  if (!unsupportedRun.stderr.includes("anthropic persona generation is not implemented in this phase")) {
    throw new Error(`Provider CLI path did not stop at the Phase 1 adapter boundary:\n${unsupportedRun.stderr}`);
  }

  const invalidProviderRun = await expectCliFailure([
    "simulate-dataset",
    "--profile",
    "sample-retail-support",
    "--out",
    join(workspace.pathname, "invalid-provider.jsonl"),
    "--simulation-provider",
    "unknown",
  ]);

  if (!invalidProviderRun.stderr.includes("--simulation-provider must be openai, anthropic, or deterministic")) {
    throw new Error(`Unsupported provider name was not rejected by CLI parsing:\n${invalidProviderRun.stderr}`);
  }
}

async function runCli(args, extraEnv = {}) {
  return execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv },
  });
}

async function expectCliFailure(args, extraEnv = {}) {
  try {
    await runCli(args, extraEnv);
  } catch (error) {
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }

  throw new Error(`Expected CLI command to fail: ${args.join(" ")}`);
}
