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
assertOpenAITextResponseMapper();
assertOpenAIToolResponseMapper();
assertOpenAIMalformedToolArguments();
assertAnthropicRequestMapper();
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
          arguments: "{\"preferredDate\":\"tomorrow\",\"service\":\"cleaning\"}",
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
            arguments: "{\"preferredDate\":",
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
