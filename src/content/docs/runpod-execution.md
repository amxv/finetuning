---
title: RunPod execution and support status
description: Distinguish the available offline and read-only RunPod contracts from unavailable live execution.
order: 12
category: Reference
summary: Phase 20–23 establish pinned contracts and safe diagnostics; live mutations remain fail-closed.
---

## Current boundary

The `finetuning runpod` command surface exists. It supports offline planning, dry-run lifecycle output, read-only diagnostics and credentialed volume listing, plus fake lifecycle and hardening contracts. `volume list` reports pinned provider fields and marks ownership as unverified because the pinned NetworkVolume DTO has no ownership metadata.

Live Pod creation, stop, termination, cleanup, and network-volume ensure or deletion fail closed before a mutation transport call. No authorized live qualification evidence or provider spend was produced. Production recipes, spot semantics, generic exec/log REST, direct Secrets representation, Serverless, and fleet execution remain unavailable.

## Retained phase reports

- [Phase 20: pinned REST and capability status](https://github.com/amxv/finetuning/blob/gg/finetuning-core/docs/runpod-phase20.md)
- [Phase 21: lifecycle and safety status](https://github.com/amxv/finetuning/blob/gg/finetuning-core/docs/runpod-phase21.md)
- [Phase 22: training hardening status](https://github.com/amxv/finetuning/blob/gg/finetuning-core/docs/runpod-phase22.md)
- [Phase 23: Serverless and fleet status](https://github.com/amxv/finetuning/blob/gg/finetuning-core/docs/runpod-phase23.md)

Use `finetuning runpod --help` for the tested command inventory and `finetuning runpod doctor --json` for machine-readable capability status.
