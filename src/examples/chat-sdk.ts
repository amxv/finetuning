import type { DatasetExampleV1 } from "@amxv/finetuning/core";
import { validateDatasetExample } from "@amxv/finetuning/validation";

const example: DatasetExampleV1 = {
  datasetSchemaVersion: "1.0.0",
  id: "sdk-chat-example",
  messages: [
    { role: "user", content: [{ type: "text", text: "Hello" }] },
    { role: "assistant", content: [{ type: "text", text: "Hello!" }] },
  ],
  provenance: { source: "docs", sourceId: "sdk-chat-example", license: "CC0-1.0" },
  createdAt: "2026-07-12T00:00:00.000Z",
};
const report = validateDatasetExample(example);
console.log(JSON.stringify({ valid: report.valid }));
