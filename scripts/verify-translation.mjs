import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  assertValidOpenAIFineTuningRow,
  buildOpenAIFineTuningRow,
  checkAvailabilityToolTrajectoryFixture,
  createProviderTranslationAdapter,
  ProviderResponseError,
  serializeOpenAIJsonlRows,
  translateOpenAIFineTuningRow,
  validateOpenAIJsonl,
} from "../dist/index.js";

const execFileAsync = promisify(execFile);
const workspace = fileURLToPath(new URL("../tmp/translation-verify/", import.meta.url));
const cliPath = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));

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

const fakeProviderAdapter = createProviderTranslationAdapter(
  {
    async invoke(request) {
      if (request.metadata?.requestPath !== "provider-adapter") {
        throw new Error(`Provider translation request path was not passed in metadata: ${JSON.stringify(request)}`);
      }

      return {
        kind: "text",
        content: `[provider:${request.model}:${request.metadata.targetLocale}:${request.metadata.translationFieldPath}]`,
      };
    },
  },
  "openai",
  "translation-test-model",
);

const providerTranslated = await translateOpenAIFineTuningRow(row, {
  sourceLocale: "en-US",
  targetLocale: "de-DE",
  adapter: fakeProviderAdapter,
});

assertValidOpenAIFineTuningRow(providerTranslated.row);

if (
  providerTranslated.provider !== "openai" ||
  providerTranslated.requestPath !== "provider-adapter" ||
  providerTranslated.row.metadata?.translationProvider !== "openai" ||
  providerTranslated.row.metadata?.translationRequestPath !== "provider-adapter" ||
  providerTranslated.row.metadata?.translationModel !== "translation-test-model" ||
  providerTranslated.row.metadata?.sourceLocale !== "en-US" ||
  providerTranslated.row.metadata?.targetLocale !== "de-DE"
) {
  throw new Error(`Provider translation metadata was incomplete: ${JSON.stringify(providerTranslated.row.metadata)}`);
}

assertDeepEqual(
  providerTranslated.row.messages[2].tool_calls,
  originalAssistantToolCall.tool_calls,
  "provider assistant tool calls",
);
assertDeepEqual(providerTranslated.row.messages[3], originalToolResult, "provider tool result message");
assertDeepEqual(providerTranslated.row.tools, row.tools, "provider row tools");

const malformedProviderAdapter = createProviderTranslationAdapter(
  {
    async invoke() {
      return { kind: "text", content: "" };
    },
  },
  "anthropic",
  "malformed-translation-model",
);

let malformedProviderFailed = false;
try {
  await translateOpenAIFineTuningRow(row, {
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    adapter: malformedProviderAdapter,
  });
} catch (error) {
  if (!(error instanceof ProviderResponseError) || !error.message.includes("returned empty text")) {
    throw error;
  }
  malformedProviderFailed = true;
}

if (!malformedProviderFailed) {
  throw new Error("Malformed provider translation output did not fail.");
}

const sourcePath = join(workspace, "source.jsonl");
const outPath = join(workspace, "translated.jsonl");
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

const missingModelRun = await expectCliFailure([
  "translate-dataset",
  sourcePath,
  "--target-locale",
  "es-ES",
  "--out",
  join(workspace, "provider-missing-model.jsonl"),
  "--strategy",
  "openai",
]);

if (!missingModelRun.stderr.includes("Missing required --translation-model <model> for openai provider.")) {
  throw new Error(`translate-dataset did not reject provider strategy without a model:\n${missingModelRun.stderr}`);
}

const missingKeyRun = await expectCliFailure([
  "translate-dataset",
  sourcePath,
  "--target-locale",
  "es-ES",
  "--out",
  join(workspace, "provider-missing-key.jsonl"),
  "--strategy",
  "anthropic",
  "--translation-model",
  "claude-translation-test",
]);

if (!missingKeyRun.stderr.includes("Missing ANTHROPIC_API_KEY for anthropic provider")) {
  throw new Error(`translate-dataset did not use the default Anthropic API key env:\n${missingKeyRun.stderr}`);
}

await rm(workspace, { recursive: true, force: true });
console.log(
  "Verified experimental translation preserves schema, provider adapters, CLI config validation, and valid JSONL.",
);

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label} changed during translation.\nExpected: ${expectedJson}\nActual: ${actualJson}`);
  }
}

async function expectCliFailure(args) {
  try {
    await execFileAsync(process.execPath, [cliPath, ...args]);
  } catch (error) {
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }

  throw new Error(`Expected CLI command to fail: ${args.join(" ")}`);
}
