---
title: Troubleshooting and FAQ
description: Recover from validation, configuration, provider, checkpoint, memory, and compatibility failures.
order: 13
category: Operations
---

## Common failures

- **Schema/config error:** run the command with `--dry-run --json`; fix the reported stable code and path. Unknown keys and incompatible majors fail closed.
- **Missing group/provenance:** provide a split group plus source, revision, license, and rights. Do not invent approvals.
- **Output exists:** inspect it, then use resume or an explicit overwrite flag where supported. Never delete a shared artifact blindly.
- **Incomplete checkpoint:** inspect classification. Resume only atomic complete checkpoints; use weights-only artifacts as labeled warm starts.
- **OOM:** run the one-step probe, shorten sequences, reduce microbatch, increase accumulation, enable checkpointing, choose LoRA, or use suitable hardware. MoE active parameters are not optimizer memory.
- **Provider failure or budget stop:** inspect redacted status and ledger. Successful paid requests must not be repeated on resume.
- **Artifact tamper:** stop; do not reload/export. Restore from a verified source or rerun from frozen inputs.
- **Unavailable recipe:** read the machine gate reasons. Do not bypass missing license, remote-code review, hardware, reload, or evaluation evidence.

## FAQ

**Is the default workflow offline?** Yes, only the explicitly documented deterministic fixtures. Provider, download, upload, GPU, and remote-code paths are separate opt-ins.

**Are model benchmarks comparable?** Only with identical dataset/evaluator revisions, prompts, pooling, dimensions, task sets, and contamination policy.

**Can I publish the private-alpha artifacts?** No. Publication requires explicit authority and later acceptance gates.

**Is RunPod supported?** The Phase 20–23 CLI and offline/read-only/dry-run contracts exist. Live Pod or volume mutation is unavailable pending qualification; production recipes, spot, generic exec/log REST, direct Secrets, Serverless, and fleet are also unavailable. No live evidence or spend was produced. See [RunPod execution and support status](/docs/runpod-execution).

Next: [migration and release](/docs/migration-release) or the [support policy](https://github.com/amxv/finetuning/blob/main/SUPPORT.md).
