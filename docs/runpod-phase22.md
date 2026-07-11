# RunPod training-hardening support

Phase 22 supplies offline contracts and adversarial fixtures for QLoRA, declared single-node distributed modes, recovery, capacity selection, and cost accounting. It does not promote a production recipe or distributed mode without real immutable-model, GPU, kernel, NCCL, memory, reload, evaluation, export, and RunPod lifecycle evidence.

QLoRA profiles pin NF4 four-bit quantization, double quantization, compute precision, required CUDA/bitsandbytes/PEFT kernels, exact architecture-specific target categories, complete target coverage, memory probing, and adapter reload parity. Dense, MoE, hybrid/Mamba, and embedding recipes have distinct gates. An offline module-coverage fixture is contract evidence only; it is not a GPU forward/backward qualification.

Distributed contracts are single-node only. They record visible devices, topology, mode, world size, NCCL evidence, microbatch, accumulation, effective batch, sampler seed, checkpoint world size, and metric tolerance. DDP/FSDP reject missing NCCL evidence. World-size changes reject resume because no reshard path is qualified. Multi-node and spot are unavailable. Simulated eviction does not qualify spot fields, pricing, eviction signals, or lifecycle behavior.

Recovery chooses the newest complete, hash-valid, world-size-compatible checkpoint, skips partial/corrupt candidates, reports the recovery step and bounded loss window, and preserves attempt provenance. Weights-only state is a separately labelled warm start. Periodic, time-based, and emergency checkpoints must be atomically published under the retained run prefix; disposable Pod storage is insufficient.

Capacity alternatives are ranked by recipe VRAM, current availability, and volume locality. Every hardware or price change requires confirmation. Fallback cannot silently alter model, precision, quantization, GPU count, or distributed mode.

Cost reporting keeps plan estimates, elapsed observations, provider billing history, storage, and retained resources separate, with evidence timestamps and uncertainty. Billing may lag. There is no provider hard cap, and control-plane failure can overspend a client estimate. Upload remains disabled by default and requires a separate explicit action plus a named write-credential environment reference. Artifacts, model-card/provenance, and SBOM outputs must be hash verified before upload or reload.

Production chat and embedding support remains unavailable according to the existing evidence-derived support matrix. Real GPU/NCCL/RunPod tests were **not run** on 2026-07-12 because explicit authorization and credentials were absent. No live resource or spend occurred. Hard-dollar caps, generic exec/log REST, spot semantics, and direct Secrets resources remain unavailable.
