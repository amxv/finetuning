import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { retailSupportScenarioProfile } from "../dist/core/index.js";

const execFileAsync = promisify(execFile);
const workspace = fileURLToPath(new URL("../tmp/cli-verify/", import.meta.url));
const cliPath = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));

await rm(workspace, { recursive: true, force: true });
await mkdir(workspace, { recursive: true });

const configPath = join(workspace, "retail-scenario.json");
const personasPath = join(workspace, "personas.json");
const datasetPath = join(workspace, "dataset.jsonl");
const malformedPath = join(workspace, "malformed.jsonl");
const unsupportedRolePath = join(workspace, "unsupported-role.jsonl");
const providerConfigPath = join(workspace, "provider-config.json");
const toolkitConfigPath = join(workspace, "toolkit-config.json");

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

await writeFile(
  providerConfigPath,
  `${JSON.stringify(
    {
      providers: {
        persona: {
          provider: "anthropic",
          model: "claude-persona-test",
          apiKeyEnv: "PHASE6_PERSONA_KEY",
        },
        simulation: {
          provider: "openai",
          model: "gpt-simulation-test",
          apiKeyEnv: "PHASE6_SIMULATION_KEY",
        },
        translation: {
          provider: "openai",
          model: "gpt-translation-test",
          apiKeyEnv: "PHASE6_TRANSLATION_KEY",
        },
      },
    },
    null,
    2,
  )}\n`,
);

const configSimulationRun = await expectCliFailure([
  "simulate-dataset",
  "--profile",
  "sample-retail-support",
  "--provider-config",
  providerConfigPath,
  "--out",
  join(workspace, "provider-config-simulation.jsonl"),
  "--limit",
  "1",
]);

if (!configSimulationRun.stderr.includes("Missing PHASE6_SIMULATION_KEY for openai provider")) {
  throw new Error(`provider-config simulation path did not use configured env var:\n${configSimulationRun.stderr}`);
}

const overrideSimulationRun = await expectCliFailure([
  "simulate-dataset",
  "--profile",
  "sample-retail-support",
  "--provider-config",
  providerConfigPath,
  "--out",
  join(workspace, "provider-config-override.jsonl"),
  "--limit",
  "1",
  "--simulation-api-key-env",
  "PHASE6_OVERRIDE_KEY",
]);

if (!overrideSimulationRun.stderr.includes("Missing PHASE6_OVERRIDE_KEY for openai provider")) {
  throw new Error(`CLI simulation flag did not override provider-config env var:\n${overrideSimulationRun.stderr}`);
}

const configPersonaRun = await expectCliFailure([
  "generate-personas",
  "--profile",
  "sample-retail-support",
  "--provider-config",
  providerConfigPath,
  "--out",
  join(workspace, "provider-config-personas.json"),
]);

if (!configPersonaRun.stderr.includes("Missing PHASE6_PERSONA_KEY for anthropic provider")) {
  throw new Error(`provider-config persona path did not use configured provider/env:\n${configPersonaRun.stderr}`);
}

await writeFile(
  toolkitConfigPath,
  `${JSON.stringify(
    {
      scenario: "sample-retail-support",
      providers: {
        simulation: {
          provider: "anthropic",
          model: "claude-toolkit-simulation-test",
          apiKeyEnv: "PHASE6_TOOLKIT_SIMULATION_KEY",
        },
      },
    },
    null,
    2,
  )}\n`,
);

const toolkitConfigRun = await expectCliFailure([
  "simulate-dataset",
  "--config",
  toolkitConfigPath,
  "--out",
  join(workspace, "toolkit-config-simulation.jsonl"),
  "--limit",
  "1",
]);

if (!toolkitConfigRun.stderr.includes("Missing PHASE6_TOOLKIT_SIMULATION_KEY for anthropic provider")) {
  throw new Error(`toolkit --config path did not use configured provider/env:\n${toolkitConfigRun.stderr}`);
}

const helpRun = await runCli(["translate-dataset", "--help"]);
if (
  !helpRun.stdout.includes("Default: --strategy local-pseudo, no API key required.") ||
  !helpRun.stdout.includes("Default env vars: OPENAI_API_KEY for openai, ANTHROPIC_API_KEY for anthropic.")
) {
  throw new Error(`translate-dataset help did not document offline defaults and provider env vars:\n${helpRun.stdout}`);
}

const validationRun = await runCli(["validate-dataset", datasetPath]);
if (!validationRun.stdout.includes("Dataset is valid.") || !validationRun.stdout.includes("Rows: 2")) {
  throw new Error(`validate-dataset did not validate generated dataset:\n${validationRun.stdout}`);
}

await writeFile(
  malformedPath,
  '{"messages":[{"role":"assistant","content":null,"tool_calls":[{"id":"bad","type":"function","function":{"name":"lookup","arguments":"not json"}}]}]}\n',
);
const malformedRun = await expectCliFailure(["validate-dataset", malformedPath]);
if (!malformedRun.stderr.includes("Validation errors")) {
  throw new Error(`validate-dataset did not report malformed row errors:\n${malformedRun.stderr}`);
}

await writeFile(unsupportedRolePath, '{"messages":[{"role":"developer","content":"x"}]}\n');
const unsupportedRoleRun = await expectCliFailure(["validate-dataset", unsupportedRolePath]);
if (
  !unsupportedRoleRun.stderr.includes("messages[0].role") ||
  !unsupportedRoleRun.stderr.includes("message role must be one of system, user, assistant, or tool")
) {
  throw new Error(`validate-dataset did not report unsupported role errors:\n${unsupportedRoleRun.stderr}`);
}

await rm(workspace, { recursive: true, force: true });
console.log(
  "Verified CLI workflows, provider config parsing, flag overrides, help text, overwrite safety, and invalid validation.",
);

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
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }

  throw new Error(`Expected CLI command to fail: ${args.join(" ")}`);
}
