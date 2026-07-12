---
title: Model recipe qualification
description: Configure, authorize, smoke, qualify, and support model recipes without overstating evidence.
order: 5
category: Concepts
---

Every planned model recipe is currently **configured** and **unavailable for supported use**. Configuration means its canonical ID, immutable candidate revision, architecture, legal conclusion, optimization shape, runtime plan, and blockers are machine-readable. It does not authorize downloads or training and it is not GPU evidence.

Qualification progresses monotonically from `configured` to `smokeAuthorized`, `smokePassed`, and `qualified`. `supported` is a separate release decision after legal, quality, operational, and compatibility review. Evidence is cryptographically bound to the recipe identity, revision, and architecture. A missing assertion, invalid digest, skipped state, dependency drift, tokenizer/template drift, or license drift fails closed. CLI users cannot promote a recipe by setting a status boolean.

## Offline workflow

```sh
finetuning recipes list --json
finetuning recipes inspect --recipe qwen3-embed-0.6b-lora --json
finetuning recipes preflight --recipe qwen3-embed-0.6b-lora --json
finetuning recipes plan --recipe qwen3-embed-0.6b-lora --json
finetuning recipes record-evidence --evidence ./reviewed-evidence.json --json
```

Preflight gates cover experimental execution, network, downloads, remote code, GPU, budget, uploads, model-license acceptance, dataset rights, architecture/framework evidence, and custom kernels. `plan` only emits a RunPod-oriented GPU, storage, image, and distributed-strategy proposal. It sets `createsResources: false`, makes no network call, and spends nothing.

The planned first-wave order is Qwen3 Embedding, Arctic Embed, OLMo 3.1 Instruct, OLMo 3.1 Think, Qwen3.6 dense, BGE dense after corrected MIT inventory approval, then GTE dense after external-code review. Each still has blockers and none is smoke-passed, qualified, or supported.

Nomic v2 MoE, both Nemotron variants, Qwen3.6 MoE, BGE sparse/ColBERT/hybrid, and GTE sparse are non-executable in the first wave. Their machine-readable blockers name the missing native lane, custom code/kernel review, packed expert/router evidence, license artifact, or excluded head.

## Trainer semantics

Chat recipes use verified cumulative token boundaries to construct assistant labels because the pinned templates do not expose valid Jinja generation spans. Non-prefix-stable rendering, an empty assistant target, template drift, EOS/pad drift, unsupported roles, and ambiguous reasoning/tool conversion fail closed.

Embedding recipes use a two-tower contrastive objective with in-batch negatives. Hard negatives are appended as candidates. Matryoshka recipes compute normalized contrastive loss at every declared dimension and average the losses. Pooling, padding, normalization, query/document prompts, dimensions, and native-head exclusions are immutable identity.

License strings are evidence claims, not authorization. BGE-M3 is MIT; the former Apache assumption is recorded as erroneous and remains blocked pending inventory approval. NVIDIA entries use NVIDIA license references and are never described as Apache. Where the pinned repository lacks a LICENSE artifact, metadata alone cannot open the gate.
