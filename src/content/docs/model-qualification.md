---
title: Model recipe qualification
description: Configure, authorize, smoke, qualify, and support model recipes without overstating evidence.
order: 5
category: Concepts
---

Every planned model recipe is currently **configured** and **unavailable for supported use**. Configuration means its canonical ID, immutable candidate revision, architecture, legal conclusion, optimization shape, runtime plan, and blockers are machine-readable. It does not authorize downloads or training and it is not GPU evidence.

Qualification progresses monotonically from `configured` to `smokeAuthorized`, `smokePassed`, and `qualified`. `supported` is a separate release decision after legal, quality, operational, and compatibility review. Evidence uses a reviewer-trusted Ed25519 signature, hashes the referenced artifact bytes, binds command/image/environment/tokenizer/config/template-or-code/dataset/target/dependency identities, and links each transition to the accepted predecessor digest in a persisted store. The signed architecture identity is the canonical upstream `modelType`; broader family labels remain display/planning metadata. Replay, skipped state, unknown assertions, stale identity, and cross-recipe reuse fail closed. CLI users cannot promote a recipe by setting a status Boolean or by recomputing an unkeyed digest.

## Offline workflow

```sh
finetuning recipes list --json
finetuning recipes inspect --recipe qwen3-embed-0.6b-lora --json
AMXV_QUALIFICATION_TRUST_POLICY_SHA256=<admin-pinned-sha256> finetuning recipes preflight --recipe qwen3-embed-0.6b-lora --store ./qualification-store.json --artifact-paths ./evidence-artifact-paths.json --operation-class mechanicsSmoke --trust-policy /admin/reviewer-trust-policy.json --json
finetuning recipes plan --recipe qwen3-embed-0.6b-lora --json
AMXV_QUALIFICATION_TRUST_POLICY_SHA256=<admin-pinned-sha256> finetuning recipes record-evidence --evidence ./reviewed-evidence.json --artifact ./artifact-manifest.json --trust-policy /admin/reviewer-trust-policy.json --store ./qualification-store.json --json
```

The administrator-controlled trust policy and its expected SHA-256 must be supplied independently of submitted evidence. `evidence-artifact-paths.json` maps every accepted evidence ID in the chain to the local artifact whose bytes it signs. Preflight reloads the persisted store and revalidates every signed Ed25519 envelope, predecessor, expiry, artifact, identity, exact gate decision, phase-specific blocker discharge, and operation class; it does not accept caller-shaped authorization JSON. Store promotion is serialized with an exclusive compare-and-swap lock.

Execution uses a separately issued, time-limited Ed25519 authorization. The trainer receives only the signed authorization and the independently pinned public trust policy through `AMXV_QUALIFICATION_TRUST_POLICY_PATH` and `AMXV_QUALIFICATION_TRUST_POLICY_SHA256`; no signing secret is present in the training process. The authorization binds the current evidence/store digest and sequence, recipe identity, exact operation and operation class, output directory, artifact and dependency bindings, architecture evidence, all gates, phase-specific blocker discharge, expiry, and no-upload policy. A `smokeAuthorized` head permits only `mechanicsSmoke`; `smokePassed` permits `qualificationRun`; and `qualified` permits the narrower `experimentalUse` operations. Cross-phase reuse fails closed. Staging network/download authorization is distinct from offline execution, and upload remains false unless it is both requested and separately approved.

Blocker authorization signs stable blocker codes from the versioned blocker catalog; each code has an explicit phase and human message shared by the lock, SDK, and Python package. `GPU_MECHANICS_EVIDENCE_ABSENT` is intentionally not discharged to authorize the mechanics smoke. It remains the state reason preventing `smokePassed` until signed forward/backward, finite-loss/gradient, checkpoint-resume, and offline-reload evidence is accepted. Only then can qualification/repeated-clean/evaluation/export work be authorized.

Historical predecessor envelopes remain immutable proof after promotion. Their signatures, identities, transitions, and issuance-time validity are always revalidated, but an expired historical authorization does not invalidate a later live head. Current-time expiry applies to the current evidence head and the separately signed execution authorization. Evidence whose expiry was not later than its issuance is never accepted. `plan` only emits a RunPod-oriented GPU, storage, image, and distributed-strategy proposal. It sets `createsResources: false`, `executableEnvironment: false`, makes no network call, spends nothing, and represents the image digest as missing rather than using a runnable-looking placeholder.

The planned first-wave order is Qwen3 Embedding, Arctic Embed, OLMo 3.1 Instruct, OLMo 3.1 Think, Qwen3.6 dense, BGE dense after corrected MIT inventory approval, then GTE dense after external-code review. Each still has blockers and none is smoke-passed, qualified, or supported.

Nomic v2 MoE, both Nemotron variants, Qwen3.6 MoE, BGE sparse/ColBERT/hybrid, and GTE sparse are non-executable in the first wave. Their machine-readable blockers name the missing native lane, custom code/kernel review, packed expert/router evidence, license artifact, or excluded head.

## Trainer semantics

The framework has a cumulative token-boundary masking primitive because the candidate upstream templates do not expose valid Jinja generation spans. The primitive rejects prefix/final drift, empty assistant payloads, and missing assistant EOS tokens. However, upstream template SHA-256 values and model-specific golden reasoning/tool/EOS-pad fixtures have not been captured offline, so every chat recipe explicitly records `templateHash.status=required`, an empty golden-fixture list, and remains blocked. These docs do not claim those model-specific fixtures have passed.

Embedding recipes use a two-tower contrastive objective with in-batch negatives. Uniform hard-negative batches append negatives as candidates; mixed pair/triplet batches are rejected instead of dropping data. Matryoshka recipes compute normalized contrastive loss at every declared dimension and average the losses. Pooling, left/right padding, L2 normalization, query/document prompts, dimensions, negative policy, and native-head exclusions are explicit identity. A required CPU-Torch CI lane checks hand-computed loss, left-padded last-token pooling, finite nonzero gradients, and actual Transformers `Trainer` consumption.

License strings are evidence claims, not authorization. BGE-M3 is MIT; the former Apache assumption is recorded as erroneous and remains blocked pending inventory approval. NVIDIA entries use NVIDIA license references and are never described as Apache. Where the pinned repository lacks a LICENSE artifact, metadata alone cannot open the gate.
