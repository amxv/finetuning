---
title: Models, recipes, providers, and execution
description: Read exact lock evidence and distinguish available frameworks from unavailable production recipes.
order: 11
category: Reference
---

`locks/recipe-support-v1.json` is the support authority; `locks/embedding-models-v1.json` contains exact model commit, declared license, architecture, dependencies, prompt, pooling, padding, normalization, safe dimensions, context, native heads, remote-code requirement, hardware estimate, evidence URLs, limitations, and unavailable reasons.

The status matrix currently contains 13 recipes: the tiny CPU embedding fixture is `supported` only for offline testing; the Qwen 9B chat pilot is `experimental`; six production chat recipes and five production embedding recipes are `unavailable`. Missing license, GPU smoke, clean reload, or evaluation evidence fails closed. BGE sparse/ColBERT/hybrid and GTE sparse are later experimental work.

## Chat recipe status

| Canonical recipe             | Track / architecture         | Status       | Blocking evidence                             |
| ---------------------------- | ---------------------------- | ------------ | --------------------------------------------- |
| `qwen3.6-27b`                | chat / dense                 | unavailable  | pinned license, GPU smoke, reload, evaluation |
| `qwen3.6-35b-a3b`            | chat / MoE                   | unavailable  | pinned license, GPU smoke, reload, evaluation |
| `nemotron-cascade-2-30b-a3b` | chat / hybrid MoE            | unavailable  | pinned license, GPU smoke, reload, evaluation |
| `nemotron-3-nano-30b-a3b`    | chat / Mamba-transformer MoE | unavailable  | pinned license, GPU smoke, reload, evaluation |
| `olmo-3.1-32b-instruct`      | chat / dense instruct        | unavailable  | pinned license, GPU smoke, reload, evaluation |
| `olmo-3.1-32b-think`         | chat / dense reasoning       | unavailable  | pinned license, GPU smoke, reload, evaluation |
| `qwen3.5-9b-pilot`           | chat / pilot                 | experimental | not a supported production recipe             |

Templates, assistant-only masks, precision, quantization, target modules, and effective batch are locked in the recipe/job identity; none of these statuses assert that a GPU run has passed.

## Embedding recipe matrix

| Recipe / model revision                                           | Architecture and task                               | Prompt, pooling, padding            | Dimensions / context | License and hardware status                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| `qwen3-embed-0.6b-lora` · `Qwen/Qwen3-Embedding-0.6B` · `97b0c6…` | Qwen3 decoder bi-encoder · retrieval                | `Instruct…Query…`, last-token, left | 32–1024 · 32,768     | Apache-2.0 declared; license artifact and LoRA GPU/reload evidence missing                          |
| `arctic-m-v2-full` · Snowflake Arctic · `95c274…`                 | XLM-R encoder · multilingual retrieval              | query/document prefixes, CLS, right | 256/768 · 8,192      | Apache-2.0 declared; license artifact and pinned remote-code review missing                         |
| `bge-m3-dense` · `BAAI/bge-m3` · `5617a9…`                        | XLM-R · dense retrieval                             | no prompt, CLS, right               | 1024 · 8,192         | **Metadata declares MIT, conflicting with expected Apache-2.0**; reviewed license artifact required |
| `nomic-v2-moe-native` · Nomic v2 MoE · `1066b6…`                  | NomicBERT MoE · retrieval/classification/clustering | task prefixes, mean, right          | 256/768 · 512        | Apache-2.0 declared; license artifact and external remote-code review missing                       |
| `gte-multilingual-base-full` · GTE · `9bbca1…`                    | multilingual encoder · dense retrieval              | no prompt, CLS, right               | 768 · 8,192          | Apache-2.0 declared; license artifact and pinned remote-code review missing                         |
| `cpu-tiny-embedding-fixture`                                      | deterministic test encoder                          | fixture `q:` convention, mean       | fixture-only         | supported only for offline CI; no quality claim                                                     |

All production embedding rows use L2 normalization. Precision/quantization and hardware are recipe-specific: Qwen targets LoRA GPU execution; encoder full tunes require a measured CPU/GPU probe; MoE and remote-code paths need additional evidence. Exact commits, prompts, heads, dependencies, limitations, and evidence URLs live in `locks/embedding-models-v1.json` and are checked against this documentation.

OpenAI and Anthropic adapters are optional peers. Provider selection requires an explicit model and API-key environment reference. Capabilities, retry/rate policy, usage and cost, raw-envelope redaction, budget, and idempotency are recorded. Estimates are user-side planning controls—not provider hard spending caps.

Local CPU execution is available for fixtures. The Phase 20–23 `finetuning runpod` surface provides pinned offline contracts, read-only diagnostics, planning, dry-run output, and fake lifecycle/hardening tests. Live Pod and volume mutation fails closed because no authorized qualification evidence or spend was produced. Production recipes, spot, generic exec/log REST, direct Secrets representation, Serverless, and fleet remain unavailable. See [RunPod execution and support status](/docs/runpod-execution).
