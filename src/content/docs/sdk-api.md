---
title: TypeScript SDK and API
description: Use the stable packed exports and understand browser-safe versus Node-only boundaries.
order: 8
category: Reference
---

The package export map is authoritative. Stable browser-safe paths are the package root plus `core`, `providers`, `simulation`, `translation`, `formats`, `formats/openai`, `validation`, `generation`, `providers/openai`, `providers/anthropic`, `templates`, `training`, `orchestration`, `distillation`, `embeddings`, `embeddings/formats`, `embeddings/distillation`, `embeddings/training`, and `embeddings/evaluation`. Operational paths are Node-only: `node`, `execution`, and `execution/runpod`. Example paths are tested fixtures, not the general API surface. `experimental/advanced-distillation` may change during alpha. This list is checked against the packed `package.json` export map.

```ts
import { EmbeddingDatasetBuilder, EmbeddingRecordValidator, EmbeddingSplitPlanner } from "@amxv/finetuning/embeddings";

const builder = new EmbeddingDatasetBuilder();
const validation = await new EmbeddingRecordValidator().validate(
  (async function* () {
    yield* builder.records();
  })(),
);
const split = new EmbeddingSplitPlanner().plan(builder.records(), { salt: "example-v1" });
console.log(JSON.stringify({ validation, split }));
```

This block is **executable** and is typechecked/run from a clean packed consumer. TypeScript data and contract modules avoid Python/CUDA dependencies. Filesystem, subprocess, lock, and secret adapters live in `node`. Optional OpenAI and Anthropic peers load only when selected.

For chat, import provider-neutral records and freeze/validation helpers from the root, `formats`, and `validation`; use `distillation`, `training`, and `orchestration` to plan stages without importing a provider SDK. Provider adapters are optional peers and load only when selected.

```ts
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
```

This snippet is executed from a clean packed consumer. The validation namespace also exports `validateOpenAIJsonl`, `validateOpenAIFineTuningRow`, and `assertValidOpenAIFineTuningRow` for compatibility data.

The generated declaration report at `test/snapshots/api-report.md` is release-gated. A changed declaration or export snapshot fails until reviewed and regenerated. Next: [Python trainer API](/docs/python-trainer) and [compatibility](/docs/compatibility-reference).
