---
title: Configuration and schemas
description: Resolve configuration safely and locate every packaged versioned contract.
order: 10
category: Reference
---

Configuration precedence is **CLI flags → referenced environment values → command config → defaults**. A config stores an environment-variable name, never its secret value. Dry-run output shows the resolved redacted plan before side effects.

Packaged schemas cover canonical chat examples, embedding records and dataset manifests, chat and embedding training specs/events/artifacts, and preference records. The protocol compatibility matrix declares the tested NPM, Python, platform, and protocol versions. Serialized contracts version independently and reject incompatible majors.

Schema files ship under `schemas/`; consumers should resolve them from the installed package instead of copying them. Chat uses `training-spec-v1.json`, `training-event-v1.json`, and `artifact-manifest-v1.json`. Embeddings use the corresponding `embedding-*` schemas. `protocol-compatibility-v1.json` records the supported cross-package majors. Unknown required identity, incompatible versions, incomplete checkpoints, and unrecognized event order fail closed.

| Contract family      | Identity that must not drift                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Canonical data       | record/schema version, provenance, content hash, leakage group                                               |
| Chat training        | dataset hash, recipe/template revision, mask policy, seed, image                                             |
| Embedding training   | model/tokenizer/config revision, prompts, pooling, padding, normalization, dimensions, objective, split hash |
| Events/checkpoints   | run/attempt, monotonic sequence, completeness, compatibility classification                                  |
| Artifacts/evaluation | relative path, media type, SHA-256, evaluator and dataset revision                                           |

Use `--json` for one machine-readable stdout document and keep progress on stderr. Use `--quiet` where declared. Stdin/stdout, mutation, overwrite, resume, network, cost, and trust behavior are command-specific; inspect the exact help page rather than assuming support.

Resolution is deterministic: an explicit CLI value wins; otherwise the command reads the named environment variable, then the referenced config value, then the documented default. Secret values are never serialized into a resolved plan. `--dry-run` performs parsing, precedence, policy, capability, and cost planning without training or provider mutation; it does not waive schema or license gates.

JSON and JSONL examples in `examples/` are parsed by the docs gate. Schema, public declaration, export, help, recipe, and model references have stale-failure checks. Illustrative snippets are labeled; executable snippets run from clean artifacts.

Next: [CLI reference](/docs/cli-reference) and [models, recipes, and providers](/docs/models-providers).
