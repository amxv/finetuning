---
title: 10-minute offline embeddings
description: Validate retrieval pairs, train and resume the CPU fixture, compare evaluation, and verify export.
order: 3
category: Tutorials
---

This deterministic fixture uses two retrieval pairs and no network, download, upload, GPU, or remote code. It demonstrates the workflow—not production Qwen quality or semantics.

## 1. Understand the records

Each JSONL row binds a query and document to provenance and a leakage group. A representative row is conceptually:

```json
{ "query": "reset my password", "document": "Open Settings, then Security.", "group": "account-help" }
```

The checked-in canonical records add versioned IDs and rights metadata. Queries and documents that share a source must remain in the same split group.

## 2. Validate schema and provenance

```bash
npm run build

node dist/cli/index.js embed data validate \
  examples/embedding-offline/records.jsonl \
  --task pair \
  --columns query=query,document=document \
  --split-group-column group \
  --source offline-fixture \
  --source-revision 1 \
  --license CC0-1.0 \
  --rights approved \
  --json
```

Expect `valid: true` and `recordCount: 2`. Missing provenance, rights, task mapping, or split groups fails before training.

## 3. Estimate and train

```bash
node dist/cli/index.js embed train estimate \
  --config examples/embedding-offline/training.json \
  --json

node dist/cli/index.js embed train run \
  --config examples/embedding-offline/training.json \
  --python-root python \
  --json
```

The estimate reports `executable: true`, `network: false`, `uploads: false`, and `trustRemoteCode: false`. The CPU objective is a tiny multiple-negatives fixture; its metrics are pipeline assertions, not benchmark claims.

## 4. Inspect and resume the checkpoint

```bash
node dist/cli/index.js embed train status \
  --config examples/embedding-offline/training.json \
  --checkpoint ../tmp/embedding-offline/run/checkpoint-4.json \
  --python-root python \
  --json

node dist/cli/index.js embed train resume \
  --config examples/embedding-offline/training.json \
  --checkpoint ../tmp/embedding-offline/run/checkpoint-4.json \
  --python-root python \
  --json
```

Status classifies this as `full-resume`: optimizer, scheduler, scaler, RNG, sampler, and step state are complete. A weights-only checkpoint must be treated as a warm start.

## 5. Evaluate, compare, and export

```bash
node dist/cli/index.js embed evaluate run \
  --config examples/embedding-offline/evaluation.json \
  --json

node dist/cli/index.js embed evaluate compare \
  --config examples/embedding-offline/evaluation.json \
  --left tmp/embedding-offline/evaluation.json \
  --right tmp/embedding-offline/evaluation.json \
  --json

node dist/cli/index.js embed train export \
  --config examples/embedding-offline/training.json \
  --python-root python \
  --json
```

Compare identical evaluator and dataset revisions. Inspect retrieval recall/MRR or task-specific STS, classification, and clustering metrics rather than relying on a single aggregate. Verify every hash in `embedding-artifact-manifest.json` before reload.

Production `qwen3-embed-0.6b-lora` uses late-bound query instructions, last-token/EOS pooling, left padding, and lock-declared dimensions. It remains unavailable until license, download, GPU, reload, and evaluation evidence passes.

Next: [choose an embedding distillation objective](/docs/distillation-guide) or [review the recipe matrix](/docs/models-providers).
