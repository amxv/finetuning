import {
  assertValidOpenAIFineTuningRow,
  buildOpenAIFineTuningRow,
  fullToolTrajectoryConversationFixture,
  noToolConversationFixture,
  toolDecisionConversationFixture,
} from "../dist/core/index.js";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const cases = [
  {
    name: "plain chat",
    mode: "plain_chat",
    trajectory: noToolConversationFixture,
    expectedToolCalls: 0,
    expectedToolResults: 0,
  },
  {
    name: "tool decision",
    mode: "tool_decision",
    trajectory: toolDecisionConversationFixture,
    expectedToolCalls: 1,
    expectedToolResults: 0,
  },
  {
    name: "full tool trajectory",
    mode: "full_tool_trajectory",
    trajectory: fullToolTrajectoryConversationFixture,
    expectedToolCalls: 1,
    expectedToolResults: 1,
  },
];

for (const fixtureCase of cases) {
  const row = buildOpenAIFineTuningRow(fixtureCase.trajectory, { mode: fixtureCase.mode });
  assertValidOpenAIFineTuningRow(row);

  const toolCallCount = row.messages.reduce(
    (count, message) => count + (message.role === "assistant" ? (message.tool_calls?.length ?? 0) : 0),
    0,
  );
  const toolResultCount = row.messages.filter((message) => message.role === "tool").length;

  if (toolCallCount !== fixtureCase.expectedToolCalls) {
    throw new Error(`${fixtureCase.name} expected ${fixtureCase.expectedToolCalls} tool calls, saw ${toolCallCount}`);
  }

  if (toolResultCount !== fixtureCase.expectedToolResults) {
    throw new Error(
      `${fixtureCase.name} expected ${fixtureCase.expectedToolResults} tool results, saw ${toolResultCount}`,
    );
  }
}

console.log(`Verified ${cases.length} representative trajectory fixtures.`);

const forbiddenCoreTerms = ["Cloudflare", "Bindings", "Hono", "D1", "Worker", "queue"];
const coreFiles = await listTypeScriptFiles(new URL("../src/core", import.meta.url));

for (const file of coreFiles) {
  const contents = await readFile(file, "utf8");
  for (const term of forbiddenCoreTerms) {
    if (contents.includes(term)) {
      throw new Error(`Core boundary violation: found ${term} in ${file}`);
    }
  }
}

console.log(`Verified ${coreFiles.length} core files have no backend runtime references.`);

async function listTypeScriptFiles(directoryUrl) {
  const directory = directoryUrl.pathname;
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(new URL(`${entry.name}/`, directoryUrl))));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
}
