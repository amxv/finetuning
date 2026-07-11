---
title: Embedding recipes and data shapes
description: Choose losses, prompts, pooling, dimensions, mining, and model-specific boundaries honestly.
order: 4
category: Embeddings
---

## Loss chooser

| Data shape | Objective | Distillation meaning |
| --- | --- | --- |
| query + positive document | MNRL/InfoNCE | relative in-batch retrieval |
| query + positive + negative | triplet/contrastive | explicit separation |
| pair + teacher score | MarginMSE | graded relevance margin |
| text + teacher vector | cosine/MSE + projection | geometry; projection must be trained on train only |
| candidate list + teacher order/scores | pairwise/listwise KL | ranking distribution |
| sentence pair + similarity | CoSENT/cosine | STS |
| text + class/cluster | supervised classification/clustering | label or grouping structure |

Never coerce scores to Boolean silently, truncate arbitrary teacher vectors, or mix evaluation IDs into generation/mining. Hard-negative mining must use train-only corpora, global IDs, deduplication, and false-negative filtering against positives, same-document groups, and known relevance.

Synthetic multilingual queries must record language, generator/provider, model revision, prompt hash, usage/cost, rights, and source document. Provider generation is opt-in and resumable; the local fixture is synthetic and offline.

Model conventions are lock-driven:

- Arctic: exact asymmetric query/document prompts; evaluate 768 and the lock-published 256 dimension separately.
- BGE-M3: dense-only MVP. Sparse and ColBERT/hybrid fusion are later gated work, not implied by dense export.
- Nomic: preserve `search_query:`, `search_document:`, `classification:`, and `clustering:` prefixes. MoE requires expert/router coverage, utilization and save/reload gates; active parameters are not optimizer memory.
- GTE: `trust_remote_code` is never implicit. It requires an explicit opt-in to a pinned reviewed commit and a clean offline reload check.
- Qwen: query instruction normally applies only to queries; last-token/EOS pooling, left padding, normalization, and allowed dimensions come from the lock.

For air-gapped operation, pre-stage the wheel, NPM tarball, exact model/tokenizer revisions, schemas, locks, licenses/NOTICE, and datasets; set offline modes in the model stack; verify hashes; and reject any missing cache entry. An offline claim is invalid if installation or reload contacts a registry or model hub.

