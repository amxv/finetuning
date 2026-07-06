import {
  assertValidOpenAIFineTuningRow,
  buildOpenAIFineTuningRow,
  fullToolTrajectoryConversationFixture,
  noToolConversationFixture,
  toolDecisionConversationFixture,
} from "../dist/index.js";

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
