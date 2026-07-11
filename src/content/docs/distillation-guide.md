---
title: Choose a distillation target
description: Select response, vector, score, or ranking distillation and preserve the controls each target needs.
order: 4
category: How-to
---

## Match the target to the task

| Target   | Use it when                                                  | Required controls                                                                  |
| -------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Response | The student must produce better chat/tool outputs            | role/tool validation, rubric judging, generator/judge separation, held-out prompts |
| Vector   | A compatible teacher exposes embeddings and geometry matters | tokenizer/dimension compatibility, normalization, storage/retention approval       |
| Score    | The teacher exposes graded pair relevance                    | calibrated score scale, task mapping, hard-negative review                         |
| Ranking  | Only relative ordering is reliable                           | candidate-set provenance, tie policy, group-aware leakage controls                 |

Do not turn a score into a Boolean label unless the threshold and calibration evidence are part of the dataset contract. Do not treat response text as an embedding target.

## Provider, rights, and budget gates

Before a teacher call, record its capability, exact model/snapshot, credential environment reference, terms for derived training data, retention/deletion policy, and raw-envelope redaction. Set separate generator and judge budgets. Planning estimates cost; it is not a provider-enforced hard cap.

Every request receives a stable sample identity and resume ledger entry. Preserve successful results and retry only eligible transport failures. A resume must not silently repurchase completed samples.

## Leakage and false negatives

Group by shared source, user, document, template, or semantic family before splitting. Lock validation/test before teacher generation. For retrieval, mine hard negatives only from allowed pools, retain miner/version provenance, and exclude likely positives or same-group documents. Re-evaluate negatives when the corpus changes.

Next: [run the chat tutorial](/docs/chat-track), [run the embedding tutorial](/docs/embedding-quickstart), or [interpret evaluation](/docs/evaluation-artifacts).
