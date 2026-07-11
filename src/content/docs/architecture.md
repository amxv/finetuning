---
title: Architecture
description: Understand canonical data, distillation, orchestration, Python training, evaluation, and remote-execution boundaries.
order: 9
category: Reference
summary: TypeScript owns contracts and orchestration; Python owns model-specific training semantics.
---

## Data and control planes

The TypeScript package owns canonical chat and embedding records, codecs, validation, provider adapters, distillation stages, manifests, budgets, orchestration, evaluation contracts, CLI/SDK surfaces, and execution plans. Browser-safe modules avoid filesystem and subprocess dependencies; Node adapters live under `@amxv/finetuning/node`.

The separately versioned Python wheel owns tokenizer chat templates, tokenization, assistant masks, pooling/padding, Transformers/Datasets/TRL/PEFT/Accelerate execution, checkpoints, model artifacts, and clean reload verification. Both sides validate versioned JSON contracts; incompatible majors fail closed.

## Implemented module boundaries

| Boundary                                    | Responsibility                                                      |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `core`, `formats`, `validation`             | canonical chat records, codecs, schema and integrity checks         |
| `embeddings/*`                              | embedding records, formats, distillation, training, evaluation      |
| `providers/*`, `generation`, `distillation` | optional teachers, capabilities, budgets, retry, lineage            |
| `templates`, `training`                     | immutable chat recipe identity and Python job contracts             |
| `orchestration`, `node`                     | DAG state, resume, filesystem, subprocess, locks, secrets           |
| `execution`, `execution/runpod`             | provider-neutral jobs and pinned read-only/dry-run RunPod contracts |

Append-only JSONL is the data plane; canonical JSON manifests and SHA-256 content addressing bind inputs, configuration, decisions, checkpoints, evaluation, and export. Run state keys include run, stage, record, and attempt so recovery never overwrites history.

## Capability boundary

Deterministic chat generation, CPU fixtures, validation, planning, resume, evaluation, and artifact verification run locally. OpenAI and Anthropic load only when selected. Production recipes, model downloads, GPU claims, remote code, uploads, and live RunPod mutation require evidence or remain unavailable. Real-log conversion remains deferred until a public contract and redaction hooks exist.

Next: [TypeScript SDK](/docs/sdk-api), [Python trainer](/docs/python-trainer), or [configuration contracts](/docs/config-schemas).
