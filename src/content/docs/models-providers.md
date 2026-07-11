---
title: Models, recipes, providers, and execution
description: Read exact lock evidence and distinguish available frameworks from unavailable production recipes.
order: 11
category: Reference
---

`locks/recipe-support-v1.json` is the support authority; `locks/embedding-models-v1.json` contains exact model commit, declared license, architecture, dependencies, prompt, pooling, padding, normalization, safe dimensions, context, native heads, remote-code requirement, hardware estimate, evidence URLs, limitations, and unavailable reasons.

The status matrix currently contains 13 recipes: the tiny CPU embedding fixture is `supported` only for offline testing; the Qwen 9B chat pilot is `experimental`; six production chat recipes and five production embedding recipes are `unavailable`. Missing license, GPU smoke, clean reload, or evaluation evidence fails closed. BGE sparse/ColBERT/hybrid and GTE sparse are later experimental work.

OpenAI and Anthropic adapters are optional peers. Provider selection requires an explicit model and API-key environment reference. Capabilities, retry/rate policy, usage and cost, raw-envelope redaction, budget, and idempotency are recorded. Estimates are user-side planning controls—not provider hard spending caps.

Local CPU execution is available for fixtures. Production GPU, model download, upload, remote code, remote execution, and RunPod are unavailable unless a later gate says otherwise. RunPod support is Phase 20 future work; no RunPod command is implemented here.
