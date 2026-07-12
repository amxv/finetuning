---
title: Operations, hardware, and compliance
description: Estimate hardware, recover safely, and satisfy rights, privacy, license, and model-card gates.
order: 5
category: Operations
---

Always run `embed train estimate`, then the mandatory one-step memory probe on the target hardware. The following are planning ranges, never guarantees:

| Workload                    | Typical class             | Precision            | Operational note                                 |
| --------------------------- | ------------------------- | -------------------- | ------------------------------------------------ |
| tiny fixture                | CPU, <1 GB working memory | FP32                 | CI only; no production quality claim             |
| 0.6B LoRA, ordinary lengths | 16–24 GB GPU              | BF16 where supported | probe sequence buckets and effective batch       |
| 0.6–1B full tune            | 24–48 GB GPU              | BF16                 | optimizer state dominates; use checkpointing     |
| long-context or MoE         | 48–80+ GB or distributed  | BF16                 | lock-specific; active params do not equal memory |

If the probe OOMs, reduce sequence length or microbatch, enable gradient checkpointing, increase accumulation, choose LoRA, or move to a larger/sharded target. Record microbatch × accumulation × device count as effective batch. Verify cross-device negatives and global IDs. Mixed precision and distributed modes are recipe capabilities, not universal switches.

Checkpoint taxonomy: atomic complete checkpoints permit full resume; incomplete checkpoints are inspection-only; weights-only artifacts are warm starts; exported adapters, merged models, and portable Sentence Transformers bundles have different reload requirements. Immutable identity includes exact model/tokenizer/config/remote-code revisions, data/split hashes, prompts, pooling, normalization, dimensions, objective, and seed.

Before any provider or training run, record source rights, teacher-output terms, intended use, retention/deletion, privacy/redaction, model license and NOTICE, trademark review, regulated-use review, provenance and approval. **A model license does not clear data, teacher-output, privacy, trademark, or regulated-use rights.** Never store credentials or raw sensitive provider envelopes in artifacts. The model card must cite verified evaluation reports and disclose datasets, limits, contamination controls, prompts/pooling, dimensions, licenses, and unsupported uses.

Production model/GPU commands are gated and are not run by the default verification suite. All five production embedding recipes are experimental, while execution remains unavailable unless their pinned download, license, hardware, architecture, reload and evaluation evidence passes. No timing, memory, benchmark, or production-support claim should be inferred from the CPU fixture.
