# General-Purpose Fine-Tuning Core Implementation Plan

Date: 2026-07-11  
Status: implementation-ready planning handoff  
Scope basis: `tmp/gg/model-selection-research.md`, `tmp/gg/distillation-research.md`, `tmp/gg/codebase-cli-sdk-research.md`, plus the current non-Markdown source and configuration.  
Execution constraint: all implementation and review agents use model preset `low`, overriding the normal `rpi-fast` model guidance.

## Executive Recommendation

Build the product as two separately versioned but contract-tested packages:

1. The existing TypeScript package, `@amxv/finetuning`, becomes the stable SDK and `finetuning` CLI for canonical datasets, codecs, validation, provider-neutral teacher generation, distillation, manifests, resumability, cost/policy controls, training preparation, and subprocess orchestration.
2. A new Python distribution, tentatively `amxv-finetuning-trainer`, owns Hugging Face tokenizer chat templates, tokenization, assistant-only masks, Transformers/Datasets/TRL/PEFT/Accelerate execution, QLoRA/LoRA/SFT, evaluation, checkpoint resume, and model artifacts.

Ship the MVP around response distillation and SFT/QLoRA for `Qwen/Qwen3.6-27B`, while implementing and smoke-testing recipes for all five recommended variants behind explicit capability/preflight gates. First prove the pipeline cheaply with `Qwen/Qwen3.5-9B`; it is a pilot fixture, not one of the five supported production variants. Keep canonical records free of student control tokens and apply the exact pinned tokenizer template only in Python at export/training time.

## Product Scope

### In scope for the MVP

- A versioned canonical conversation/dataset schema with tools, provenance, transformations, annotations, group IDs, splits, and content hashes.
- Streaming import/export for OpenAI chat JSONL, canonical messages JSONL, Hugging Face conversational records, Hugging Face text records, and deterministic late-bound model rendering.
- Provider-neutral frontier-teacher response generation for the existing OpenAI and Anthropic adapters, including capability negotiation, structured output, concurrency, token/request rate limits, retries, idempotency, usage/cost accounting, budgets, raw-envelope retention with redaction, and resume.
- Append-only response-distillation stages: ingest, group assignment, prompt/candidate generation, validation, policy gates, judging, filtering, exact/near/semantic dedupe, group-aware splitting, contamination checks, freeze, export, train, evaluate, and artifact reporting.
- Stable public TypeScript SDK subpaths and a noun-oriented CLI with aliases for current commands.
- A versioned JSON contract and local subprocess bridge to Python.
- Executable SFT plus LoRA/QLoRA recipes for the five selected variants, with dry-run/preflight, checkpoint/resume, evaluation, and artifact manifests.
- Migration compatibility for current imports, OpenAI helpers, deterministic fixtures, and flat CLI commands.
- Package/tarball/API/CLI/contract/integration tests and alpha NPM release readiness.

### Later extensions

- Preference datasets and DPO/ORPO after chosen/rejected records are part of canonical schema v1.x.
- Local logit distillation and feature distillation as Python plugins with explicit tokenizer/layer alignment contracts.
- Provider batch APIs, remote/Docker/Slurm/cloud runners, Parquet, distributed dedupe, human-review UI, and production-log ingestion.
- Full fine-tuning where hardware permits, multimodal training, long-context expansion, and automated Hub publishing.

### Non-goals

- Reconstructing logits or hidden states from black-box API samples.
- Storing or training on hidden chain-of-thought by default.
- Reimplementing Hugging Face Jinja chat-template semantics in TypeScript.
- Running CUDA/PyTorch training inside Node or making CUDA packages NPM dependencies.
- Promising byte-identical replay of nondeterministic provider output.
- Silently converting unsupported roles, tools, multimodal content, metadata, or reasoning conventions.
- Enabling real production-log ingestion before redaction, consent, retention, lineage deletion, and privacy fixtures exist.
- Treating provider/model licensing or distillation permission as globally static.

## State of Current System

The repository is a private ESM TypeScript package at version `0.0.0`. `package.json` exposes the root plus `./core`, `./providers`, `./simulation`, and `./translation`; both OpenAI and Anthropic SDKs are mandatory dependencies. The CLI is one 711-line file with handwritten parsing and flat commands: `simulate-dataset`, `validate-dataset`, `generate-personas`, `translate-dataset`, and explicitly deferred `convert-logs`.

The strongest reusable core is already present:

- `src/core/model.ts` defines semantic system/user/assistant/tool messages, tool schemas, personas, scenarios, and `ConversationTrajectory`.
- `src/core/openai.ts`, `src/core/dataset.ts`, and `src/core/validation.ts` build, serialize, summarize, and deeply validate OpenAI chat fine-tuning rows, including tool-call/result integrity.
- `src/providers/index.ts` defines a narrow provider-neutral model request/response and clients for OpenAI and Anthropic; mapper tests already protect request/response semantics.
- `src/simulation/index.ts` contains deterministic and model-backed persona/conversation generation, tool validation, and filesystem/persistence injection points.
- `src/translation/index.ts` preserves schema-bearing fields while translating content.
- Existing executable verification scripts cover fixtures, CLI behavior, provider config/mapping, persona generation, simulation/tool flows, translation, README workflow, and the deferred log boundary.

The system is not yet a training core. There is no canonical `Dataset`/`DatasetExample`, schema discriminator, generalized codec registry, streaming data plane, dataset lineage, run DAG/state, immutable manifests, idempotency ledger, split/contamination model, distillation candidate/decision model, provider capabilities, structured generation contract, usage/cost model, retry/rate/concurrency policy, Python bridge, training specification, evaluation model, checkpoint/artifact model, conventional unit test runner, public API report, tarball consumer test, or release automation. OpenAI-format assumptions permeate validation/translation. Root exports include fixtures and experimental helpers. `simulation/index.ts`, provider mappers, validation, translation, and the CLI are large and will impede safe extension.

## State of Ideal System

The ideal system has a stable, browser-compatible TypeScript semantic core and Node-only operational adapters. Every operation consumes/produces async iterables, typed results, stable error codes, and immutable content-addressed artifacts. A run is a versioned DAG whose stage identity includes input hashes, normalized config, implementation version, policy version, and code version; interrupted work resumes without duplicate paid calls.

Canonical messages retain semantic roles, typed tool calls/results, optional content parts, provenance, quality annotations, grouping, and split assignment—never target-model tokens. Codecs translate external dataset shapes to/from this IR with explicit loss reports. Python loads the pinned tokenizer revision, validates its exact chat template, renders/inspects tokens, constructs assistant-only masks, and trains from a `TrainingSpec` whose JSON Schema is shared with TypeScript. The trainer streams structured JSONL events and writes a hash-verifiable artifact manifest.

Provider adapters advertise capabilities and retain native envelopes without leaking secrets. Response distillation is a reproducible dataset-production workflow; judging is separately budgeted and attributable. Compliance checks fail closed when source rights, provider terms review, intended use, retention, or student license metadata are missing.

## Compatibility Strategy

- Preserve current root exports and subpaths for at least one minor release via re-export shims. Add stable exports before deprecating anything.
- Keep `ConversationTrajectory` as generation context; add an explicit trajectory-to-`DatasetExample` conversion rather than changing its serialized meaning.
- Reimplement current OpenAI functions as wrappers over the new codec/validator and require golden byte/semantic parity on existing fixtures.
- Preserve flat commands as aliases: `simulate-dataset` -> `dataset create`, `validate-dataset` -> `dataset validate`, `generate-personas` -> `persona generate`, `translate-dataset` -> `dataset translate`. Keep `convert-logs` deferred.
- Add stable issue codes without removing current human-readable messages initially.
- Version every serialized contract independently (`datasetSchemaVersion`, `runManifestVersion`, `trainingSpecVersion`, `eventProtocolVersion`, `artifactManifestVersion`) and accept only compatible major versions.
- Introduce package subpaths additively. Keep experimental/logit/feature/remote surfaces under `./experimental/*`.
- Make provider SDKs optional peer dependencies or provider-specific optional subpaths using dynamic imports; maintain current convenience factories through shims.

## Recommended Five Student Model Variants

1. `Qwen/Qwen3.6-27B`: primary dense production student and first full MVP recipe. Use the official unified post-trained checkpoint for response distillation. Default to QLoRA; validate exact license and pinned revision at run time.
2. `Qwen/Qwen3.6-35B-A3B`: primary efficiency/MoE experiment. Use QLoRA only after target-module discovery and adapter save/reload parity pass.
3. `nvidia/Nemotron-Cascade-2-30B-A3B`: reasoning/agentic challenger. Preserve its ChatML and deliberate thinking/non-thinking policy; require a framework/kernel compatibility preflight.
4. `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16`: transparent efficient research student; allow the official Base sibling only for an explicitly separate continued-pretraining workflow. Its hybrid Mamba2/Transformer MoE stack requires target-module and kernel validation.
5. `allenai/Olmo-3.1-32B-Instruct` with an explicit recipe variant for `allenai/Olmo-3.1-32B-Think`: openness/control choice. Never conflate Instruct, Think, and Base templates/objectives.

The recipe registry must pin model/tokenizer revisions, license snapshot/hash, architecture family, expected template hash, reasoning policy, supported task, tested dependency set, LoRA target discovery rules, quantization allowances, minimum hardware class, and known limitations. `Qwen/Qwen3.5-9B` is the low-cost pipeline smoke model only.

## Public TypeScript SDK Architecture and Stable Exports

Target exports:

```text
@amxv/finetuning                 common happy path and stable types only
@amxv/finetuning/core            canonical messages, datasets, provenance, errors
@amxv/finetuning/formats         codec registry, detection, conversion/loss reports
@amxv/finetuning/formats/openai  OpenAI chat JSONL compatibility codec/validator
@amxv/finetuning/validation      staged validation engine and stable issue codes
@amxv/finetuning/generation      persona/conversation generation services
@amxv/finetuning/distillation    records, stages, filters, judges, policies
@amxv/finetuning/providers       contracts, capabilities, registry
@amxv/finetuning/providers/openai
@amxv/finetuning/providers/anthropic
@amxv/finetuning/templates       template identities, inspection, compatibility
@amxv/finetuning/training        TrainingSpec, events, artifacts, runner contract
@amxv/finetuning/orchestration   manifests, DAG, checkpoints, resume
@amxv/finetuning/node            filesystem, subprocess, locks, secret/env adapters
@amxv/finetuning/experimental/*  unstable logit/feature/remote extensions
```

Core contracts should include `DatasetExampleV1`, `CanonicalMessageV1`, `ContentPartV1`, `ProvenanceV1`, `TransformationV1`, `DecisionV1`, `DatasetManifestV1`, `RunManifestV1`, `StageStateV1`, `TeacherProvider`, `ProviderCapabilities`, `DatasetCodec`, `ChatTemplateDescriptor`, `TrainingSpecV1`, `TrainingEventV1`, `ArtifactManifestV1`, and stable error/issue codes. Public operations accept injected dependencies and return values/reports; only CLI adapters print or exit.

## CLI Hierarchy and End-to-End Workflows

```text
finetuning dataset create|validate|inspect|convert|translate|split|freeze|export
finetuning persona generate
finetuning synthesize plan|run|resume|status
finetuning distill init|plan|responses|resume|status|freeze
finetuning providers list|inspect
finetuning formats list|inspect
finetuning template inspect|render|audit
finetuning training prepare|run|resume|status|evaluate|export
finetuning pipeline plan|run|resume|status
```

All commands support consistent `--config`, `--json`, `--quiet`, `--dry-run`, `--force`, stdin/stdout `-`, and structured exit codes. Precedence is CLI > environment references/secret resolver > project config > defaults. Persist environment-variable names, never secret values.

Primary response-distillation workflow:

```text
distill init -> distill plan -> distill responses --through freeze
-> dataset inspect -> dataset export --student <recipe>
-> training prepare -> training run/resume -> training evaluate -> training export
```

`distill plan` reports capability compatibility, source/policy warnings, stage counts, token/currency estimate, target coverage, split groups, and hardware/training estimate. It fails closed on missing approvals, held-out leakage, unsupported capabilities, unresolved license/template pins, or a spend limit violation.

## Canonical Dataset, Provenance, Manifests, Run State, and Resumability

`DatasetExampleV1` contains a stable ID, canonical typed messages, optional tools, source/provenance, parent IDs, transformations, decisions, exact/content hashes, dedupe cluster, leakage group, split, metadata, and created time. Large native provider envelopes live as content-addressed blobs; records reference them by digest.

Use append-only JSONL for the MVP data plane, canonical JSON for manifests, and SHA-256 content addressing. Define deterministic canonical serialization before hashing. A frozen dataset directory contains records, blob index, split indexes, JSON Schema IDs, manifest, counts, hashes, lineage roots, policy attestations, and validation report. Parquet can follow without changing canonical semantics.

Run state is keyed by `(runId, stageId, recordId, attempt)` and stored atomically. A stage cache key includes input manifest hashes, normalized stage config, template/rubric/policy hashes, implementation version, and relevant provider/model snapshot. States are `pending|running|succeeded|failed_retryable|failed_terminal|skipped|review`. Recovery converts abandoned `running` leases to retryable without overwriting attempts. Provider requests receive deterministic sample IDs and idempotency keys where supported. Resume never silently pays for an already successful sample.

## Teacher Providers and Structured Generation

Evolve the current `ModelClient` into a capability-aware registry while retaining it as a compatibility facade. `TeacherProvider` exposes `capabilities`, `generate`, and optional batch submission/retrieval. Requests carry canonical messages, tools, response schema, sampling config, provider options, request identity, timeout, and abort signal. Envelopes contain normalized candidates plus redacted native request/response artifact references, provider request ID, model/snapshot/API version, finish reason, usage, timestamps, retry history, and cache/idempotency metadata.

Implement per-provider concurrency semaphores plus token/request buckets, exponential backoff with jitter and server retry hints, bounded retry classes, global/per-stage/per-provider spend budgets, estimated-before/actual-after usage, and currency-aware accounting. Retry transport, timeout, 429, and eligible 5xx failures; preserve and classify refusals, schema failures, and content-policy outcomes without pretending they are transport failures. Structured output uses JSON Schema when advertised, otherwise an explicit parse/repair policy with a bounded new attempt identity. Provider-specific reasoning, safety, tool choice, cache, and batch options remain namespaced.

## Distillation, Quality, Evaluation, and Compliance

Response distillation stages are immutable and independently rerunnable: seed ingestion; leakage-group assignment; taxonomy/quota planning; prompt synthesis/evolution; candidate sampling; structural validation; privacy/policy scan; executable verification; rubric judging; filtering; exact/MinHash/embedding dedupe; group-aware deterministic split; held-out contamination scan; freeze; export.

Preserve all candidates and decisions. Separate generator and judge budgets/providers. Pairwise judging randomizes order, hides provider identity, stores per-dimension structured scores, measures judge disagreement, and is calibrated against a human-labelled sample. Filters annotate rather than delete. Dedupe retains cluster membership and representative rationale. Split on the highest-level shared source/user/document/template/task/semantic group before answer generation where possible; lock validation/test and never send locked test content to generation teachers.

Evaluation has three layers:

- Dataset: schema, role/tool integrity, assistant target presence, length distribution, duplicates, split overlap, contamination, policy findings, coverage quotas.
- Model: held-out loss/perplexity where meaningful, task-specific exact/executable/rubric metrics, format/tool-call correctness, safety and over-refusal, memorization/canary probes, baseline-vs-adapter deltas.
- Operational: tokens/sec, peak VRAM, wall time, cost, checkpoint recovery, load/save parity, inference latency and artifact integrity.

Compliance is a mandatory run gate with intended use, source rights/consent/license, teacher terms document URL/version/review date/approver, student license snapshot, retention/encryption/residency policy, PII/secrets scan, reasoning-storage policy, and lineage deletion. Unresolved status blocks external teacher calls and publishing. Logs and manifests redact keys and sensitive headers.

## Late-Bound Codecs and Chat Templates

Dataset codecs are separate from target chat templates. Initial codecs:

- `openai-chat-jsonl`: current row format with tool semantics and compatibility wrappers.
- `canonical-messages-jsonl`: lossless portable canonical records.
- `hf-conversational`: Hugging Face `messages` records with explicit loss reports for unsupported content/tools.
- `hf-text`: pre-rendered `text` records, output-only by default because reverse parsing is not reliably lossless.
- Optional early adapters for prompt/completion, Alpaca, and ShareGPT once the four required codecs are stable.

Every conversion emits a report for dropped metadata, role flattening, tool loss, parse ambiguity, and unsupported content. The codec layer streams records and never silently discards semantics.

Templates are late-bound descriptors. TypeScript stores target model/tokenizer revision, expected template hash, supported roles/tools, reasoning mode, BOS/EOS/generation-prompt policy, and render audit results. Python uses `tokenizer.apply_chat_template`; a 100-example audit decodes rendered tokens and asserts exactly one BOS policy, correct EOS, assistant-only targets, nonempty loss masks, supported roles/tools, and no duplicated special tokens.

Family policies:

- Qwen3.6 dense and MoE: use the exact pinned Qwen template; explicitly select thinking retention/removal and validate `qwen3` reasoning conventions.
- Nemotron Cascade 2: exact ChatML plus `<think>` policy; no malformed/empty reasoning tags.
- Nemotron 3 Nano: exact hybrid-model tokenizer; Base is completion-oriented and must not inherit instruct formatting accidentally.
- Olmo 3.1: separate Instruct and Think descriptors, EOS rules, and objectives.

## TypeScript-to-Python Training Bridge

Add JSON Schemas under a language-neutral `contracts/` area and generate/check TypeScript and Python bindings. The Node runner invokes an argument array such as `python -m amxv_finetuning_trainer run --spec <path>`; never interpolate a shell. stdout is newline-delimited `TrainingEventV1`, stderr is redacted human diagnostics. Events include protocol/version, sequence, timestamp, run/stage, kind, progress, metrics, checkpoint/artifact references, warnings, and terminal result. Unknown additive event fields are ignored; incompatible major versions fail before GPU allocation.

`TrainingSpecV1` includes model/tokenizer pins, task, immutable dataset/split manifests, template descriptor/hash, max sequence length, packing/truncation and loss-mask policy, precision/quantization, LoRA settings, optimizer/scheduler, gradient accumulation/checkpointing, checkpoint cadence/retention/resume source, evaluation, output location, resource hints, seed, and recipe extension fields.

The Python trainer echoes a resolved spec and writes `ArtifactManifestV1`: environment and package versions, GPU/topology, resolved model/template/license pins, input hashes, checkpoints, trainer state, metrics, adapter/final-model/tokenizer/config paths, logs, evaluation report, failure classification, and output hashes. Node supports cancellation, signal forwarding, timeout, exit classification, atomic status updates, and resume from manifests—not in-memory handles.

## Executable Fine-Tuning Configuration

Common MVP defaults are SFT with assistant-only loss; QLoRA using 4-bit NF4, double quantization, BF16 compute where supported; LoRA rank 32, alpha 64, dropout 0.05; paged AdamW 8-bit or a validated equivalent; learning rate `2e-4` for QLoRA adapters (start `1e-4` for unstable MoE/hybrid cases); cosine schedule; warmup ratio 0.03; gradient clipping 1.0; 1-3 epochs selected by held-out metrics; seed 42; gradient checkpointing; packing off until boundary/mask parity is proven; 4K sequences initially and 8K only after memory profiling. These are recipe defaults, not hardcoded universal truths.

### Qwen3.6-27B

- Default: QLoRA SFT, all linear projection modules discovered and checked against a pinned allowlist; embeddings/lm head excluded unless an explicit vocabulary change exists.
- Hardware: 24 GB is an aggressive short-context/small-microbatch floor; 48 GB preferred for 4K-8K and reliable evaluation. BF16 LoRA requires multi-GPU/model sharding; full FT is out of MVP.
- Checkpoint: adapter, optimizer/scheduler/RNG/trainer state every configurable N steps and at evaluation boundaries; resume parity test required.
- Acceptance: 100-row template audit, 20-step smoke on Qwen3.5-9B, then a short 27B overfit and held-out run; saved adapter reload must reproduce logits/generation within tolerance.

### Qwen3.6-35B-A3B

- Default: QLoRA SFT with discovered attention and routed/shared expert projections; log exact adapted module coverage and reject an empty/partial expert selection unless recipe-approved.
- Hardware: 48 GB recommended; 24 GB only after measured proof with shorter sequences/offload, because all experts remain resident despite ~3B active parameters.
- Use conservative `1e-4` initial LR, gradient checkpointing, and no packing until router/expert/template tests pass.
- Acceptance: forward/backward, expert adapter coverage, checkpoint reload, inference parity, and no router/module mismatch warnings.

### Nemotron Cascade 2 30B-A3B

- Default: QLoRA SFT on the unified post-trained model; recipe chooses thinking or non-thinking outputs and enforces ChatML tags.
- Hardware: 48 GB recommended; multi-GPU fallback when the exact quantized architecture/kernels do not fit.
- Gate on pinned Transformers/PEFT/bitsandbytes (or supported alternative) recognizing the architecture and on a successful adapter save/reload smoke.
- Acceptance: structured/tool examples render correctly, think-tag policy passes, target modules are nonempty/complete, and a short resumed run matches uninterrupted metrics within tolerance.

### Nemotron 3 Nano 30B-A3B BF16

- Default: QLoRA SFT for the post-trained BF16 checkpoint; use the Base sibling only through a distinct continued-pretraining recipe followed by instruction tuning (later extension).
- Hardware: 48 GB recommended for QLoRA; multi-GPU if hybrid Mamba kernels or quantization support require it.
- Target discovery must distinguish attention, MLP/expert, and supported Mamba projections; unsupported 4-bit modules trigger a documented BF16/8-bit LoRA fallback rather than silent omission.
- Acceptance: kernel availability preflight, quantized forward/backward, adapted-module report, checkpoint reload, template audit, and multilingual/code/math sample evaluation.

### Olmo 3.1 32B Instruct/Think

- Default: QLoRA SFT, with separate recipe IDs and templates for Instruct and Think; never mix data modes implicitly.
- Hardware: 48 GB recommended; 24 GB only for carefully measured short-sequence QLoRA; BF16 LoRA/full FT multi-GPU.
- Dense standard projections allow the common target policy, but exact module names remain pinned and tested.
- Acceptance: variant/template mismatch fails preflight, reasoning-policy fixtures pass, adapter reload parity holds, and provenance/model-card artifacts include the unusually strong Olmo lineage information.

All recipes output resolved spec, dependency lock, template audit, dataset manifest, training events/logs, periodic and best checkpoints, adapter config/weights, tokenizer/config references, evaluation report, artifact manifest, and a generated model-card draft. Best-checkpoint selection uses a declared metric and direction. Resume restores optimizer, scheduler, scaler, RNG, sampler position, and global step; a checkpoint lacking required state is classified as weights-only warm start, never full resume.

## Package, Build, Test, Publishing, Docs, and Migration

Keep TypeScript and Python publication boundaries separate. NPM contains no Python/CUDA wheels and dynamically loads optional provider SDKs. Python declares pinned compatible ranges/lockfiles and exposes its own CLI. `package.json` gains Node engines, license/repository/bugs/homepage/keywords/publishConfig, conditional `types`/`import` exports, a curated `files` list, prepack verification, and alpha versioning. Decide explicitly whether CommonJS is unsupported; do not imply it through incomplete exports.

Testing layers:

- TypeScript unit/property tests for canonical schemas, hashes, validation codes, codec round trips, provider policies, cost/rate/retry/idempotency, DAG/cache/resume, and config precedence.
- Golden compatibility tests for current OpenAI JSONL and deterministic fixtures.
- CLI process tests for aliases, noun commands, stdin/stdout, JSON mode, exit codes, overwrite rules, interruption and resume.
- Provider contract tests use injected fake clients and captured synthetic envelopes; live tests are opt-in.
- Cross-language schema fixtures and fake-runner event tests.
- Python CPU unit tests for contracts, masks, config resolution, manifests, and resume classification; GPU smoke tests per architecture in a gated matrix.
- Clean `npm pack` consumer import/bin test and Python wheel/sdist install smoke.
- API report/declaration compatibility, Node/OS matrix, lint/format/typecheck/build/docs checks, dependency/license/security scans.

Docs and examples should cover canonical data, OpenAI/HF conversion, a fake-provider offline distillation run, real OpenAI/Anthropic configuration via env references, cost/policy planning, Qwen3.5-9B pilot, Qwen3.6-27B QLoRA, resume after interruption, recipe comparison, artifact interpretation, migration from old commands/imports, and extension authoring. Existing docs verification remains an acceptance gate during migration but should no longer make core product verification depend on prose internals.

## Ordered Plan Phases

Phases 0-7 are MVP. Phases 8-10 are post-MVP hardening/extensions. Every implementing agent must use model preset `low`.

### Phase 0 — Freeze Behavior and Establish Publication Guardrails (MVP)

**Goal and definition of done:** Current CLI/import/OpenAI/deterministic behavior is captured by conventional tests; package metadata/exports/tarball are testable while the package remains private. Done when current verification passes through the new test harness, API and CLI snapshots exist, and a packed tarball imports/runs in a clean fixture.

**Read before starting:** `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.astro.json`, `astro.config.mjs`, `src/index.ts`, `src/core/index.ts`, `src/providers/index.ts`, `src/cli/index.ts`, all `scripts/verify-*.mjs`, example JSON files.

**Implement:** Add a test runner, lint/format policy, API declaration report, tarball fixture, Node engine/conditional export metadata, CI matrices, and compatibility snapshots. Do not remove `private` or change command behavior. Isolate README-dependent verification from the product aggregate while retaining it as docs CI.

**Checks and acceptance tests:** `npm run typecheck`, build, all existing verification scripts, new unit/CLI/API tests, `npm pack --dry-run`, clean ESM consumer import and bin help, Node/OS matrix.

**Risks and fallbacks:** Export-map changes can break consumers; make only additive/type-map corrections and compare snapshots. If a conventional runner cannot execute built ESM cleanly, test source and packed output in separate projects.

**Dependencies/concurrency:** First phase; blocks public API refactors. CI/package work can run concurrently with test migration after snapshots are frozen.

### Phase 1 — Nonsemantic Modularization and Stable SDK Boundaries (MVP)

**Goal and definition of done:** Large modules are split without output changes and new subpath skeletons exist. Done when old and new imports work, flat CLI behavior is byte/semantically equivalent, and fixtures are no longer required by the minimal root runtime.

**Read before starting:** Phase 0 snapshots; `src/cli/index.ts`, `src/simulation/index.ts`, `src/providers/mappers.ts`, `src/core/validation.ts`, `src/translation/index.ts`, `src/index.ts`, `src/core/index.ts`.

**Implement:** Split CLI argv/IO/context/config and command modules; split simulation loading/personas/loop/tool mapping; split provider mappers; split validator rule areas. Add root/subpath barrel policy and re-export shims. Move bundled fixtures to an explicit examples/testing export without removing compatibility exports yet.

**Checks and acceptance tests:** All Phase 0 tests, deterministic parity, provider mapper fixtures, tool-flow tests, CLI golden output, public declaration diff reviewed as additive.

**Risks and fallbacks:** Circular barrels and shared-worktree drift; internal modules must use narrow imports. Fall back to one module extraction per commit.

**Dependencies/concurrency:** Depends on Phase 0. CLI, simulation, provider mappers, and validation can be extracted concurrently if file ownership is disjoint.

### Phase 2 — Canonical Dataset V1, Streaming Codecs, and Validation (MVP)

**Goal and definition of done:** Canonical data is versioned and OpenAI/canonical/HF conversational/HF text formats round-trip with explicit loss reporting. Done when existing OpenAI fixtures reproduce prior output, large JSONL processing is streaming, and schema/semantic/training-readiness reports use stable codes.

**Read before starting:** `src/core/model.ts`, `src/core/openai.ts`, `src/core/dataset.ts`, `src/core/validation.ts`, `src/translation/index.ts`, related verification scripts and JSON fixtures, Phase 1 export structure.

**Implement:** `DatasetExampleV1`, content parts/tools/provenance/transformations/decisions/groups/splits; JSON Schemas; canonical serialization/hashing; async sources/sinks; codec registry/detection; required four codecs; staged validation and loss reports; trajectory conversion; translation as canonical transform; OpenAI wrappers.

**Checks and acceptance tests:** Schema fixtures in TS, property-based stable serialization/hash tests, OpenAI golden parity, lossless canonical round-trip, HF fixtures, malformed-line locations, tool linkage, async backpressure/large-file memory test, no silent-loss assertion.

**Risks and fallbacks:** Canonical schema may overfit current OpenAI types; keep typed content extensible and preserve external payload refs. HF text reverse parsing remains explicitly unsupported/lossy.

**Dependencies/concurrency:** Depends on Phase 1 boundaries. Schema/hashing, streaming IO, validators, and codecs may proceed concurrently after core interfaces freeze.

### Phase 3 — Immutable Manifests, Orchestration DAG, and Resume (MVP)

**Goal and definition of done:** Every data stage produces immutable manifest-addressed output and resumes safely. Done when forced interruption/restart neither loses completed records nor duplicates stage outputs, and frozen datasets verify by hash.

**Read before starting:** Phase 2 schemas/codecs; filesystem/persistence adapters in simulation; CLI context and Node adapters; `src/core/logs.ts` to preserve the deferred real-log boundary.

**Implement:** Run/dataset/stage manifests, content-addressed blob store, atomic writes, lease/attempt ledger, deterministic stage keys, DAG planner/executor, structured events, status/resume commands, freeze command, lineage-aware deletion interface (implementation can be local-only), secret redaction.

**Checks and acceptance tests:** Crash at every write boundary, stale lease recovery, same-input cache reuse, changed-config cache miss, hash tamper detection, concurrent writer exclusion, redaction tests, freeze immutability, deferred log behavior unchanged.

**Risks and fallbacks:** Filesystem locking differs by OS; use atomic directory/file rename and scoped lock abstraction, with single-process local executor as MVP fallback.

**Dependencies/concurrency:** Depends on Phase 2 IDs/hashes. Manifest schemas and executor can run concurrently after stage identity is settled.

### Phase 4 — Provider Capabilities and Reliable Teacher Generation (MVP)

**Goal and definition of done:** OpenAI and Anthropic can perform capability-checked, structured, budgeted, resumable generation with complete provenance. Done when synthetic fault tests prove retry/rate/idempotency/cost behavior and raw envelopes are redacted and attributable.

**Read before starting:** `src/providers/index.ts`, `config.ts`, `errors.ts`, `openai.ts`, `anthropic.ts`, mapper modules/tests; simulation model-backed flows; Phase 3 run contracts.

**Implement:** Provider registry/capabilities, normalized candidate/envelope/usage/finish models, structured-output schema, abort/timeout, concurrency semaphore, request/token buckets, retry classifier/backoff, idempotency, cost catalog interface, budgets, native provider options, optional dynamic adapter imports, compatibility `ModelClient` facade.

**Checks and acceptance tests:** Fake clock/client tests for 429/5xx/timeouts/refusal/schema failure, no retry of terminal policy outcomes, budget stop before/after usage, concurrent rate enforcement, cancellation, idempotent resume, capability fail-fast, mapper usage/finish parity, secret redaction.

**Risks and fallbacks:** Provider APIs evolve; retain raw envelopes and isolate adapters. Unknown price/model snapshot requires explicit user-provided pricing or blocks cost-enforced runs.

**Dependencies/concurrency:** Depends on Phase 3 ledger; provider adapters can be implemented concurrently once common contracts freeze.

### Phase 5 — Response Distillation and Dataset Quality Pipeline (MVP)

**Goal and definition of done:** A user can plan, run, resume, inspect, and freeze a compliant response-distillation dataset. Done when an offline fake-provider end-to-end run exercises all gates and a gated live smoke records correct lineage/cost.

**Read before starting:** Phase 2 canonical/validation/codecs, Phase 3 DAG/manifests, Phase 4 providers, current scenario/persona/simulation generation and translation transforms.

**Implement:** `DistillationRecordV1`; ingest/group/taxonomy/quota/prompt/candidate stages; structural/policy/heuristic/executable filters; pairwise/rubric judge; exact hash, MinHash and pluggable embedding dedupe; group-aware salted splits; contamination scans; compliance attestations; plan/responses/resume/status/freeze CLI and SDK.

**Checks and acceptance tests:** Deterministic fake pipeline, candidate preservation, independent judge accounting, order-swapped judging, threshold calibration fixture, dedupe clusters, zero cross-split groups, held-out never sent to teacher, compliance fail-closed, PII/secret fixtures, quota and cost reports, interrupted resume.

**Risks and fallbacks:** Semantic dedupe/judges add cost and nondeterminism; make them pluggable, separately budgeted, and allow deterministic lexical-only MVP mode. Legal decisions remain user attestations, not toolkit legal conclusions.

**Dependencies/concurrency:** Depends on Phases 2-4. Deterministic filters/dedupe, judge implementation, compliance, and CLI can proceed concurrently over frozen stage contracts.

### Phase 6 — Template Registry and Cross-Language Contracts (MVP)

**Goal and definition of done:** Target rendering is late-bound and TS/Python agree on versioned specs/events/artifacts. Done when each selected family passes a 100-example render/mask audit and an incompatible protocol fails before training.

**Read before starting:** Phase 2 codecs/schema; Phase 5 frozen artifacts; model-recipe metadata from the approved model research; package/build config. In Python, read only newly created trainer source/config and generated contracts.

**Implement:** Template descriptors/registry/audit reports; model recipe registry for five variants plus Qwen3.5-9B pilot; language-neutral JSON Schemas; generated TS/Python bindings; `TrainingSpecV1`, events, artifacts; fake Python runner; Node spawn/cancel/status adapters.

**Checks and acceptance tests:** Cross-language golden fixtures, schema compatibility matrix, fake-runner ordered/malformed events, cancellation/signals, path/argument injection safety, exact template hashes, BOS/EOS/generation prompt and assistant-mask audits for all families.

**Risks and fallbacks:** New architectures may require newer HF libraries; pin tested versions and fail with actionable preflight. Never substitute a hand-authored template when tokenizer metadata is available.

**Dependencies/concurrency:** Depends on Phase 2 and frozen artifact shape; can overlap late Phase 5. TS contracts/runner and Python contract parser/auditor can proceed concurrently once schemas freeze.

### Phase 7 — Python SFT/LoRA/QLoRA Trainer and Five Recipes (MVP)

**Goal and definition of done:** `training prepare/run/resume/evaluate/export` executes the common defaults and model-specific fallbacks for all five variants. Done when CPU contract tests pass, Qwen3.5-9B completes a real smoke, Qwen3.6-27B completes the primary acceptance run, and each remaining architecture passes gated forward/backward, checkpoint/reload, and template/recipe tests on declared hardware.

**Read before starting:** Phase 6 contracts/recipes; all new Python trainer modules/config; current package scripts/config that invoke the bridge; frozen dataset fixtures and evaluation specs.

**Implement:** Python package/CLI with Transformers/Datasets/TRL/PEFT/Accelerate and quantization adapter; preflight/hardware estimation; tokenizer render/masks; SFT collator; LoRA target discovery/audit; QLoRA and BF16/8-bit fallback; training/evaluation loop; checkpoint/resume; artifact/model-card output; Node training CLI and SDK.

**Checks and acceptance tests:** Python lint/type/unit tests, CPU tiny-model run, Qwen3.5-9B smoke, Qwen3.6-27B short overfit/held-out acceptance, gated smoke matrix for Qwen MoE/Cascade/Nano/Olmo, uninterrupted-vs-resumed metric tolerance, adapter reload generation/logit parity, artifact hash verification, OOM/actionable fallback classification.

**Risks and fallbacks:** 2026 architecture/quantization support is volatile and hardware-expensive. Pin exact model/framework revisions; gate unsupported recipes; fall back from 4-bit QLoRA to 8-bit/BF16 LoRA or multi-GPU; do not claim support until its smoke gate passes.

**Dependencies/concurrency:** Depends on Phase 6. Common trainer, evaluation/artifacts, and architecture-specific recipe adapters can proceed concurrently, but primary Qwen path lands first.

### Phase 8 — Packaging, Documentation, Migration, and Alpha Release (MVP completion)

**Goal and definition of done:** Both distributions are installable, documented, backward-compatible, and releasable as alpha. Done when clean consumers complete the offline walkthrough and the release checklist produces reproducible NPM/Python artifacts without bundled secrets or unnecessary dependencies.

**Read before starting:** Both package manifests/locks/build configs, export maps, CLI manifests, all tests/CI/release config, example JSON/config/code, generated API reports, docs source only as explicitly authorized by the implementation lead.

**Implement:** Final NPM/Python metadata and files boundaries, optional peer provider packages, prepack/wheel checks, release automation, changelog/migration guide, docs/examples listed above, deprecation warnings and support window, alpha stability policy.

**Checks and acceptance tests:** Clean NPM and Python installs, all commands/imports, offline fake-provider E2E, packed artifact content audit, API compatibility, docs links/examples executed, secret/license/dependency scan, old command/import suite.

**Risks and fallbacks:** Publishing too broad an API creates compatibility debt; keep experimental exports isolated and delay promotion rather than removing functionality. Keep package private until every release gate is green.

**Dependencies/concurrency:** Depends on Phases 0-7. Docs/examples, packaging, and migration automation can run concurrently after interfaces stabilize.

### Phase 9 — Preference, Logit, and Feature Distillation Extensions (Post-MVP)

**Goal and definition of done:** Canonical preferences and local advanced distillation are supported without misrepresenting API samples. Done when chosen/rejected lineage is stable and local teacher plugins validate tokenizer/layer alignment.

**Read before starting:** Stable canonical/distillation/training contracts, Python trainer plugin interfaces, evaluation and compliance modules.

**Implement:** Preference record/schema/codecs; DPO/ORPO recipes; local logit top-k/residual-mass contract with vocabulary mapping; feature layer/projection mapping; explicit capability rejections for API teachers.

**Checks and acceptance tests:** Preference pairing/judge provenance, alignment loss tests, local tiny teacher/student experiments, storage bounds, unsupported black-box rejection.

**Risks and fallbacks:** Architecture-specific complexity and huge tensors; keep experimental plugins, top-k approximations explicit, and response distillation as default.

**Dependencies/concurrency:** After MVP contract stability. Preference and local advanced plugins can proceed concurrently.

### Phase 10 — Remote Execution, Scale, and Governed Log Ingestion (Post-MVP)

**Goal and definition of done:** Large/remote pipelines and privacy-safe real-log ingestion are operational. Done when remote status derives from durable manifests and lineage deletion removes source descendants across stores.

**Read before starting:** orchestration/runner/storage/provider contracts, `src/core/logs.ts`, deferred-log verification, compliance/redaction/deletion modules.

**Implement:** Docker/Slurm/cloud runners, provider batches, Parquet/object stores, distributed locks/dedupe, human review integration, production-log source plugin with redaction/consent/retention, lineage deletion, audit exports.

**Checks and acceptance tests:** remote retry/idempotency, object-store fault injection, batch reconciliation, deletion propagation, privacy fixtures, audit trail, continued explicit refusal when governance config is absent.

**Risks and fallbacks:** Distributed consistency and legal/privacy exposure; retain local JSONL executor and keep log ingestion disabled unless every governance gate passes.

**Dependencies/concurrency:** After Phases 3-8. Remote runners and governed ingestion are separate tracks but share manifest/storage contracts.

## Global Acceptance Gate

The initiative is ready for stable promotion only when: current public workflows remain compatible; the canonical schema and contracts have documented version rules; OpenAI/canonical/HF codecs have round-trip/loss coverage; retries and resume cannot duplicate paid successful calls; compliance fails closed; locked held-out data never enters teacher generation; the Qwen3.6-27B primary path trains and resumes end to end; each other advertised model has passed its declared hardware smoke gate; clean packed NPM/Python artifacts install and run; and a separate acceptance reviewer validates the implementation against this plan. All implementation, supervision, and acceptance work must use model preset `low` per the initiative override.
