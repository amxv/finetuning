---
title: Evaluate runs and verify artifacts
description: Compare baselines, interpret task metrics, classify checkpoints, and verify release evidence.
order: 5
category: How-to
---

## Compare the right baselines

Keep dataset, split, evaluator, prompt/pooling, dimension, seed, and task set fixed. Compare the base model, tuned model, no-distillation ablation, and a trivial baseline. Define regression thresholds before reading results; confidence intervals do not repair contamination or teacher bias.

For chat, inspect held-out loss where meaningful, exact/executable task success, rubric dimensions, format/tool-call correctness, safety, over-refusal, and canary memorization. For embeddings, report retrieval recall/MRR/NDCG, STS correlation, classification accuracy/F1, and clustering metrics per task and dimension. Preserve raw task results, not only an aggregate.

## Classify checkpoints

- **Complete:** model, optimizer, scheduler, scaler, RNG, sampler, and step state are atomic and compatible; full resume is allowed.
- **Incomplete:** inspection only; never resume.
- **Weights-only:** warm start, not full resume.
- **Export:** adapter, merged model, or Sentence Transformers bundle with a separate reload contract.

Reject a checkpoint when its data/split hash, recipe identity, model/tokenizer revision, prompt/pooling, objective, or world size conflicts with the job.

## Verify before release

Open the artifact manifest and verify every relative path, media type, size, and SHA-256 in a clean process. Review the resolved spec, environment/package inventory, evaluation report, export config, and model card. A valid hash proves integrity, not quality, licensing, or safety.

Next: [operations and compliance](/docs/operations-compliance) or [troubleshooting](/docs/troubleshooting-faq).
