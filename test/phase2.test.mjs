import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  canonicalSerialize,
  canonicalSha256,
  datasetSchemaVersion,
  trajectoryToDatasetExample,
} from "../dist/core/index.js";
import {
  canonicalMessagesCodec,
  hfConversationalCodec,
  hfTextCodec,
  JsonlParseError,
  openAIChatCodec,
  parseJsonl,
  serializeJsonl,
} from "../dist/formats/index.js";
import { validateDatasetExample } from "../dist/validation/index.js";
import { buildOpenAIFineTuningRow, fullToolTrajectoryConversationFixture } from "../dist/core/index.js";

const canonical = trajectoryToDatasetExample(fullToolTrajectoryConversationFixture);

test("DatasetExampleV1 fixture matches the versioned schema contract", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/dataset-example-v1.schema.json", import.meta.url)));
  assert.equal(schema.properties.datasetSchemaVersion.const, datasetSchemaVersion);
  for (const key of schema.required) assert.ok(key in canonical, `missing required property ${key}`);
});

test("canonical serialization and SHA-256 are key-order invariant", () => {
  assert.equal(canonicalSerialize({ b: 2, a: { d: 4, c: 3 } }), canonicalSerialize({ a: { c: 3, d: 4 }, b: 2 }));
  assert.equal(canonicalSha256({ b: 2, a: 1 }), canonicalSha256({ a: 1, b: 2 }));
  assert.match(canonicalSha256({ a: 1 }), /^[a-f0-9]{64}$/);
});

test("canonical codec round-trips without loss", () => {
  const encoded = canonicalMessagesCodec.encode(canonical);
  const decoded = canonicalMessagesCodec.decode(encoded.value);
  assert.deepEqual(decoded.value, canonical);
  assert.deepEqual([...encoded.losses, ...decoded.losses], []);
});

test("OpenAI compatibility codec preserves existing golden rows", () => {
  const row = buildOpenAIFineTuningRow(fullToolTrajectoryConversationFixture, { mode: "full_tool_trajectory" });
  const decoded = openAIChatCodec.decode(row);
  const encoded = openAIChatCodec.encode(decoded.value);
  assert.equal(encoded.supported, true);
  assert.deepEqual(encoded.value, row);
});

test("HF conversational reports unsupported tool loss and text reverse is explicit", () => {
  const hf = hfConversationalCodec.encode(canonical);
  assert.equal(hf.supported, false);
  assert.ok(hf.losses.some((item) => item.code === "HF_TOOL_SEMANTICS_UNSUPPORTED"));
  const rendered = hfTextCodec.encode(canonical);
  assert.ok(rendered.losses.some((item) => item.code === "HF_TEXT_RENDERED_LOSSY"));
  const reverse = hfTextCodec.decode(rendered.value);
  assert.equal(reverse.supported, false);
  assert.equal(reverse.value, undefined);
  assert.equal(reverse.losses[0].code, "HF_TEXT_REVERSE_UNSUPPORTED");
});

test("streaming JSONL exposes malformed line and byte locations", async () => {
  async function* chunks() {
    yield '{"ok":1}\n';
    yield "{bad}\n";
  }
  await assert.rejects(
    async () => {
      for await (const _record of parseJsonl(chunks())) void _record;
    },
    (error) => error instanceof JsonlParseError && error.line === 2 && error.byteOffset === 9,
  );
});

test("streaming JSONL remains demand-driven across a large source", async () => {
  let produced = 0;
  async function* records() {
    for (let index = 0; index < 10000; index++) {
      produced += 1;
      yield { index };
    }
  }
  const output = serializeJsonl(records());
  const iterator = output[Symbol.asyncIterator]();
  assert.equal(produced, 0);
  assert.equal((await iterator.next()).value, '{"index":0}\n');
  assert.equal(produced, 1);
  await iterator.return();
});

test("staged validation uses stable role/tool and readiness codes", () => {
  const report = validateDatasetExample({
    ...canonical,
    messages: [
      { role: "assistant", content: [], toolCalls: [{ id: "call", name: "x", arguments: {} }] },
      { role: "tool", content: [{ type: "text", text: "x" }], toolCallId: "orphan" },
    ],
  });
  assert.ok(report.issues.some((issue) => issue.code === "TOOL_RESULT_ORPHANED"));
  assert.ok(report.issues.some((issue) => issue.code === "TOOL_RESULT_MISSING"));
  assert.equal(report.stages.semantic, false);
});
