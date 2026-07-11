# Safe RunPod lifecycle (offline foundation)

Phase 21 defines one Pod per run with exactly one on-demand GPU and an independently retained network volume mounted at `/workspace`. Each run owns `/workspace/runs/<run-id>/{input,checkpoints,events,results,artifacts}`. Shared model caches use `/workspace/cache` with separate ownership, locking, and quota policy. Disposable container storage must never hold the only complete checkpoint.

`finetuning runpod plan --dry-run --job job.json --evidence evidence.json --json` validates GPU count, VRAM evidence, capacity, volume locality, image digest, storage headroom, deadline, current hourly evidence, and estimated `maxUsd`. `maxUsd` is a client estimate, not a provider hard cap. Control-plane loss can outlive the local watchdog, and retained volumes may continue storage billing after compute stops.

The CLI exposes `init`, `doctor`, `plan`, `launch`, `status`, `connect`, `cancel`, `stop`, `terminate`, `cleanup`, `resume`, `fetch`, `orphans`, `cost`, and `volume list|ensure|delete`. Until a manually authorized live probe qualifies the pinned mutation DTOs, mutation verbs accept dry-run only. Termination scopes the owned Pod and retains the volume. Run-prefix and volume deletion are distinct destructive scopes requiring explicit confirmation once enabled.

Status and logs reconcile provider state with append-only durable files. Connect guidance is limited to verified SSH, Jupyter, and IDE port mappings. There is no generic exec/log REST API. Resume accepts complete compatible checkpoints only; weights-only or partial checkpoints are not full resume. Artifact fetch verifies SHA-256 before use.

The four unresolved boundaries remain unavailable: provider hard-dollar cap, generic exec/log REST, qualified spot behavior, and a direct Secrets resource. Job specs and state contain only environment-variable names, never secret values. Upload/publishing credentials are a separate explicitly requested workflow.

Live status on 2026-07-12: **not run**. `RUNPOD_LIVE_TEST=1` and the required explicit credential, ownership, GPU, runtime, and spend authority were absent. No Pod or volume was created and no spend occurred. Real lifecycle feasibility therefore remains a final acceptance blocker.
