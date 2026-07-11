# General-Purpose Fine-Tuning Core Implementation Plan

Date: 2026-07-11  
Status: implementation-ready planning handoff  
Scope basis: `tmp/gg/model-selection-research.md`, `tmp/gg/distillation-research.md`, `tmp/gg/codebase-cli-sdk-research.md`, `tmp/gg/embedding-models-training-distillation-research.md`, plus the current non-Markdown source and configuration.
Execution constraint: all implementation and review agents use model preset `low`, overriding the normal `rpi-fast` model guidance.

## Executive Recommendation

Build the product as two separately versioned but contract-tested packages:

1. The existing TypeScript package, `@amxv/finetuning`, becomes the stable SDK and `finetuning` CLI for canonical datasets, codecs, validation, provider-neutral teacher generation, distillation, manifests, resumability, cost/policy controls, training preparation, and subprocess orchestration.
2. A new Python distribution, tentatively `amxv-finetuning-trainer`, owns Hugging Face tokenizer chat templates, tokenization, assistant-only masks, Transformers/Datasets/TRL/PEFT/Accelerate execution, QLoRA/LoRA/SFT, evaluation, checkpoint resume, and model artifacts.

Ship the first MVP around response distillation and SFT/QLoRA for `Qwen/Qwen3.6-27B`, while implementing and smoke-testing recipes for all five recommended chat variants behind explicit capability/preflight gates. First prove that pipeline cheaply with `Qwen/Qwen3.5-9B`; it is a pilot fixture, not one of the five supported production variants. Then ship first-class embedding training as the next ordered MVP track, led by `Qwen/Qwen3-Embedding-0.6B`, with canonical embedding records, vector/score/ranking distillation, retrieval-aware evaluation, and five locked recipes. Keep canonical chat records free of student control tokens and canonical embedding records free of destructively baked query/document prefixes; apply pinned chat templates or embedding prompt/pooling conventions only in Python at export/training time.

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
- A separately versioned canonical embedding dataset family covering retrieval pairs, positive/negative sets, triplets, scored pairs, STS, classification, clustering, instruction-aware examples, and vector/score/ranking teacher targets with immutable provenance and leakage groups.
- Streaming Sentence Transformers/Hugging Face embedding codecs, deterministic IDs, contamination/dedupe and group-aware split gates, embedding teacher/scorer/reranker boundaries, synthetic query/document generation, hard-negative mining, and resumable/costed distillation.
- Stable embedding SDK exports and `embed` CLI nouns for data creation/import/generation/mining/distillation/validation/evaluation/training/status/resume/export/inspection.
- Versioned TS-to-Python embedding job contracts and executable recipes for the five embedding variants, with architecture-specific pooling, prompts, objectives, preflight, smoke tests, evaluation, checkpoint/resume, and portable export.

### Later extensions

- Preference datasets and DPO/ORPO after chosen/rejected records are part of canonical schema v1.x.
- Local logit distillation and feature distillation as Python plugins with explicit tokenizer/layer alignment contracts.
- Provider batch APIs, remote/Docker/Slurm/cloud runners, Parquet, distributed dedupe, human-review UI, and production-log ingestion.
- Full fine-tuning where hardware permits, multimodal training, long-context expansion, and automated Hub publishing.
- Unified dense+sparse+multi-vector BGE-M3 training, sparse-head GTE portability, online/epoch-refresh negative mining, learned cross-dimensional projection distillation, large-scale distributed MTEB evaluation, and remote embedding-teacher batch providers after the dense embedding MVP is stable.

### Non-goals

- Reconstructing logits or hidden states from black-box API samples.
- Storing or training on hidden chain-of-thought by default.
- Reimplementing Hugging Face Jinja chat-template semantics in TypeScript.
- Running CUDA/PyTorch training inside Node or making CUDA packages NPM dependencies.
- Promising byte-identical replay of nondeterministic provider output.
- Silently converting unsupported roles, tools, multimodal content, metadata, or reasoning conventions.
- Enabling real production-log ingestion before redaction, consent, retention, lineage deletion, and privacy fixtures exist.
- Treating provider/model licensing or distillation permission as globally static.
- Treating chat-response distillation and embedding geometry/relevance distillation as interchangeable, coercing scored relevance to Boolean without a declared threshold, or truncating teacher vectors unless the teacher explicitly supports that Matryoshka dimension.

## State of Current System

The repository is a private ESM TypeScript package at version `0.0.0`. `package.json` exposes the root plus `./core`, `./providers`, `./simulation`, and `./translation`; both OpenAI and Anthropic SDKs are mandatory dependencies. The CLI is one 711-line file with handwritten parsing and flat commands: `simulate-dataset`, `validate-dataset`, `generate-personas`, `translate-dataset`, and explicitly deferred `convert-logs`.

The strongest reusable core is already present:

- `src/core/model.ts` defines semantic system/user/assistant/tool messages, tool schemas, personas, scenarios, and `ConversationTrajectory`.
- `src/core/openai.ts`, `src/core/dataset.ts`, and `src/core/validation.ts` build, serialize, summarize, and deeply validate OpenAI chat fine-tuning rows, including tool-call/result integrity.
- `src/providers/index.ts` defines a narrow provider-neutral model request/response and clients for OpenAI and Anthropic; mapper tests already protect request/response semantics.
- `src/simulation/index.ts` contains deterministic and model-backed persona/conversation generation, tool validation, and filesystem/persistence injection points.
- `src/translation/index.ts` preserves schema-bearing fields while translating content.
- Existing executable verification scripts cover fixtures, CLI behavior, provider config/mapping, persona generation, simulation/tool flows, translation, README workflow, and the deferred log boundary.

The system is not yet a training core. There is no canonical `Dataset`/`DatasetExample` or `EmbeddingRecord`, schema discriminator, generalized codec registry, streaming data plane, dataset lineage, run DAG/state, immutable manifests, idempotency ledger, split/contamination model, chat or embedding distillation record, embedding teacher/scorer/reranker boundary, hard-negative miner, provider capabilities, structured generation contract, usage/cost model, retry/rate/concurrency policy, Python bridge, chat or embedding training specification, retrieval/STS/classification/clustering evaluation model, checkpoint/artifact model, conventional unit test runner, public API report, tarball consumer test, or release automation. OpenAI-format assumptions permeate validation/translation, and no Sentence Transformers/Hugging Face embedding format is modeled. Root exports include fixtures and experimental helpers. `simulation/index.ts`, provider mappers, validation, translation, and the CLI are large and will impede safe extension.

## State of Ideal System

The ideal system has a stable, browser-compatible TypeScript semantic core and Node-only operational adapters. Every operation consumes/produces async iterables, typed results, stable error codes, and immutable content-addressed artifacts. A run is a versioned DAG whose stage identity includes input hashes, normalized config, implementation version, policy version, and code version; interrupted work resumes without duplicate paid calls.

Canonical messages retain semantic roles, typed tool calls/results, optional content parts, provenance, quality annotations, grouping, and split assignment—never target-model tokens. Codecs translate external dataset shapes to/from this IR with explicit loss reports. Python loads the pinned tokenizer revision, validates its exact chat template, renders/inspects tokens, constructs assistant-only masks, and trains from a `TrainingSpec` whose JSON Schema is shared with TypeScript. The trainer streams structured JSONL events and writes a hash-verifiable artifact manifest.

Provider adapters advertise capabilities and retain native envelopes without leaking secrets. Response distillation is a reproducible dataset-production workflow; judging is separately budgeted and attributable. Compliance checks fail closed when source rights, provider terms review, intended use, retention, or student license metadata are missing.

The same product treats embedding training as a distinct first-class workflow over shared manifests, provenance, orchestration, providers, and packaging. Canonical embedding records preserve semantic roles (query/document/text), positives, negatives, scores, labels, instructions, teacher vectors/scores/rankings, corpus and candidate-set identity, group/split lineage, and scale/normalization metadata. Model adapters late-bind prompts, pooling, padding, normalization, dimensions, and native dense/sparse/multi-vector heads. Distillation transfers geometry or relevance, not prose. Evaluation reproduces pinned retrieval, STS, classification, clustering, multilingual, instruction-aware, long-context, efficiency, and dimensionality slices against untuned-base and no-distillation baselines.

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

### Chat students

1. `Qwen/Qwen3.6-27B`: primary dense production student and first full MVP recipe. Use the official unified post-trained checkpoint for response distillation. Default to QLoRA; validate exact license and pinned revision at run time.
2. `Qwen/Qwen3.6-35B-A3B`: primary efficiency/MoE experiment. Use QLoRA only after target-module discovery and adapter save/reload parity pass.
3. `nvidia/Nemotron-Cascade-2-30B-A3B`: reasoning/agentic challenger. Preserve its ChatML and deliberate thinking/non-thinking policy; require a framework/kernel compatibility preflight.
4. `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16`: transparent efficient research student; allow the official Base sibling only for an explicitly separate continued-pretraining workflow. Its hybrid Mamba2/Transformer MoE stack requires target-module and kernel validation.
5. `allenai/Olmo-3.1-32B-Instruct` with an explicit recipe variant for `allenai/Olmo-3.1-32B-Think`: openness/control choice. Never conflate Instruct, Think, and Base templates/objectives.

The recipe registry must pin model/tokenizer revisions, license snapshot/hash, architecture family, expected template hash, reasoning policy, supported task, tested dependency set, LoRA target discovery rules, quantization allowances, minimum hardware class, and known limitations. `Qwen/Qwen3.5-9B` is the low-cost pipeline smoke model only.

### Embedding students

1. `Qwen/Qwen3-Embedding-0.6B`: default community embedding student; decoder-only bi-encoder, last-token/EOS pooling, instruction-aware retrieval, 32–1024 Matryoshka dimensions, and LoRA-first training.
2. `Snowflake/snowflake-arctic-embed-m-v2.0` (Arctic Embed M v2.0): conventional multilingual encoder default; 768 dimensions with published 256-dimensional Matryoshka support, asymmetric retrieval prompts, and full-tuning or LoRA paths.
3. `BAAI/bge-m3`: long-context multilingual specialist with dense, learned-sparse, and ColBERT-style outputs; dense-only is MVP and unified multi-head training is a gated later recipe.
4. `nomic-ai/nomic-embed-text-v2-moe` (Nomic Embed v2 MoE): efficient MoE/reproducibility choice with required task prefixes, masked-mean pooling, 768/256 dimensions, router/load-balancing gates, and native Contrastors fallback.
5. `Alibaba-NLP/gte-multilingual-base` (GTE multilingual base): compact long-context multilingual foundation with dense plus optional sparse output; remote code is never implicit and requires a pinned, reviewed commit.

During Phase 11 preflight, resolve and lock the exact repository ID, immutable model/tokenizer commit SHA, config and remote-code revisions, actual repository `LICENSE`/NOTICE snapshot and digest, architecture metadata, dependency lock, prompt/pooling/padding/normalization conventions, allowed dimensions, and intended-use/license attestation. Research reports Apache-2.0 for all five, but implementation must verify this at the pinned revisions and fail closed on absence, mismatch, ambiguity, or incompatible use. No mutable branch/tag or family-name inference is acceptable.

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
@amxv/finetuning/embeddings      embedding records, builders, validators, split/dedupe
@amxv/finetuning/embeddings/formats embedding codec registry and ST/HF adapters
@amxv/finetuning/embeddings/distillation vector/score/ranking teachers and mining
@amxv/finetuning/embeddings/training embedding specs, recipes, runner facade
@amxv/finetuning/embeddings/evaluation retrieval/STS/classification/clustering reports
@amxv/finetuning/orchestration   manifests, DAG, checkpoints, resume
@amxv/finetuning/node            filesystem, subprocess, locks, secret/env adapters
@amxv/finetuning/experimental/*  unstable logit/feature/remote extensions
```

Core contracts should include `DatasetExampleV1`, `CanonicalMessageV1`, `ContentPartV1`, `ProvenanceV1`, `TransformationV1`, `DecisionV1`, `DatasetManifestV1`, `RunManifestV1`, `StageStateV1`, `TeacherProvider`, `ProviderCapabilities`, `DatasetCodec`, `ChatTemplateDescriptor`, `TrainingSpecV1`, `TrainingEventV1`, `ArtifactManifestV1`, and stable error/issue codes. Public operations accept injected dependencies and return values/reports; only CLI adapters print or exit.
Embedding contracts add `EmbeddingRecordV1`, `EmbeddingDatasetManifestV1`, `EmbeddingTeacher`, `EmbeddingScorer`, `EmbeddingRanker`, `NegativeMiner`, `EmbeddingTrainingSpecV1`, `EmbeddingRecipeLockV1`, `EmbeddingEvaluationSpecV1`, and task-specific typed builders without weakening the chat contracts.

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
finetuning embed data create|import|convert|validate|inspect|split|dedupe|freeze|export
finetuning embed generate queries|documents|pairs
finetuning embed mine negatives
finetuning embed distill vectors|scores|rankings|plan|run|resume|status
finetuning embed models list|info|license|compat
finetuning embed recipes list|show|lock
finetuning embed train init|validate|estimate|run|resume|status|evaluate|export|inspect
finetuning embed evaluate run|compare|inspect
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

Phases 0-7 are the chat MVP, Phase 8 completes its alpha release, and Phases 9-10 are chat/general post-MVP extensions. Phases 11-17 are the first-class embedding MVP and Phase 18 completes the unified chat + embedding alpha release; explicitly marked items within those phases are later embedding extensions. Preserve this order under the existing fast-supervisor: assign one phase at a time, use model preset `low` for every implementation/review/acceptance agent, trust reported passing checks per the supervisor contract, and rotate implementers only under its context rule.

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

### Phase 11 — Embedding Model Locks, Canonical Schemas, and Fail-Closed Preflight (Embedding MVP)

**Goal and definition of done:** Establish the immutable model facts and canonical data contracts on which all embedding work depends. Done when the five embedding recipes have generated lock records (not mutable hand-written claims), every supported record shape validates through a discriminated versioned schema, and preflight refuses unresolved revisions, licenses, remote code, prompt/pooling conventions, dimensions, data rights, or split lineage.

**Files/file areas to read before starting:** Phase 2 canonical schema, hashing, provenance, validation, and manifest modules; Phase 3 run/dataset manifests and stage identity; Phase 6 cross-language schema/version negotiation and recipe registry; Phase 7 Python configuration/preflight/artifact areas; package export maps and generated schema directories. Also read the five embedding model cards/repository metadata at implementation time through the approved documentation tool, but persist only pinned facts and archived license/NOTICE digests.

**Precise implementation work:**

- Add `EmbeddingRecordV1` as a discriminated union, not an optional-field bag: query-document pairs; query with one or more positives/negatives; explicit triplets; Boolean/categorical pairs; scored pairs with scale/direction metadata; STS text pairs; classification/clustering text+label records; instruction-aware records with instruction stored separately; and teacher-vector, teacher-score/margin, or teacher-ranking targets.
- Require deterministic record/content IDs, text/entity/document/corpus IDs, `splitGroup`, optional parent/translation/synthetic-variant groups, task/language/domain, source and source revision, source license/rights attestation, transformations, generator/teacher provenance, hashes, and explicit split state. Model candidate-pool/corpus identity so rankings cannot be detached from what was ranked.
- Define `EmbeddingDatasetManifestV1`, schema IDs, JSON Schema and generated TS/Python bindings. Store large vectors in typed content-addressed shards referenced by digest when inline JSON would be impractical; record dtype, shape, normalization, dimension, model/revision, pooling, prompt, and projection/PCA identity.
- Create a recipe-lock resolver for exactly `Qwen/Qwen3-Embedding-0.6B`, `Snowflake/snowflake-arctic-embed-m-v2.0`, `BAAI/bge-m3`, `nomic-ai/nomic-embed-text-v2-moe`, and `Alibaba-NLP/gte-multilingual-base`. Resolve exact immutable model/tokenizer/config/remote-code commits, actual license/NOTICE files and hashes, dependency constraints, architecture, prompt/pooling/padding/normalization, MRL-safe dimensions, maximum context, native heads, trust policy, hardware class, and known limitations.
- Make preflight fail closed on mutable/unresolved revisions, missing or changed license artifacts, incompatible intended use, missing dataset/teacher-output rights, absent groups/splits/provenance, unreviewed pinned remote code, unknown pooling/prompt/padding/normalization, unsafe requested dimension, incompatible dependencies, or missing contamination scan. Emit stable codes and remediation.

**Required checks and acceptance tests:** Cross-language schema goldens for every record variant; property tests proving stable IDs/hashes independent of object key order; rejection tests for ambiguous pairs, unscaled scores, vector shape/norm errors, ranking IDs outside the candidate pool, missing groups/provenance/licenses, and invalid teacher metadata; mocked repository-lock tests including license mutation and branch/tag rejection; real opt-in pin resolution for all five; JSON/human preflight snapshots; backward-compatibility tests proving chat schemas and Phase 0 exports remain unchanged.

**Risks/fallbacks:** Repository metadata, licenses, or remote code may change; archive digests and block until a reviewed new lock is created. Vector payload size can overwhelm JSONL; keep JSONL metadata canonical and content-address large arrays without changing semantics. If a model cannot be pinned or its rights/conventions cannot be verified, mark that recipe unavailable rather than substituting a sibling.

**Dependencies and concurrency:** Depends on Phases 2, 3, and 6; does not rewrite completed chat phases. Schema/provenance and lock/preflight work can proceed concurrently after names/version rules freeze. This phase blocks Phases 12-18.

### Phase 12 — Embedding Codecs, Streaming Validation, Splits, Dedupe, and Contamination (Embedding MVP)

**Goal and definition of done:** Users can losslessly import, validate, transform, split, freeze, and export embedding datasets at scale. Done when canonical, Sentence Transformers, and Hugging Face-compatible forms round-trip where semantics permit, conversions report every loss, large inputs stream with bounded memory, and leakage/contamination gates deterministically protect evaluation splits.

**Files/file areas to read before starting:** Phase 11 embedding schemas/manifests; Phase 2 codec registry, async sources/sinks, loss reports, OpenAI compatibility wrappers, and validation engine; Phase 3 content-addressed storage/freeze; Phase 5 dedupe, group split, contamination, and compliance rules; CLI context/config/IO/error modules from Phase 1.

**Precise implementation work:**

- Add codecs for canonical embedding JSONL; ST/HF pair columns (`anchor|query`, `positive|document`, optional `negative`); triplet columns; scored/labelled pairs; STS; classification/clustering; multi-positive/multi-negative retrieval records; and teacher-vector/score/ranking sidecars. Format detection must require disambiguation when columns could mean multiple tasks.
- Implement streaming import/export over async iterables, bounded vector/shard IO, immutable manifests, canonical serialization, deterministic IDs, resumable conversion, line/source locations, explicit loss reports, and preservation of unknown external fields in namespaced metadata where safe.
- Implement task-aware validation: required roles, nonempty text, finite score/vector values, score scale/direction, label domain, unique/global IDs, candidate-ranking consistency, positive/negative conflicts, false-negative warnings, dimension/norm consistency, instruction separation, and teacher/model metadata.
- Implement deterministic salted group splits over document/source/entity/time/translation/synthetic lineage, with related items forced together; forbid deriving classification pairs across splits. Add exact hash, normalization-aware text hash, MinHash/near-text and pluggable semantic dedupe, preserving cluster membership and representative rationale.
- Scan train against validation/test and pinned benchmark fixtures; exclude public benchmark queries/corpora from generation/mining pools; write contamination evidence and thresholds to the frozen manifest. Provide `embed data create|import|convert|validate|inspect|split|dedupe|freeze|export` SDK equivalents and CLI commands.

**Required checks and acceptance tests:** Golden ST/HF imports and exports for each data shape; canonical lossless round trips; explicit-loss failures for unsupported conversions; malformed streaming line locations; bounded-memory/backpressure fixture; deterministic IDs/splits across process/OS; no cross-split groups or dedupe clusters; translation/synthetic family grouping; benchmark-canary contamination detection; score/vector invariants; frozen-manifest tamper detection; dry-run/JSON/stdin/stdout/overwrite/error snapshots.

**Risks/fallbacks:** External libraries infer loss inputs from column order; codecs must emit named, locked mappings and never rely on position. Semantic dedupe can be costly/nondeterministic; ship exact+MinHash MVP and gate the pluggable semantic pass with a recorded model lock. If grouping evidence is incomplete, block freeze rather than random-split.

**Dependencies and concurrency:** Depends on Phase 11 and reuses Phases 2-3. Codec adapters, validation rules, and split/dedupe work may run concurrently over frozen schemas; freeze waits for all reports.

### Phase 13 — Embedding Teachers, Synthetic Data, Hard Negatives, and Distillation (Embedding MVP)

**Goal and definition of done:** Vector, relevance-score, and ranking knowledge can be generated or imported through provider-neutral, resumable, costed workflows, and synthetic data/hard negatives are provenance-safe. Done when an offline end-to-end fixture generates queries, mines candidates, obtains teacher targets, filters false negatives, resumes without duplicate paid work, and freezes a train-only distillation dataset without evaluation leakage.

**Files/file areas to read before starting:** Phase 4 provider registry/capabilities/retry/rate/cost/idempotency; Phase 5 distillation stages, judging, filters, compliance and held-out protections; Phase 3 DAG/ledger; Phases 11-12 embedding contracts/manifests/splits; existing provider adapters and redaction/error areas; Python projection/objective contract area from Phase 6.

**Precise implementation work:**

- Define distinct `EmbeddingTeacher` (vectors), `EmbeddingScorer` (scalar/pair margins), `EmbeddingRanker` (ordered/listwise candidates), `SyntheticEmbeddingGenerator`, `NegativeMiner`, and verifier/judge interfaces with capability negotiation. Never route embedding targets through chat-response semantics.
- Vector distillation records teacher dimension, dtype, normalization, pooling/prompt, revision and storage rights; support MSE/cosine targets, learned projection, or training-only PCA. Reject arbitrary truncation unless the teacher lock declares that Matryoshka dimension.
- Score/margin distillation stores calibrated query-candidate scores and scale; support MarginMSE, pairwise logistic/KL, and listwise softmax KL with explicit temperature. Ranking distillation stores corpus/candidate generator/revision, candidate IDs, reranker prompt/config, scores/ranking, calibration, and exclusions.
- Build an immutable pipeline: freeze corpus and groups; split before generation/mining; generate diverse train-only queries/documents/pairs by intent, language, answerability and length; verify document support; dedupe; retrieve candidates; exclude positives, same-group and near-duplicate false negatives; teacher-score/rerank; filter/judge; mine hard-but-wrong negatives; optionally refresh only at declared checkpoint/epoch boundaries; freeze.
- Add independent generation/scoring/judging/mining budgets, request/record IDs, raw-envelope references with redaction, cost/usage, prompts/sampling, source/provider terms attestations, retries, checkpoints and resume. Add dimensionality/Matryoshka multi-loss configuration and provenance for projections.
- Expose SDK builders/services plus `embed generate queries|documents|pairs`, `embed mine negatives`, and `embed distill vectors|scores|rankings|plan|run|resume|status` with dry-run estimates and train/eval boundary reports.

**Required checks and acceptance tests:** Deterministic fake vector/scorer/ranker/generator pipeline; vector shape/norm/projection-fit-on-train-only tests; score calibration and margin/listwise numerical fixtures; candidate/ranking consistency; no held-out content sent to any teacher/miner; false-negative/same-group exclusion; unsupported-query verifier rejection; separate budget accounting; retry/idempotent resume; interrupted mining reconciliation; rights/compliance fail-closed; teacher API capability and retention-policy rejection; JSON event/error snapshots.

**Risks/fallbacks:** Teacher APIs may forbid storage or competitive training; require explicit reviewed terms/rights before calls. LLM-generated queries can be unsupported and rerankers contaminated; retain verifier/audit evidence and disclose limitations. Hard negatives can be false negatives; fall back to conservative thresholded negatives or in-batch-only training. Projection adds hidden training state; hash and export it as a first-class artifact.

**Dependencies and concurrency:** Depends on Phases 3-5 and 11-12. Provider boundaries, deterministic mining, and synthetic generation can proceed concurrently once records/stage contracts freeze; paid/live integrations remain opt-in and cannot precede compliance gates.

### Phase 14 — Embedding TypeScript SDK and CLI Product Surface (Embedding MVP)

**Goal and definition of done:** Embedding workflows are powerful programmatically and discoverable from the terminal without breaking chat users. Done when the stable SDK supports typed composition from dataset creation through export, CLI help demonstrates the common workflows, automation receives stable JSON/events/exit codes, and legacy chat imports/commands remain compatible.

**Files/file areas to read before starting:** Public barrels/export maps/API reports; CLI argv/context/config/IO/help/error/alias modules; Phases 11-13 embedding services; Phase 6 training runner facade; Phase 8 documentation/example test harness; package tarball fixtures.

**Precise implementation work:**

- Publish additive subpaths `./embeddings`, `./embeddings/formats`, `./embeddings/distillation`, `./embeddings/training`, and `./embeddings/evaluation`; root exposes only a small stable happy path. Provide typed `EmbeddingDatasetBuilder`, streaming `EmbeddingRecordValidator`, `EmbeddingSplitPlanner`, codec registry, model/recipe registry, teacher/scorer/ranker/miner registries, `EmbeddingTrainingRun`, evaluator, and artifact inspector.
- Make service APIs accept injected IO/providers/clocks/event sinks and async iterables; return reports/results rather than print/exit. Use stable discriminated errors with record/path/remediation and no secrets.
- Implement the `finetuning embed ...` hierarchy specified above. Every mutating command supports `--dry-run`; every command supports `--config`, `--json`, `--quiet`, deterministic exit codes, progress on stderr, stdin/stdout where meaningful, safe overwrite/resume semantics, and CLI > env references > project config > defaults. Add `--help` examples for pair import, hard-negative mining, score distillation, LoRA training, evaluation, resume, and export.
- Validate config against versioned JSON Schema before side effects; show resolved non-secret config and estimates in plan/dry-run; never make network, download, trust-remote-code, upload, or overwrite behavior implicit. Offer actionable messages for wrong loss/data shape, missing prompts/groups/rights, unsafe dimensions, inadequate effective batch, OOM estimates, and incomplete checkpoints.
- Preserve all existing chat commands, aliases, imports, exit codes, and config precedence. If a future top-level `embed` binary alias is desired, make it an additive wrapper over the same command modules, not a second behavior surface.

**Required checks and acceptance tests:** API declaration snapshots; clean packed-consumer imports for every new subpath; typed SDK examples; CLI process tests for every noun/subcommand, help and examples, config precedence/schema errors, dry-run no-side-effects, JSON parseability, stdout/stderr separation, quiet mode, stdin/stdout, redaction, signal/resume, overwrite protection, and actionable stable errors; complete Phase 0 chat compatibility suite.

**Risks/fallbacks:** A broad API creates compatibility debt; keep provider/native-head details behind registries and experimental extensions. CLI depth can overwhelm users; provide task-led examples and aliases only where unambiguous. Do not introduce a framework migration unless existing modular parsing cannot meet golden behavior.

**Dependencies and concurrency:** Depends on Phases 11-13 interfaces; can overlap late Phase 13 using fake services. SDK barrels, CLI commands, and help/examples can proceed concurrently with disjoint ownership. Blocks public embedding docs/release.

### Phase 15 — Embedding Job Protocol, Python Trainer, and Five Executable Recipes (Embedding MVP)

**Goal and definition of done:** TypeScript and Python execute reproducible embedding jobs for all five locked models. Done when `EmbeddingTrainingSpecV1` is validated on both sides, the Qwen3 embedding LoRA path completes end to end, and every other recipe passes its declared architecture smoke, checkpoint/resume, clean reload, and export gate before being advertised.

**Files/file areas to read before starting:** Phase 6 version negotiation, generated bindings, subprocess/events/artifacts; Phase 7 trainer package, checkpoint/resume and model-card machinery; Phase 11 recipe locks/preflight; Phase 12 manifests; Phase 13 objective metadata; Phase 14 SDK/CLI training facade; Python packaging/lock/config/test areas.

**Precise implementation work:**

- Add independently versioned `embedding.training.v1`, embedding event and artifact schemas with major-version negotiation. Immutable resume fields include model/tokenizer/config/remote-code revisions, data and split hashes, task/column mapping, prompts/pooling/padding/normalization/dimensions, loss/objective, projection, and seed policy; record all allowed runtime changes.
- Python validates again, writes resolved spec/environment/package/GPU manifests, emits structured JSONL events, marks checkpoints atomically, handles signals, restores optimizer/scheduler/scaler/RNG/sampler/global step, and distinguishes full resume from weights-only warm start. Export adapter and optional merged/full model, tokenizer, ST modules, pooling/prompt/normalization/dimension config, native heads, projection, license/NOTICE, evaluation, hashes, and model-card draft.
- Implement common Sentence Transformers/Transformers/Datasets/PEFT/Accelerate paths with BF16, gradient checkpointing, deterministic sampling, `NO_DUPLICATES` batching, accumulation and verified cross-device negatives. Provide MNRL/InfoNCE and cached variants, MarginMSE, cosine/MSE, CoSENT, triplet families, pairwise/listwise KL, and multi-dimensional Matryoshka objectives with data-shape compatibility gates.
- Lock `qwen3-embed-0.6b-lora`: last non-padding/EOS pooling, left padding, instruction on queries (normally not documents), normalized 32–1024 MRL-safe outputs, attention-projection LoRA first, effective-batch checks, optional Flash Attention 2, adapter and merged ST reload.
- Lock `arctic-m-v2-full`: exact asymmetric prompts, encoder pooling, 768 and published 256 dimensions evaluated separately, full BF16 default at ordinary lengths with LoRA fallback, long-context memory probe.
- Lock `bge-m3-dense`: dense 1024-dimensional MVP using the pinned native/FlagEmbedding-compatible path, no invented query instruction, dense native-vs-Transformers/ST parity. Gate unified dense+sparse+ColBERT training/export as a later extension until each head and fusion pass independent tests.
- Lock `nomic-v2-moe-native`: exact `search_query:`, `search_document:`, `classification:`, and `clustering:` prefixes, masked-mean pooling, 768/256 outputs, Contrastors/native fallback, expert-wide LoRA target audit, router determinism/utilization/aux-loss/all-to-all checks and complete expert/router save/load.
- Lock `gte-multilingual-base-full`: exact card formatting/pooling, 768 dense MVP, full BF16 at ordinary lengths with LoRA fallback, explicit pinned reviewed `trust_remote_code` only, clean offline reload. Gate optional sparse output as a later extension until portable export parity exists.
- Add per-recipe precision/LoRA/full-tune/quantization allowances, mixed-precision and distributed behavior, minimum/estimated hardware with one-step memory probe, sequence-length buckets, OOM remediation, checkpoint cadence, and architecture-specific unsupported-state errors. Never equate MoE active parameters with optimizer memory.

**Required checks and acceptance tests:** Cross-language schemas/version mismatch; loss-shape and numerical goldens; tiny offline CPU fixtures; one-step GPU common smoke; Qwen3-Embedding-0.6B LoRA overfit/held-out and interrupt/resume equivalence; opt-in pinned smoke matrix for Arctic/BGE/Nomic/GTE; prompt/pooling/padding/norm/dimension goldens; effective-batch/global-ID false-negative checks; distributed determinism tolerance; adapter/full/native-head save/reload; native-vs-ST cosine agreement; clean-process offline export reload; artifact tamper detection; actionable OOM/incompatibility classification. CI downloads no multi-GB model by default.

**Risks/fallbacks:** Library and architecture support is volatile; use exact tested locks and mark recipes unavailable when gates fail. Full tuning and 8K/32K contexts may exceed community hardware; shorten sequences, use LoRA, accumulation/checkpointing/sharding, or require higher-memory hardware, with estimates labeled as estimates. For Nomic expert targeting or BGE/GTE native heads, prefer the pinned official stack over pretending generic portability.

**Dependencies and concurrency:** Depends on Phases 11-14 and Phase 6 protocol foundation. Common trainer/protocol, evaluation hooks, and model adapters can proceed concurrently after schemas freeze; land Qwen first, then advertise each recipe only after its own gate. Later unified/sparse recipes do not block dense embedding MVP.

### Phase 16 — Embedding Evaluation, Baselines, and Regression Gates (Embedding MVP)

**Goal and definition of done:** Quality claims are reproducible, task-appropriate, contamination-aware, and tied to baselines. Done when deterministic offline fixtures exercise all metric families, pinned MTEB-compatible suites run where practical, multilingual/instruction/dimension slices are reported, and release gates prevent material regression from the untuned base or accepted prior artifact.

**Files/file areas to read before starting:** Phase 12 split/contamination/frozen manifests; Phase 13 teacher/mining provenance; Phase 15 evaluator hooks/artifacts; Phase 5 evaluation/compliance conventions; CLI/SDK evaluation surfaces from Phase 14; generated recipe locks and offline fixture directories.

**Precise implementation work:**

- Define `EmbeddingEvaluationSpecV1` and reports for retrieval (Recall@k, nDCG@10, MRR and declared variants), STS (Spearman/Pearson where appropriate), classification (accuracy/F1), clustering (V-measure and declared metrics), multilingual/language slices, instruction-aware prompt-on/off checks, long-context buckets, output-dimension truncations, latency/throughput/memory and artifact size.
- Integrate a pinned MTEB revision and raw per-task outputs where practical; never compare headline aggregates across incompatible MTEB versions/task sets/evaluator revisions. Keep network/large-corpus suites opt-in and normal CI deterministic/offline.
- Evaluate untuned pinned base, tuned artifact, no-distillation ablation, and random/trivial sanity baseline on identical frozen splits. Add bootstrap/significance intervals for principal retrieval/STS metrics and store exact evaluator/dataset revisions, config and raw results.
- Define recipe/task-specific acceptance thresholds before production runs: no invalid-vector/prompt/pooling regressions; primary metric minimum improvement or bounded non-regression versus base; per-language and dimension floors; no unacceptable loss on protected tasks; resource ceilings. Threshold overrides require recorded rationale/approval, never silent pass.
- Enforce contamination safeguards: benchmark queries/corpora and eval near-neighbors excluded from generation/mining; train-only PCA/projection fitting; canary/hash/semantic scans; teacher contamination limitation disclosed; evaluation fixtures immutable and never used for tuning decisions beyond declared validation.
- Expose `embed evaluate run|compare|inspect` and SDK evaluators returning machine-readable reports and human summaries. Make model-card generation consume signed/hash-verified reports, not copied benchmark text.

**Required checks and acceptance tests:** Hand-computed metric fixtures; deterministic ranking/tie handling; multilingual and prompt-ablation slices; 768/256 and Qwen dimension checks; empty/duplicate/cross-language edge cases; baseline/no-distillation comparison; bootstrap reproducibility; regression pass/fail fixtures; MTEB adapter contract pinned to a tiny local suite; contamination canaries; no eval IDs in generation/mining ledgers; latency/memory schema tests; CLI JSON/comparison snapshots.

**Risks/fallbacks:** MTEB and datasets evolve or are contaminated; pin revisions, preserve raw task results, provide deterministic internal suites, and state comparability limits. Statistical improvements may be noisy; use confidence intervals and minimum effect sizes rather than leaderboard rounding. Do not block local experimentation on production thresholds, but label artifacts non-releasable until gates pass.

**Dependencies and concurrency:** Depends on Phase 12 and Phase 15; evaluation fixtures/specs can be built concurrently with trainer adapters, but final thresholds require baseline runs. Blocks Phase 18 release claims.

### Phase 17 — Unified Documentation and Runnable Chat + Embedding Examples (Embedding MVP)

**Goal and definition of done:** A new user can complete both chat and embedding workflows from data creation through distillation, training, evaluation, resume, and export using CLI or SDK. Done when every documented command/code sample runs in clean offline fixtures, provider/model downloads are explicit, hardware and rights requirements are visible before execution, and migration preserves existing chat guidance.

**Files/file areas to read before starting:** Phase 8 docs/migration/example harness; Phase 14 CLI help and SDK public API; Phases 11-16 schemas, recipes, artifacts and reports; both package manifests/exports; existing docs source only as authorized by the implementation lead; runnable example configs/data/tests.

**Precise implementation work:**

- Restructure navigation around two first-class tracks—chat and embeddings—with a shared concepts section for manifests, providers, compliance, reproducibility and resume. Retain existing chat walkthroughs and add a concise comparison explaining response versus vector/score/ranking distillation.
- Provide a 10-minute offline retrieval LoRA walkthrough, CLI and TypeScript SDK equivalents, exact input rows and output trees, Qwen query/document instruction handling, dry-run/estimate, interruption/resume, evaluation comparison and clean reload/export. Use tiny fixtures in CI; show pinned production recipe locks separately.
- Add runnable examples for scored-pair/margin distillation, vector distillation/projection, synthetic multilingual query generation, hard-negative mining/false-negative filtering, STS and classification/clustering data, Arctic prompts, BGE dense and later hybrid boundary, Nomic task prefixes/MoE cautions, GTE remote-code security, dimensions/Matryoshka, air-gapped operation, and artifact inspection.
- Document every CLI noun/subcommand and stable SDK subpath with config schemas, precedence, JSON/quiet/dry-run/stdin/stdout, exit/error codes, provider credentials by environment reference, cost/budget/resume, and explicit network/download/upload/trust behavior.
- Add loss-by-data-shape chooser; query-vs-document prompt and pooling guide; hardware table with estimated GPU class/disk/time ranges and mandatory one-step probe; mixed precision/distributed/effective-batch/OOM troubleshooting; checkpoint taxonomy; provider/teacher rights, source licensing, Apache license/NOTICE, privacy/compliance and model-card checklist.
- Add NPM/Python version compatibility matrix, schema/protocol migration, legacy chat command/import migration, experimental recipe stability, benchmark caveats, and reproducibility checklist. State that model license does not clear data, teacher-output, privacy, trademark, or regulated-use rights.

**Required checks and acceptance tests:** Execute all offline CLI examples and typecheck/run SDK examples from clean packed NPM plus installed Python wheel; validate links/configs/JSON snippets; snapshot help; verify expected file trees and hashes; secret scanner; documentation accessibility/readability review; migration suite for chat examples; opt-in pinned provider/GPU docs smoke; hardware/license tables generated or checked against recipe locks to prevent drift.

**Risks/fallbacks:** Examples rot as APIs evolve; make them executable acceptance fixtures and derive reference tables from locks/schemas where possible. Production examples are expensive; keep tiny deterministic defaults and clearly gated pinned commands. Avoid claiming exact time/memory; publish ranges and the probe workflow.

**Dependencies and concurrency:** Depends on stable Phase 14 surfaces and Phases 15-16 outputs; docs skeleton and offline examples can begin earlier but final commands/claims wait for acceptance. Chat and embedding docs can proceed concurrently with shared terminology ownership.

### Phase 18 — Unified Packaging, Compatibility, Tests, and Release Readiness (Embedding MVP Completion)

**Goal and definition of done:** Chat and embedding capabilities ship as one coherent, compatible TypeScript product plus a separately versioned Python trainer. Done when packed artifacts install cleanly, public exports and CLIs behave as documented, all five embedding recipes have honest support status, release artifacts contain required licenses/manifests but no secrets or unintended weights, and an independent acceptance review passes the unified plan.

**Files/file areas to read before starting:** NPM/Python manifests, locks, export maps, build/prepack/wheel/sdist scripts, API reports, CLI bin/command registration, generated contracts, CI/release configuration, package-content allowlists, all chat and embedding tests/examples/docs checks, Phase 8 compatibility/release machinery.

**Precise implementation work:**

- Add new stable subpaths and CLI commands additively; curate NPM `files`, types/import export conditions and optional provider dependencies. Keep Python/CUDA outside NPM, publish the trainer wheel/sdist separately, and encode a tested NPM↔Python protocol compatibility matrix.
- Generate/package JSON Schemas, recipe-lock format, tiny offline fixtures, license/NOTICE inventories and artifact inspectors. Do not package large model weights, paid-provider envelopes, secrets, caches, or evaluation corpora lacking redistribution rights.
- Expand unit/property/contract/integration matrices: schemas/hashes/codecs; split/dedupe/contamination; teacher/miner budgets/resume; CLI/API; cross-language protocol; objectives/pooling/prompts/dimensions; evaluation/regression; checkpoint/export; clean offline install/reload. Keep large-model/network/GPU tests opt-in but require recorded pinned results for advertised recipe support.
- Add API/declaration and schema compatibility reports, Node/OS and supported Python/platform matrices, lint/format/type/build/docs, dependency/license/security scans, reproducible pack/build checks, alpha changelog/migration/support policy, and release provenance/SBOM where existing release policy permits.
- Classify each recipe as `supported`, `experimental`, or `unavailable` from machine-readable gates. MVP requires supported dense recipes for all five; unified BGE and optional GTE sparse remain later/experimental. Prevent docs/CLI from claiming support inconsistent with gate evidence.

**Required checks and acceptance tests:** Full existing chat suite; full embedding offline suite; clean `npm pack` consumer for root/all subpaths/bin; clean wheel/sdist installs and protocol handshake across supported versions; CLI help/workflows; packed-content and secret audits; license/NOTICE/provenance inventory; deterministic build/hash where feasible; schema/API backward-compatibility checks; gated pinned smoke evidence for all five; Qwen embedding end-to-end/restart; evaluation regression gates; independent acceptance reviewer using model preset `low`.

**Risks/fallbacks:** Native stacks may force conflicting Python dependencies; isolate adapters/extras or publish a tested compatibility range instead of weakening locks. Package size/export breadth can grow; keep heavy fixtures/native adapters optional and narrow root exports. If any model lacks current smoke evidence, release the framework alpha with that recipe marked unavailable—not as supported—and do not call the five-model MVP complete.

**Dependencies and concurrency:** Depends on Phases 11-17 and reuses Phase 8 release foundations. NPM packaging, Python packaging, CI matrices, and acceptance audit can proceed concurrently once schemas/APIs freeze. This is the embedding MVP completion gate; later distributed/native-head extensions follow without blocking the coherent dense product.

## Global Acceptance Gate

The initiative is ready for stable promotion only when: current public workflows remain compatible; chat and embedding canonical schemas and contracts have documented version rules; OpenAI/canonical/HF chat and ST/HF embedding codecs have round-trip/loss coverage; retries and resume cannot duplicate paid successful calls; compliance fails closed; locked held-out chat or embedding evaluation data never enters teacher generation, mining, or candidate pools; the Qwen3.6-27B primary chat path and Qwen3-Embedding-0.6B primary embedding path train and resume end to end; each other advertised model has passed its declared hardware smoke gate; embedding evaluation clears declared regression thresholds against pinned baselines; clean packed NPM/Python artifacts install and run; and a separate acceptance reviewer validates the implementation against this plan. All implementation, supervision, and acceptance work must use model preset `low` per the initiative override.
