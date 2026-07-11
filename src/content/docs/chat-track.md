---
title: Chat response distillation and SFT
description: Run a complete offline chat workflow, then understand the boundary for provider teachers and production recipes.
order: 2
category: Tutorials
---

This tutorial freezes one canonical conversation, produces explicitly fake teacher output, trains the CPU fixture, resumes it, evaluates it, and verifies its export. It makes no network request, model download, GPU call, or upload.

## 1. Inspect and freeze the input

`examples/chat-offline/records.jsonl` contains one versioned conversation with provenance and a stable record ID. Freeze it before generation so later stages can bind to an immutable hash.

```bash
npm run build

node dist/cli/index.js dataset freeze \
  examples/chat-offline/records.jsonl \
  --out tmp/chat-offline/frozen \
  --force \
  --json
```

Expect `recordCount: 1`. The frozen manifest is the input authority; changing a record creates a different hash rather than silently reusing prior work.

## 2. Initialize, plan, and generate offline

```bash
node dist/cli/index.js distill init \
  --root tmp/chat-offline/distill \
  --config examples/chat-offline/distillation.json \
  --input examples/chat-offline/records.jsonl \
  --force \
  --json

node dist/cli/index.js distill plan \
  --root tmp/chat-offline/distill \
  --json

node dist/cli/index.js distill responses \
  --root tmp/chat-offline/distill \
  --offline-fake \
  --json
```

The fake candidate is labeled `custom/offline-fake`; it is test data, not evidence about a real teacher. A provider-backed plan instead requires an explicit provider/model, credential environment-variable name, `--allow-network`, and separate positive generation and judging budgets. Idempotency and the resume ledger prevent a successful paid sample from being purchased twice.

## 3. Freeze distilled output

```bash
node dist/cli/index.js distill freeze \
  --root tmp/chat-offline/distill \
  --out tmp/chat-offline/distilled \
  --force \
  --json
```

Inspect rejected and retained candidates before freezing. Policy decisions annotate candidates; they do not erase lineage. Keep validation/test groups locked and never send held-out answers to a teacher.

## 4. Train, resume, evaluate, and export

```bash
node dist/cli/index.js training run \
  --spec examples/chat-offline/training.json \
  --python python3 --python-root python --json

node dist/cli/index.js training resume \
  --spec examples/chat-offline/training.json \
  --checkpoint ../tmp/chat-offline/train/checkpoint-1.json \
  --python python3 --python-root python --json

node dist/cli/index.js training evaluate \
  --spec examples/chat-offline/training.json \
  --python python3 --python-root python --json

node dist/cli/index.js training export \
  --spec examples/chat-offline/training.json \
  --python python3 --python-root python --json
```

Each command returns `exitCode: 0`. Verify every path and SHA-256 in `tmp/chat-offline/train/artifact-manifest.json`. A complete checkpoint permits full resume; weights-only output is a labeled warm start.

## Recovery and production transition

On interruption, rerun status and resume from the newest atomic, compatible checkpoint. Never adopt a checkpoint with a different data hash, recipe identity, image, or spec. The Qwen 9B recipe is an experimental pilot; all production chat recipes remain unavailable until pinned license, GPU smoke, clean reload, and evaluation gates pass.

Next: [choose a distillation target](/docs/distillation-guide) or [interpret evaluation and artifacts](/docs/evaluation-artifacts).
