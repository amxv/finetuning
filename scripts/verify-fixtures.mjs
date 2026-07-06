import {
  assertValidOpenAIFineTuningRow,
  bookAppointmentToolTrajectoryFixture,
  buildOpenAIFineTuningRow,
  checkAvailabilityToolTrajectoryFixture,
  fullToolTrajectoryConversationFixture,
  noToolConversationFixture,
  searchToolTrajectoryFixture,
  toolDecisionConversationFixture,
  toolTrajectoryFixtures,
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

const namedToolCases = [
  {
    toolName: "search",
    callId: "call_search_1",
    trajectory: searchToolTrajectoryFixture,
  },
  {
    toolName: "book_appointment",
    callId: "call_booking_1",
    trajectory: bookAppointmentToolTrajectoryFixture,
  },
  {
    toolName: "check_availability",
    callId: "call_availability_1",
    trajectory: checkAvailabilityToolTrajectoryFixture,
  },
];

if (toolTrajectoryFixtures.length !== namedToolCases.length) {
  throw new Error(`Expected ${namedToolCases.length} canonical tool fixtures, saw ${toolTrajectoryFixtures.length}`);
}

for (const fixtureCase of namedToolCases) {
  const fullRow = buildOpenAIFineTuningRow(fixtureCase.trajectory, { mode: "full_tool_trajectory" });
  assertValidOpenAIFineTuningRow(fullRow);
  assertFullToolTrajectoryShape(fullRow, fixtureCase.toolName, fixtureCase.callId);

  const decisionRow = buildOpenAIFineTuningRow(fixtureCase.trajectory, { mode: "tool_decision" });
  assertValidOpenAIFineTuningRow(decisionRow);
  assertDecisionOnlyShape(decisionRow, fixtureCase.toolName, fixtureCase.callId);
}

console.log(`Verified full and decision-only exports for ${namedToolCases.length} named tool fixtures.`);

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

function assertFullToolTrajectoryShape(row, toolName, callId) {
  const roles = row.messages.map((message) => message.role).join(",");
  if (roles !== "system,user,assistant,tool,assistant") {
    throw new Error(`${toolName} full trajectory roles were ${roles}`);
  }

  const assistantToolCall = row.messages[2];
  const toolMessage = row.messages[3];
  const finalAssistant = row.messages[4];

  if (assistantToolCall.role !== "assistant" || assistantToolCall.tool_calls?.[0]?.id !== callId) {
    throw new Error(`${toolName} assistant tool call did not use ${callId}`);
  }

  if (assistantToolCall.tool_calls[0].function.name !== toolName) {
    throw new Error(`${toolName} assistant tool call used ${assistantToolCall.tool_calls[0].function.name}`);
  }

  if (toolMessage.role !== "tool" || toolMessage.tool_call_id !== callId || toolMessage.name !== toolName) {
    throw new Error(`${toolName} tool result did not reference ${callId}`);
  }

  const parsedToolResult = JSON.parse(toolMessage.content);
  if (!parsedToolResult || typeof parsedToolResult !== "object" || Array.isArray(parsedToolResult)) {
    throw new Error(`${toolName} tool result was not normalized JSON object content`);
  }

  if (finalAssistant.role !== "assistant" || typeof finalAssistant.content !== "string" || !finalAssistant.content) {
    throw new Error(`${toolName} final assistant response was missing`);
  }
}

function assertDecisionOnlyShape(row, toolName, callId) {
  const roles = row.messages.map((message) => message.role).join(",");
  if (roles !== "system,user,assistant") {
    throw new Error(`${toolName} decision-only roles were ${roles}`);
  }

  const assistantToolCall = row.messages[2];
  if (assistantToolCall.role !== "assistant" || assistantToolCall.tool_calls?.[0]?.id !== callId) {
    throw new Error(`${toolName} decision-only export did not stop at ${callId}`);
  }

  if (assistantToolCall.tool_calls[0].function.name !== toolName) {
    throw new Error(`${toolName} decision-only export used ${assistantToolCall.tool_calls[0].function.name}`);
  }
}
