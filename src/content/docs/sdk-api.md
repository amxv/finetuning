---
title: TypeScript SDK and API
description: Use the stable packed exports and understand browser-safe versus Node-only boundaries.
order: 8
category: Reference
---

The package export map is authoritative. Stable paths are the root plus `core`, `providers`, `simulation`, `translation`, `formats`, `formats/openai`, `validation`, `generation`, `providers/openai`, `providers/anthropic`, `templates`, `training`, `orchestration`, `distillation`, `embeddings`, `embeddings/formats`, `embeddings/distillation`, `embeddings/training`, `embeddings/evaluation`, and Node-only `node`. Example exports are tested but are not the general API surface. Experimental paths may change during alpha.

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

The generated declaration report at `test/snapshots/api-report.md` is release-gated. A changed declaration or export snapshot fails until reviewed and regenerated. Next: [Python trainer API](/docs/python-trainer) and [compatibility](/docs/compatibility-reference).
