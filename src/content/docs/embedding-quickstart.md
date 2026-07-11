---
title: 10-minute offline embeddings
description: Run the tiny CPU retrieval fixture through estimate, train, resume, evaluate, inspect, and export.
order: 3
category: Tutorials
---

This fixture is deterministic, CPU-only, and makes no network request, model download, upload, or remote-code call. Build first, then use the checked-in files under `examples/embedding-offline/`.

```bash
npm run build
node dist/cli/index.js embed data validate examples/embedding-offline/records.jsonl --task pair --columns query=query,document=document --split-group-column group --source offline-fixture --source-revision 1 --license CC0-1.0 --rights approved --json
node dist/cli/index.js embed train estimate --config examples/embedding-offline/training.json --json
node dist/cli/index.js embed train run --config examples/embedding-offline/training.json --python-root python --json
node dist/cli/index.js embed train status --config examples/embedding-offline/training.json --checkpoint ../tmp/embedding-offline/run/checkpoint-4.json --python-root python --json
node dist/cli/index.js embed train resume --config examples/embedding-offline/training.json --checkpoint ../tmp/embedding-offline/run/checkpoint-4.json --python-root python --json
node dist/cli/index.js embed evaluate run --config examples/embedding-offline/evaluation.json --json
node dist/cli/index.js embed evaluate compare --config examples/embedding-offline/evaluation.json --left tmp/embedding-offline/evaluation.json --right tmp/embedding-offline/evaluation.json --json
node dist/cli/index.js embed train export --config examples/embedding-offline/training.json --python-root python --json
```

The SDK equivalent is runnable from the packed `@amxv/finetuning/examples/embedding-sdk` export. It composes `EmbeddingDatasetBuilder`, `EmbeddingRecordValidator`, and `EmbeddingSplitPlanner` without I/O side effects.

Qwen retrieval instructions belong on queries, normally not documents; they are late-bound and pinned in `immutableIdentity.prompts`. The CPU fixture uses `q:` solely as a fixture convention and mean pooling—it does **not** claim production Qwen parity. Production `qwen3-embed-0.6b-lora` is separately locked, currently unavailable until its GPU/download/license gates pass, uses last-token/EOS pooling and left padding, and supports only lock-declared Matryoshka dimensions.

Expected run tree:

```text
tmp/embedding-offline/
├── evaluation.json
└── run/
    ├── checkpoint-1.json … checkpoint-8.json
    ├── embedding-artifact-manifest.json
    ├── environment.json, packages.json, gpu.json
    ├── evaluation.json, model.json, model-card.json
    ├── export-config.json
    └── resolved-spec.json
```

An interruption resumes only from an atomic complete checkpoint. Full resume restores optimizer, scheduler, scaler, RNG, sampler and step; weights-only is a warm start and must be labeled as such. Inspect the artifact manifest and verify hashes before reload or export.
