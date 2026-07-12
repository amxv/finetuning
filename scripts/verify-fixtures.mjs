import {
  assertValidOpenAIFineTuningRow,
  bookAppointmentTool,
  bookAppointmentToolTrajectoryFixture,
  buildOpenAIFineTuningRow,
  checkAvailabilityTool,
  checkAvailabilityToolTrajectoryFixture,
  findBundledScenarioProfile,
  fullToolTrajectoryConversationFixture,
  noToolConversationFixture,
  parseScenarioDefinitionJson,
  receptionistScenarioProfile,
  retailSupportScenarioProfile,
  searchToolTrajectoryFixture,
  toolDecisionConversationFixture,
  toolTrajectoryFixtures,
} from "../dist/core/index.js";
import { loadScenarioSource as loadScenarioSourceFromSimulation } from "../dist/simulation/index.js";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

assertProviderBackedValidationCases();
console.log("Verified provider-backed row validation hardening for schemas, duplicate ids, and multi-tool results.");

const bundledProfiles = [receptionistScenarioProfile, retailSupportScenarioProfile];

for (const profile of bundledProfiles) {
  const parsed = parseScenarioDefinitionJson(JSON.stringify(profile));
  if (parsed.id !== profile.id) {
    throw new Error(`Scenario parser changed profile id ${profile.id} to ${parsed.id}`);
  }

  const loaded = await loadScenarioSourceFromSimulation(profile);
  if (loaded.definition.id !== profile.id) {
    throw new Error(`Scenario loader changed profile id ${profile.id} to ${loaded.definition.id}`);
  }

  if (loaded.personas?.length !== profile.personaSource.personas?.length) {
    throw new Error(`Scenario loader did not expose bundled personas for ${profile.id}`);
  }

  if (profile.personaSource.count < 1 || profile.toolInventory.tools.length < 1) {
    throw new Error(`Scenario profile ${profile.id} is missing persona count or tools`);
  }
}

if (findBundledScenarioProfile("sample-receptionist")?.business.domain !== "healthcare") {
  throw new Error("Bundled receptionist profile lookup failed.");
}

if (findBundledScenarioProfile("sample-retail-support")?.business.domain !== "retail") {
  throw new Error("Bundled retail support profile lookup failed.");
}

if (noToolConversationFixture.business.id !== receptionistScenarioProfile.business.id) {
  throw new Error("Receptionist fixture is not using the receptionist scenario business context.");
}

const memoryFilesystem = {
  async readText(path) {
    if (path !== "scenario.json") {
      throw new Error(`Unexpected scenario path ${path}`);
    }
    return JSON.stringify(retailSupportScenarioProfile);
  },
  async writeText() {},
  async ensureDirectory() {},
};

const loadedFromPath = await loadScenarioSourceFromSimulation({ path: "scenario.json" }, memoryFilesystem);
if (loadedFromPath.definition.id !== retailSupportScenarioProfile.id) {
  throw new Error("Scenario path loading did not parse the supplied scenario file.");
}

console.log(`Verified ${bundledProfiles.length} bundled scenario profiles and custom scenario loading.`);

const forbiddenCoreTerms = ["Cloudflare", "Bindings", "Hono", "D1", "Worker", "queue"];
const coreFiles = await listTypeScriptFiles(new URL("../src/core", import.meta.url));

for (const file of coreFiles) {
  const contents = await readFile(file, "utf8");
  for (const term of forbiddenCoreTerms) {
    if (contents.includes(term)) {
      throw new Error(`Core boundary violation: found ${term} in ${file}`);
    }
  }

  if (contents.includes("process.env")) {
    throw new Error(`Core boundary violation: found process.env in ${file}`);
  }

  if (/\bfrom\s+["'](?:openai(?:\/|["'])|@anthropic-ai\/sdk)/.test(contents)) {
    throw new Error(`Core boundary violation: found provider SDK import in ${file}`);
  }
}

console.log(
  `Verified ${coreFiles.length} core files have no provider SDK, process.env, or backend runtime references.`,
);

async function listTypeScriptFiles(directoryUrl) {
  const directory = fileURLToPath(directoryUrl);
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

function assertProviderBackedValidationCases() {
  const validMultiToolRow = {
    messages: [
      { role: "system", content: "Use tools when needed." },
      { role: "user", content: "Can you check availability and save the appointment?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_multi_availability",
            type: "function",
            function: {
              name: "check_availability",
              arguments: JSON.stringify({ preferredDate: "tomorrow", service: "cleaning" }),
            },
          },
          {
            id: "call_multi_booking",
            type: "function",
            function: {
              name: "book_appointment",
              arguments: JSON.stringify({
                service: "cleaning",
                slotId: "slot_2026_07_07_1500",
                visitorName: "Jordan Lee",
              }),
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_multi_availability",
        name: "check_availability",
        content: JSON.stringify({ available: true }),
      },
      {
        role: "tool",
        tool_call_id: "call_multi_booking",
        name: "book_appointment",
        content: JSON.stringify({ confirmed: true }),
      },
      {
        role: "assistant",
        content: "I found availability and booked the appointment for Jordan Lee.",
      },
    ],
    tools: [checkAvailabilityTool, bookAppointmentTool].map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })),
  };

  assertValidOpenAIFineTuningRow(validMultiToolRow);

  assertValidationError(
    {
      ...validMultiToolRow,
      messages: [
        ...validMultiToolRow.messages.slice(0, 2),
        {
          ...validMultiToolRow.messages[2],
          tool_calls: [
            validMultiToolRow.messages[2].tool_calls[0],
            {
              ...validMultiToolRow.messages[2].tool_calls[1],
              id: "call_multi_availability",
            },
          ],
        },
        ...validMultiToolRow.messages.slice(3),
      ],
    },
    "tool call id must be unique within a row",
  );

  assertValidationError(
    {
      ...validMultiToolRow,
      messages: [
        ...validMultiToolRow.messages.slice(0, 4),
        {
          ...validMultiToolRow.messages[4],
          tool_call_id: "call_multi_availability",
          name: "check_availability",
        },
        validMultiToolRow.messages[5],
      ],
    },
    "tool result must reference each assistant tool call at most once",
  );

  assertValidationError(
    {
      ...validMultiToolRow,
      messages: [
        ...validMultiToolRow.messages.slice(0, 2),
        {
          ...validMultiToolRow.messages[2],
          tool_calls: [
            {
              ...validMultiToolRow.messages[2].tool_calls[0],
              function: {
                ...validMultiToolRow.messages[2].tool_calls[0].function,
                arguments: JSON.stringify({ preferredDate: "tomorrow", service: 42 }),
              },
            },
          ],
        },
      ],
    },
    "value must be a string",
  );

  assertValidationError(
    {
      ...validMultiToolRow,
      messages: [
        ...validMultiToolRow.messages.slice(0, 2),
        {
          ...validMultiToolRow.messages[2],
          tool_calls: [
            {
              ...validMultiToolRow.messages[2].tool_calls[0],
              function: {
                ...validMultiToolRow.messages[2].tool_calls[0].function,
                arguments: JSON.stringify({ preferredDate: "tomorrow", service: "cleaning", extra: true }),
              },
            },
          ],
        },
      ],
    },
    "additional property is not allowed by schema",
  );

  assertValidationError(
    {
      ...validMultiToolRow,
      messages: [
        ...validMultiToolRow.messages.slice(0, 2),
        {
          role: "assistant",
          content: "",
        },
      ],
    },
    "assistant content must be non-empty when no tool calls are present",
  );
}

function assertValidationError(row, messageFragment) {
  try {
    assertValidOpenAIFineTuningRow(row);
  } catch (error) {
    if (error.message.includes(messageFragment)) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected validation error containing "${messageFragment}".`);
}
