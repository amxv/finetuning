---
title: Core concepts
description: Understand records, codecs, templates, manifests, provenance, runs, and artifacts shared by both tracks.
order: 2
category: Concepts
---

## The data plane

A canonical record stores meaning, not model-specific control tokens. Chat records preserve semantic roles, typed tool calls/results, groups, provenance, transformations, and content hashes. Embedding records preserve query/document/text roles, positives and negatives, scores or vectors, labels, candidate pools, groups, and teacher attribution.

A **codec** translates an external file shape to or from a canonical record and reports loss. A **template** renders canonical chat meaning for a pinned tokenizer. An embedding **model adapter** applies query/document prompts, pooling, padding, normalization, and allowed dimensions late. Never bake target tokens or destructive prefixes into canonical data.

## The control plane

A frozen dataset manifest binds records, split and contamination evidence, rights, and hashes. A run manifest binds normalized config, implementation and policy versions, input hashes, attempts, budgets, and checkpoints. Successful paid work is recorded in an idempotency ledger so resume does not repeat it.

Artifacts are content-addressed and verified before inspection, reload, evaluation, model-card generation, or export. Full-resume checkpoints restore optimizer, scheduler, scaler, RNG, sampler, and step. A weights-only artifact is a warm start, not a resume.

Next: follow the [chat tutorial](/docs/chat-track) or [embedding tutorial](/docs/embedding-quickstart), then use the [configuration and schema reference](/docs/config-schemas).
