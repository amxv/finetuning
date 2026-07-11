import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ProviderToolCallError,
  ProviderUnsupportedFeatureError,
  checkAvailabilityTool,
  createProviderAdapter,
  mapAnthropicMessagesResponse,
  mapModelRequestToAnthropicMessagesRequest,
  mapModelRequestToOpenAIResponsesRequest,
  mapOpenAIResponsesResponse,
} from "../dist/index.js";

const request = {
  provider: "openai",
  model: "provider-test-model",
  messages: [
    { role: "system", content: "Use tools when needed." },
    { role: "user", content: "Can I book a cleaning tomorrow?" },
  ],
  tools: [checkAvailabilityTool],
  temperature: 0.2,
};

assertOpenAIRequestMapper();
assertOpenAIHistoricalToolCallRequestMapper();
assertOpenAITextResponseMapper();
assertOpenAIToolResponseMapper();
assertOpenAIMalformedToolArguments();
assertAnthropicRequestMapper();
assertAnthropicHistoricalToolCallRequestMapper();
assertAnthropicParallelToolResultRequestMapper();
assertAnthropicTextResponseMapper();
assertAnthropicToolResponseMapper();
assertAnthropicMalformedToolUseInput();
assertFactoryBehavior();
await assertProviderSdkImportBoundary();

console.log("Verified provider adapter mappers, malformed tool arguments, factories, and SDK import boundaries.");

function assertOpenAIRequestMapper() {
  const mapped = mapModelRequestToOpenAIResponsesRequest(request, 512);

  if (mapped.model !== request.model || mapped.max_output_tokens !== 512 || mapped.temperature !== 0.2) {
    throw new Error(`OpenAI request options were not preserved: ${JSON.stringify(mapped)}`);
  }

  const tool = mapped.tools?.[0];
  if (
    !tool ||
    tool.type !== "function" ||
    tool.name !== checkAvailabilityTool.name ||
    tool.parameters.required?.[0] !== checkAvailabilityTool.parameters.required?.[0]
  ) {
    throw new Error(`OpenAI tool mapping lost schema details: ${JSON.stringify(tool)}`);
  }
}

function assertOpenAIHistoricalToolCallRequestMapper() {
  const mapped = mapModelRequestToOpenAIResponsesRequest({
    provider: "openai",
    model: "provider-test-model",
    messages: [
      { role: "user", content: "Can I book a cleaning tomorrow?" },
      {
        role: "assistant",
        content: "I'll check availability.",
        toolCalls: [
          {
            id: "call_1",
            name: "check_availability",
            arguments: { preferredDate: "tomorrow", service: "cleaning" },
          },
        ],
      },
      { role: "tool", toolCallId: "call_1", name: "check_availability", content: '{"available":true}' },
    ],
  });

  const functionCallIndex = mapped.input.findIndex((item) => item.type === "function_call");
  const outputIndex = mapped.input.findIndex((item) => item.type === "function_call_output");
  const functionCall = mapped.input[functionCallIndex];
  const output = mapped.input[outputIndex];

  if (
    functionCallIndex < 0 ||
    outputIndex < 0 ||
    functionCallIndex > outputIndex ||
    functionCall.type !== "function_call" ||
    functionCall.call_id !== "call_1" ||
    functionCall.name !== "check_availability" ||
    functionCall.arguments !== '{"preferredDate":"tomorrow","service":"cleaning"}' ||
    output.type !== "function_call_output" ||
    output.call_id !== "call_1"
  ) {
    throw new Error(`OpenAI historical tool-call request mapping was invalid: ${JSON.stringify(mapped.input)}`);
  }
}

function assertOpenAITextResponseMapper() {
  const mapped = mapOpenAIResponsesResponse(
    {
      id: "resp_text_1",
      model: "gpt-test",
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "I can help with that." }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 6 },
    },
    { provider: "openai", model: "gpt-test" },
  );

  if (mapped.kind !== "text" || mapped.content !== "I can help with that.") {
    throw new Error(`OpenAI text response did not map correctly: ${JSON.stringify(mapped)}`);
  }

  if (mapped.metadata?.provider !== "openai" || mapped.metadata?.responseId !== "resp_text_1") {
    throw new Error(`OpenAI metadata was not captured: ${JSON.stringify(mapped.metadata)}`);
  }
}

function assertOpenAIToolResponseMapper() {
  const mapped = mapOpenAIResponsesResponse(
    {
      id: "resp_tool_1",
      model: "gpt-test",
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "I'll check availability." }],
        },
        {
          type: "function_call",
          id: "fc_1",
          call_id: "call_1",
          name: "check_availability",
          arguments: '{"preferredDate":"tomorrow","service":"cleaning"}',
        },
      ],
    },
    { provider: "openai", model: "gpt-test" },
  );

  if (
    mapped.kind !== "tool_calls" ||
    mapped.content !== "I'll check availability." ||
    mapped.toolCalls[0]?.id !== "call_1" ||
    mapped.toolCalls[0]?.arguments.preferredDate !== "tomorrow"
  ) {
    throw new Error(`OpenAI tool response did not map correctly: ${JSON.stringify(mapped)}`);
  }
}

function assertOpenAIMalformedToolArguments() {
  try {
    mapOpenAIResponsesResponse(
      {
        output: [
          {
            type: "function_call",
            id: "fc_bad",
            call_id: "call_bad",
            name: "check_availability",
            arguments: '{"preferredDate":',
          },
        ],
      },
      { provider: "openai", model: "gpt-test" },
    );
  } catch (error) {
    if (error instanceof ProviderToolCallError) {
      return;
    }

    throw error;
  }

  throw new Error("OpenAI malformed tool arguments did not fail.");
}

function assertAnthropicRequestMapper() {
  const mapped = mapModelRequestToAnthropicMessagesRequest(
    {
      ...request,
      provider: "anthropic",
    },
    768,
  );

  if (mapped.model !== request.model || mapped.max_tokens !== 768 || mapped.system !== "Use tools when needed.") {
    throw new Error(`Anthropic request options were not preserved: ${JSON.stringify(mapped)}`);
  }

  const tool = mapped.tools?.[0];
  if (
    !tool ||
    tool.name !== checkAvailabilityTool.name ||
    tool.input_schema.required?.[0] !== checkAvailabilityTool.parameters.required?.[0]
  ) {
    throw new Error(`Anthropic tool mapping lost schema details: ${JSON.stringify(tool)}`);
  }
}

function assertAnthropicHistoricalToolCallRequestMapper() {
  const mapped = mapModelRequestToAnthropicMessagesRequest({
    provider: "anthropic",
    model: "provider-test-model",
    messages: [
      { role: "system", content: "Use tools when needed." },
      { role: "user", content: "Can I book a cleaning tomorrow?" },
      {
        role: "assistant",
        content: "I'll check availability.",
        toolCalls: [
          {
            id: "toolu_1",
            name: "check_availability",
            arguments: { preferredDate: "tomorrow", service: "cleaning" },
          },
        ],
      },
      { role: "tool", toolCallId: "toolu_1", name: "check_availability", content: '{"available":true}' },
    ],
  });

  const assistantIndex = mapped.messages.findIndex((message) => message.role === "assistant");
  const toolResultIndex = mapped.messages.findIndex(
    (message) =>
      message.role === "user" && Array.isArray(message.content) && message.content[0]?.type === "tool_result",
  );
  const assistant = mapped.messages[assistantIndex];
  const toolResult = mapped.messages[toolResultIndex];

  if (
    assistantIndex < 0 ||
    toolResultIndex < 0 ||
    assistantIndex > toolResultIndex ||
    !Array.isArray(assistant.content) ||
    assistant.content[0]?.type !== "text" ||
    assistant.content[0]?.text !== "I'll check availability." ||
    assistant.content[1]?.type !== "tool_use" ||
    assistant.content[1]?.id !== "toolu_1" ||
    assistant.content[1]?.name !== "check_availability" ||
    assistant.content[1]?.input?.preferredDate !== "tomorrow" ||
    !Array.isArray(toolResult.content) ||
    toolResult.content[0]?.type !== "tool_result" ||
    toolResult.content[0]?.tool_use_id !== "toolu_1"
  ) {
    throw new Error(`Anthropic historical tool-call request mapping was invalid: ${JSON.stringify(mapped.messages)}`);
  }
}

function assertAnthropicParallelToolResultRequestMapper() {
  const mapped = mapModelRequestToAnthropicMessagesRequest({
    provider: "anthropic",
    model: "provider-test-model",
    messages: [
      { role: "user", content: "Check the product and order." },
      {
        role: "assistant",
        content: "I'll check both.",
        toolCalls: [
          {
            id: "toolu_product",
            name: "lookup_product",
            arguments: { productName: "day pack" },
          },
          {
            id: "toolu_order",
            name: "lookup_order",
            arguments: { orderId: "order_123" },
          },
        ],
      },
      { role: "tool", toolCallId: "toolu_product", name: "lookup_product", content: '{"inStock":true}' },
      { role: "tool", toolCallId: "toolu_order", name: "lookup_order", content: '{"returnEligible":true}' },
    ],
  });

  const assistantIndex = mapped.messages.findIndex((message) => message.role === "assistant");
  const toolResultMessages = mapped.messages.filter(
    (message) =>
      message.role === "user" && Array.isArray(message.content) && message.content[0]?.type === "tool_result",
  );
  const assistant = mapped.messages[assistantIndex];
  const toolResult = toolResultMessages[0];

  if (
    assistantIndex < 0 ||
    toolResultMessages.length !== 1 ||
    mapped.messages[assistantIndex + 1] !== toolResult ||
    !Array.isArray(assistant.content) ||
    assistant.content.filter((block) => block.type === "tool_use").length !== 2 ||
    !Array.isArray(toolResult.content) ||
    toolResult.content.length !== 2 ||
    toolResult.content[0]?.type !== "tool_result" ||
    toolResult.content[0]?.tool_use_id !== "toolu_product" ||
    toolResult.content[1]?.type !== "tool_result" ||
    toolResult.content[1]?.tool_use_id !== "toolu_order"
  ) {
    throw new Error(`Anthropic parallel tool-result request mapping was invalid: ${JSON.stringify(mapped.messages)}`);
  }
}

function assertAnthropicTextResponseMapper() {
  const mapped = mapAnthropicMessagesResponse(
    {
      id: "msg_text_1",
      model: "claude-test",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "I can help with that." }],
      usage: { input_tokens: 10, output_tokens: 6 },
      _request_id: "req_1",
    },
    { provider: "anthropic", model: "claude-test" },
  );

  if (mapped.kind !== "text" || mapped.content !== "I can help with that.") {
    throw new Error(`Anthropic text response did not map correctly: ${JSON.stringify(mapped)}`);
  }

  if (mapped.metadata?.provider !== "anthropic" || mapped.metadata?.requestId !== "req_1") {
    throw new Error(`Anthropic metadata was not captured: ${JSON.stringify(mapped.metadata)}`);
  }
}

function assertAnthropicToolResponseMapper() {
  const mapped = mapAnthropicMessagesResponse(
    {
      id: "msg_tool_1",
      model: "claude-test",
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "I'll check availability." },
        {
          type: "tool_use",
          id: "toolu_1",
          name: "check_availability",
          input: { preferredDate: "tomorrow", service: "cleaning" },
        },
      ],
    },
    { provider: "anthropic", model: "claude-test" },
  );

  if (
    mapped.kind !== "tool_calls" ||
    mapped.content !== "I'll check availability." ||
    mapped.toolCalls[0]?.id !== "toolu_1" ||
    mapped.toolCalls[0]?.arguments.service !== "cleaning"
  ) {
    throw new Error(`Anthropic tool response did not map correctly: ${JSON.stringify(mapped)}`);
  }
}

function assertAnthropicMalformedToolUseInput() {
  try {
    mapAnthropicMessagesResponse(
      {
        content: [{ type: "tool_use", id: "toolu_bad", name: "check_availability", input: "not an object" }],
      },
      { provider: "anthropic", model: "claude-test" },
    );
  } catch (error) {
    if (error instanceof ProviderToolCallError) {
      return;
    }

    throw error;
  }

  throw new Error("Anthropic malformed tool_use input did not fail.");
}

function assertFactoryBehavior() {
  if (createProviderAdapter("openai").kind !== "openai") {
    throw new Error("OpenAI provider factory did not return the OpenAI adapter.");
  }

  if (createProviderAdapter("anthropic").kind !== "anthropic") {
    throw new Error("Anthropic provider factory did not return the Anthropic adapter.");
  }

  try {
    createProviderAdapter("custom");
  } catch (error) {
    if (error instanceof ProviderUnsupportedFeatureError) {
      return;
    }

    throw error;
  }

  throw new Error("Custom provider factory path did not require caller injection.");
}

async function assertProviderSdkImportBoundary() {
  const srcRoot = new URL("../src/", import.meta.url);
  const files = await listTypeScriptFiles(srcRoot);

  for (const file of files) {
    const contents = await readFile(file, "utf8");
    const isProviderFile = file.includes("/src/providers/");
    if (!isProviderFile && /\bfrom\s+["'](?:openai(?:\/|["'])|@anthropic-ai\/sdk)/.test(contents)) {
      throw new Error(`Provider SDK import escaped src/providers: ${file}`);
    }
  }
}

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
