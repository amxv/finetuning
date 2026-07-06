import {
  assertValidOpenAIFineTuningRow,
  buildOpenAIFineTuningRow,
  createDeterministicSimulationRunner,
  createModelBackedSimulationRunner,
  loadScenarioSource,
  ProviderResponseError,
  ProviderToolCallError,
  retailSupportScenarioProfile,
} from "../dist/index.js";

const scenario = await loadScenarioSource(retailSupportScenarioProfile);

await assertDeterministicRunnerParity();
await assertFakeModelTextOnly();
await assertFakeModelToolCallFlow();
await assertFakeModelMultipleToolCallFlow();
await assertToolDecisionStopsAtAssistantToolCall();
await assertUnknownToolRejected();
await assertMalformedArgumentsRejected();
await assertMissingRequiredArgumentRejected();
await assertDuplicateToolCallIdRejected();
await assertMismatchedToolResultRejected();
await assertEmptyFinalAssistantRejected();

console.log("Verified deterministic and model-backed simulation runners, tool flow, mode behavior, and provider validation.");

async function assertDeterministicRunnerParity() {
  const runner = createDeterministicSimulationRunner();
  const trajectories = await runner.run({
    scenario,
    outputDirectory: "unused",
    limit: 2,
    mode: "full_tool_trajectory",
  });

  if (trajectories.length !== 2) {
    throw new Error(`Deterministic runner wrote ${trajectories.length} trajectories instead of 2.`);
  }

  const row = buildOpenAIFineTuningRow(trajectories[0], { mode: "full_tool_trajectory" });
  assertValidOpenAIFineTuningRow(row);
  assertRoles(row, "system,user,assistant,tool,assistant");

  if (
    trajectories[0].metadata?.simulationProvider !== "deterministic" ||
    trajectories[0].metadata?.simulationPath !== "deterministic" ||
    trajectories[0].metadata?.toolResultProvider !== "deterministic"
  ) {
    throw new Error(`Deterministic metadata was missing: ${JSON.stringify(trajectories[0].metadata)}`);
  }
}

async function assertFakeModelTextOnly() {
  const calls = [];
  const runner = createModelBackedSimulationRunner({
    provider: "openai",
    model: "fake-text-model",
    modelClient: {
      async invoke(request) {
        calls.push(request);
        return { kind: "text", content: "I can help compare those backpacks." };
      },
    },
  });

  const [trajectory] = await runner.run({
    scenario,
    outputDirectory: "unused",
    limit: 1,
    mode: "plain_chat",
  });

  if (calls.length !== 1 || calls[0].tools !== undefined) {
    throw new Error(`Plain-chat text simulation should call once without tools: ${JSON.stringify(calls)}`);
  }

  const row = buildOpenAIFineTuningRow(trajectory, { mode: "plain_chat" });
  assertValidOpenAIFineTuningRow(row);
  assertRoles(row, "system,user,assistant");

  if (
    trajectory.metadata?.simulationProvider !== "openai" ||
    trajectory.metadata?.simulationModel !== "fake-text-model" ||
    trajectory.metadata?.simulationPath !== "model-text" ||
    trajectory.metadata?.toolResultProvider !== "none"
  ) {
    throw new Error(`Text-only model metadata was missing: ${JSON.stringify(trajectory.metadata)}`);
  }
}

async function assertFakeModelToolCallFlow() {
  const calls = [];
  const runner = createModelBackedSimulationRunner({
    provider: "anthropic",
    model: "fake-tool-model",
    modelClient: {
      async invoke(request) {
        calls.push(request);
        if (calls.length === 1) {
          return {
            kind: "tool_calls",
            toolCalls: [
              {
                id: "tool_call_1",
                name: "lookup_order",
                arguments: { orderId: "order_123" },
              },
            ],
            content: "I'll look up the order.",
          };
        }

        return { kind: "text", content: "The order is eligible for return within the 30-day window." };
      },
    },
    toolResultProvider: {
      source: "caller",
      async getToolResult(request) {
        return {
          toolCallId: request.toolCall.id,
          name: request.toolCall.name,
          payloadFormat: "normalized_json",
          result: {
            orderId: request.toolCall.arguments.orderId,
            returnEligible: true,
          },
        };
      },
    },
  });

  const [trajectory] = await runner.run({
    scenario,
    outputDirectory: "unused",
    limit: 1,
    mode: "full_tool_trajectory",
  });

  if (calls.length !== 2 || calls[0].tools?.length !== 2) {
    throw new Error(`Tool-call simulation should call initial and final model requests: ${JSON.stringify(calls)}`);
  }

  assertFinalRequestIncludesAssistantToolHistory(calls[1]);

  const row = buildOpenAIFineTuningRow(trajectory, { mode: "full_tool_trajectory" });
  assertValidOpenAIFineTuningRow(row);
  assertRoles(row, "system,user,assistant,tool,assistant");

  if (
    trajectory.metadata?.simulationProvider !== "anthropic" ||
    trajectory.metadata?.simulationModel !== "fake-tool-model" ||
    trajectory.metadata?.simulationPath !== "model-tool-trajectory" ||
    trajectory.metadata?.toolResultProvider !== "caller"
  ) {
    throw new Error(`Tool-flow model metadata was missing: ${JSON.stringify(trajectory.metadata)}`);
  }
}

async function assertFakeModelMultipleToolCallFlow() {
  const calls = [];
  const runner = createModelBackedSimulationRunner({
    provider: "anthropic",
    model: "fake-multi-tool-model",
    modelClient: {
      async invoke(request) {
        calls.push(request);
        if (calls.length === 1) {
          return {
            kind: "tool_calls",
            toolCalls: [
              {
                id: "tool_call_product",
                name: "lookup_product",
                arguments: { productName: "day pack" },
              },
              {
                id: "tool_call_order",
                name: "lookup_order",
                arguments: { orderId: "order_123" },
              },
            ],
          };
        }

        return { kind: "text", content: "I checked the product and order details." };
      },
    },
  });

  const [trajectory] = await runner.run({
    scenario,
    outputDirectory: "unused",
    limit: 1,
    mode: "full_tool_trajectory",
  });

  const row = buildOpenAIFineTuningRow(trajectory, { mode: "full_tool_trajectory" });
  assertValidOpenAIFineTuningRow(row);
  assertRoles(row, "system,user,assistant,tool,tool,assistant");

  if (row.messages[2].tool_calls?.length !== 2 || row.messages.filter((message) => message.role === "tool").length !== 2) {
    throw new Error(`Multi-tool provider flow did not preserve two calls and two results: ${JSON.stringify(row)}`);
  }
}

async function assertToolDecisionStopsAtAssistantToolCall() {
  const calls = [];
  const runner = createModelBackedSimulationRunner({
    provider: "openai",
    model: "fake-decision-model",
    modelClient: {
      async invoke(request) {
        calls.push(request);
        return {
          kind: "tool_calls",
          toolCalls: [
            {
              id: "tool_call_decision",
              name: "lookup_product",
              arguments: { productName: "day pack" },
            },
          ],
        };
      },
    },
  });

  const [trajectory] = await runner.run({
    scenario,
    outputDirectory: "unused",
    limit: 1,
    mode: "tool_decision",
  });

  if (calls.length !== 1) {
    throw new Error(`Tool-decision mode should not request final assistant text; saw ${calls.length} calls.`);
  }

  const row = buildOpenAIFineTuningRow(trajectory, { mode: "tool_decision" });
  assertValidOpenAIFineTuningRow(row);
  assertRoles(row, "system,user,assistant");

  if (trajectory.messages.length !== 3 || trajectory.messages[2]?.kind !== "assistant_tool_call") {
    throw new Error(`Tool-decision trajectory did not stop at assistant tool call: ${JSON.stringify(trajectory.messages)}`);
  }
}

async function assertUnknownToolRejected() {
  const runner = createFailingToolCallRunner({
    id: "tool_call_unknown",
    name: "not_a_tool",
    arguments: {},
  });

  await expectFailure(
    () => runner.run({ scenario, outputDirectory: "unused", limit: 1, mode: "full_tool_trajectory" }),
    ProviderToolCallError,
    "Unknown tool call: not_a_tool",
  );
}

async function assertMalformedArgumentsRejected() {
  const runner = createFailingToolCallRunner({
    id: "tool_call_bad_args",
    name: "lookup_order",
    arguments: [],
  });

  await expectFailure(
    () => runner.run({ scenario, outputDirectory: "unused", limit: 1, mode: "full_tool_trajectory" }),
    ProviderToolCallError,
    "arguments must be a JSON object",
  );
}

async function assertMissingRequiredArgumentRejected() {
  const runner = createFailingToolCallRunner({
    id: "tool_call_missing_required",
    name: "lookup_order",
    arguments: {},
  });

  await expectFailure(
    () => runner.run({ scenario, outputDirectory: "unused", limit: 1, mode: "full_tool_trajectory" }),
    ProviderToolCallError,
    "missing required argument orderId",
  );
}

async function assertDuplicateToolCallIdRejected() {
  const runner = createModelBackedSimulationRunner({
    provider: "openai",
    model: "fake-duplicate-tool-id-model",
    modelClient: {
      async invoke() {
        return {
          kind: "tool_calls",
          toolCalls: [
            {
              id: "tool_call_duplicate",
              name: "lookup_product",
              arguments: { productName: "day pack" },
            },
            {
              id: "tool_call_duplicate",
              name: "lookup_order",
              arguments: { orderId: "order_123" },
            },
          ],
        };
      },
    },
  });

  await expectFailure(
    () => runner.run({ scenario, outputDirectory: "unused", limit: 1, mode: "full_tool_trajectory" }),
    ProviderToolCallError,
    "Duplicate tool call id: tool_call_duplicate",
  );
}

async function assertMismatchedToolResultRejected() {
  const runner = createModelBackedSimulationRunner({
    provider: "openai",
    model: "fake-mismatched-tool-result-model",
    modelClient: {
      async invoke() {
        return {
          kind: "tool_calls",
          toolCalls: [
            {
              id: "tool_call_result_mismatch",
              name: "lookup_product",
              arguments: { productName: "day pack" },
            },
          ],
        };
      },
    },
    toolResultProvider: {
      source: "caller",
      async getToolResult() {
        return {
          toolCallId: "different_call_id",
          name: "lookup_product",
          payloadFormat: "normalized_json",
          result: {},
        };
      },
    },
  });

  await expectFailure(
    () => runner.run({ scenario, outputDirectory: "unused", limit: 1, mode: "full_tool_trajectory" }),
    ProviderToolCallError,
    "did not match tool call",
  );
}

async function assertEmptyFinalAssistantRejected() {
  const calls = [];
  const runner = createModelBackedSimulationRunner({
    provider: "openai",
    model: "fake-empty-final-model",
    modelClient: {
      async invoke(request) {
        calls.push(request);
        if (calls.length === 1) {
          return {
            kind: "tool_calls",
            toolCalls: [
              {
                id: "tool_call_empty_final",
                name: "lookup_product",
                arguments: { productName: "trail shoes" },
              },
            ],
          };
        }

        return { kind: "text", content: "   " };
      },
    },
  });

  await expectFailure(
    () => runner.run({ scenario, outputDirectory: "unused", limit: 1, mode: "full_tool_trajectory" }),
    ProviderResponseError,
    "Empty final assistant response.",
  );
}

function createFailingToolCallRunner(toolCall) {
  return createModelBackedSimulationRunner({
    provider: "openai",
    model: "fake-invalid-tool-model",
    modelClient: {
      async invoke() {
        return {
          kind: "tool_calls",
          toolCalls: [toolCall],
        };
      },
    },
  });
}

async function expectFailure(action, ErrorClass, messageFragment) {
  try {
    await action();
  } catch (error) {
    if (error instanceof ErrorClass && error.message.includes(messageFragment)) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected ${ErrorClass.name} containing "${messageFragment}".`);
}

function assertRoles(row, expected) {
  const roles = row.messages.map((message) => message.role).join(",");
  if (roles !== expected) {
    throw new Error(`Expected roles ${expected}, saw ${roles}`);
  }
}

function assertFinalRequestIncludesAssistantToolHistory(request) {
  const assistantToolCallIndex = request.messages.findIndex(
    (message) => message.role === "assistant" && message.toolCalls?.length > 0,
  );
  const toolResultIndex = request.messages.findIndex((message) => message.role === "tool");

  if (assistantToolCallIndex < 0 || toolResultIndex < 0 || assistantToolCallIndex > toolResultIndex) {
    throw new Error(`Final model request did not preserve assistant tool-call history before tool results: ${JSON.stringify(request.messages)}`);
  }

  const assistantMessage = request.messages[assistantToolCallIndex];
  const toolMessage = request.messages[toolResultIndex];
  if (
    assistantMessage.content !== "I'll look up the order." ||
    assistantMessage.toolCalls[0]?.id !== "tool_call_1" ||
    assistantMessage.toolCalls[0]?.name !== "lookup_order" ||
    assistantMessage.toolCalls[0]?.arguments.orderId !== "order_123" ||
    toolMessage.toolCallId !== "tool_call_1"
  ) {
    throw new Error(`Final model request tool history was malformed: ${JSON.stringify(request.messages)}`);
  }
}
