---
title: Python trainer and API
description: Install the separate wheel, validate versioned jobs, and run or verify local artifacts.
order: 9
category: Reference
---

Production recipes remain fail-closed until revision-bound qualification evidence exists. Chat preparation uses manual, prefix-verified assistant labels rather than tokenizer generation masks. Embedding training uses an explicit contrastive/Matryoshka two-tower loss; a generic embedding forward without a loss is not treated as a training objective.

The dependency-free base package is `amxv-finetuning-trainer`; large training libraries are an optional extra and are never bundled into NPM.

```bash
uv build python --out-dir tmp/python-dist
uv venv tmp/trainer-venv
uv pip install --python tmp/trainer-venv/bin/python --no-deps tmp/python-dist/*.whl
tmp/trainer-venv/bin/python -m amxv_finetuning_trainer.cli --help
```

This block is **executable on POSIX systems**; CI performs the equivalent platform-aware clean-wheel install. Commands are `prepare`, `run`, `resume`, `status`, `evaluate`, `export`, and `verify`, followed by a spec path; resume/status accept `--checkpoint`.

Python validates contracts again. It emits ordered JSONL events, writes atomically complete checkpoints, and produces a hash-verifiable artifact manifest. The NPM/Python compatibility matrix is packaged at `schemas/protocol-compatibility-v1.json`; incompatible majors fail closed.

The chat module accepts `prepare`, `run`, `resume`, `status`, `evaluate`, `export`, and `verify`. Every operation reads a versioned spec path, emits `started` first and a terminal `completed` or `failed` event, and uses monotonically increasing `sequence` values. Resume requires a complete checkpoint whose immutable identity matches the spec. Export and verify operate on relative, SHA-256-addressed artifact entries. The embedding module provides the same run/resume/status/evaluate/export lifecycle through the TypeScript bridge and binds embedding-specific identity fields.

Chat jobs bind the dataset manifest, immutable recipe/template identity, assistant-mask behavior, output directory, deadline, and checkpoint policy. Embedding jobs additionally bind task mapping, prompt conventions, pooling, padding, normalization, dimensions, objective, and split hash. Unknown fields or mismatched identities are errors rather than best-effort defaults.

```python
from amxv_finetuning_trainer.framework import RECIPES

recipe = RECIPES["cpu-tiny-embedding-fixture"]
print(recipe["track"])
```

The base wheel can inspect protocols and run fixtures without Transformers. Installing training extras changes dependencies, not recipe support status.

Installing the optional training extra can download third-party packages and does not download model weights by itself. Model downloads, GPU use, remote code, and uploads require separate explicit choices and recipe gates. Next: [operations](/docs/operations-compliance).
