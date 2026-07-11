---
title: Compatibility and reproducibility
description: Understand package versions, schemas, protocols, configuration precedence, errors, and benchmark limits.
order: 9
category: Reference
---

The NPM SDK/CLI and Python trainer are separately versioned. This source checkout tests NPM `0.0.0` with Python `0.0.0`; compatibility is negotiated by schema/protocol major, not guessed from package version. Current contracts include `embedding.training.v1`, `embedding.training.event.v1`, `embedding.training.artifact.v1`, and `embedding.evaluation.v1`. Reject incompatible majors; migrate explicitly and retain old manifests.

Stable SDK subpaths are the package export map: root, `core`, `formats`, `formats/openai`, `validation`, `generation`, `providers` and provider adapters, `templates`, `training`, `orchestration`, `distillation`, `embeddings`, its `formats`, `distillation`, `training`, and `evaluation` subpaths, plus Node-only `node`. Experimental subpaths may change without compatibility guarantees.

Embedding configuration is strict and versioned. Precedence is CLI flags > referenced environment values > command config > defaults. Environment references name variables; resolved output must redact values. Use `--json` for one parseable stdout document, `--quiet` to suppress non-result chatter, and `--dry-run` before mutating commands. Progress belongs on stderr. Stdin/stdout are available only where the command help declares them; otherwise use explicit paths. Network, download, upload, overwrite, and remote-code trust must always be explicit.

Exit 0 means success. Usage/config/schema failures, unavailable capability, policy/license failure, budget exhaustion, network/provider failure, incomplete checkpoint, artifact tampering, and internal failure have stable machine-readable error codes; scripts should consume codes/JSON rather than prose. Inspect `finetuning embed <noun> <command> --help` for every supported option.

For reproducibility, pin package/model/tokenizer/config/evaluator/dataset revisions; freeze input and splits; record prompts, pooling, dimensions, seeds and environment; preserve raw per-task metrics and hashes; compare base, tuned, no-distillation and trivial baselines on identical splits; and verify exported artifacts in a clean process. MTEB aggregates are comparable only with identical revision, task set and evaluator. Confidence intervals do not eliminate contamination or teacher-bias limitations.

Compatibility claims are enforced by packaged schemas, declaration snapshots, clean package consumers, and runnable chat and embedding documentation workflows.
