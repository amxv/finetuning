# finetuning

`@amxv/finetuning` is a TypeScript SDK and CLI for building reproducible chat and embedding fine-tuning workflows. It turns source data into validated, provenance-aware datasets; supports teacher distillation; coordinates training and resume; evaluates results; and exports hash-verifiable artifacts.

The project exists to make the parts around a training loop explicit and repeatable. Data rights, provider choices, budgets, split isolation, recipe identity, checkpoints, and artifact hashes are contracts—not assumptions hidden in a notebook.

The TypeScript package owns data, schemas, providers, orchestration, evaluation, and the developer-facing CLI/SDK. A separately versioned Python package, `amxv-finetuning-trainer`, owns the model-training runtime. Both sides validate the same versioned contracts and fail closed on incompatible major versions.

> **Project status:** `0.0.x` is a private alpha. The checked-in local fixtures are supported for development and CI; production chat and embedding recipes are not yet supported. See [Support and model readiness](#support-and-model-readiness).

## What you can build

- **Chat datasets and response distillation:** generate complete conversations and tool trajectories, or curate teacher responses from frontier models so a smaller model can reproduce the desired behavior, quality, and style.
- **Embedding datasets and distillation:** import or create retrieval, similarity, classification, and clustering data; preserve split groups and provenance; and distill teacher vectors, relevance scores, or rankings.
- **Training and recovery:** freeze immutable inputs, validate job contracts, run deterministic CPU fixtures, classify checkpoints, resume compatible runs, and reject mismatched identities.
- **Evaluation and artifacts:** evaluate task-specific metrics, compare compatible reports, export model artifacts, and verify relative paths, sizes, and SHA-256 hashes.
- **Provider and remote planning:** opt into OpenAI or Anthropic adapters and inspect safe RunPod control-plane contracts without silently enabling network calls, spend, uploads, model downloads, remote code, or live infrastructure mutation.

## Install from source

Node.js 20.19, 22, and 24 are tested. The current package is private and is not presented as a published npm release.

```bash
git clone https://github.com/amxv/finetuning.git
cd finetuning
npm install
npm run build
node dist/cli/index.js --help
```

Provider SDKs are optional peers and load only when selected. The local examples below require no credentials, network access, model download, upload, GPU, or remote code.

## Five-minute offline quickstart

### Chat and tool trajectories

Generate three deterministic receptionist conversations, each containing an assistant tool call, its matching tool result, and the final assistant response:

```bash
node dist/cli/index.js simulate-dataset \
  --config examples/receptionist/scenario.json \
  --out tmp/receptionist.jsonl \
  --limit 3 \
  --mode full_tool_trajectory

node dist/cli/index.js validate-dataset tmp/receptionist.jsonl
```

The validator reports three rows, three tool calls, three tool results, and `Dataset is valid.` A second runnable scenario is available at `examples/retail-support/scenario.json`; bundled profiles can also be selected with `--profile sample-receptionist` or `--profile sample-retail-support`.

### Embedding data and training estimate

Validate the checked-in retrieval pairs and inspect the executable CPU fixture before training:

```bash
node dist/cli/index.js embed data validate \
  examples/embedding-offline/records.jsonl \
  --task pair \
  --columns query=query,document=document \
  --split-group-column group \
  --source offline-fixture \
  --source-revision 1 \
  --license CC0-1.0 \
  --rights approved \
  --json

node dist/cli/index.js embed train estimate \
  --config examples/embedding-offline/training.json \
  --json
```

Validation returns `valid: true` for two records. The estimate reports an executable run with `network`, `uploads`, and `trustRemoteCode` all set to `false`. Continue through train, checkpoint, resume, evaluation, comparison, inspection, and export in the [offline embedding tutorial](src/content/docs/embedding-quickstart.md).

## End-to-end workflows

### Chat response distillation and SFT

Response distillation generates and curates teacher outputs—often from a more capable frontier model—then preserves the selected responses as training examples for a smaller student. It transfers behavior, task quality, and style through response text and tool use; it is different from copying model weights or embedding geometry.

The complete offline workflow is runnable with the deterministic fake teacher:

```bash
node dist/cli/index.js dataset freeze \
  examples/chat-offline/records.jsonl \
  --out tmp/chat-offline/frozen --force --json

node dist/cli/index.js distill init \
  --root tmp/chat-offline/distill \
  --config examples/chat-offline/distillation.json \
  --input examples/chat-offline/records.jsonl \
  --force --json

node dist/cli/index.js distill plan \
  --root tmp/chat-offline/distill --json

node dist/cli/index.js distill responses \
  --root tmp/chat-offline/distill --offline-fake --json

node dist/cli/index.js distill freeze \
  --root tmp/chat-offline/distill \
  --out tmp/chat-offline/distilled --force --json

node dist/cli/index.js training run \
  --spec examples/chat-offline/training.json \
  --python python3 --python-root python --json
```

Provider-backed generation is an explicit advanced path. It requires a provider and exact model, credential environment-variable names, `--allow-network`, and separate positive generation and judging budgets. Requests carry stable identities, and the resume ledger preserves successful paid results instead of purchasing them again. Held-out answers remain locked away from teachers. See the [chat tutorial](src/content/docs/chat-track.md), [distillation guide](src/content/docs/distillation-guide.md), and [provider configuration](src/content/docs/provider-config.md).

### Embedding data, distillation, training, and evaluation

Embedding workflows keep task semantics and leakage controls attached to every record. Shared sources, users, documents, templates, or semantic families belong in the same split group. Provenance records the source revision, license, and rights decision.

Choose the distillation signal that matches the teacher and student:

| Target   | What is transferred             | Typical use                                         |
| -------- | ------------------------------- | --------------------------------------------------- |
| Vectors  | Teacher embedding geometry      | Compatible teacher/student spaces                   |
| Scores   | Graded query-document relevance | Calibrated retrieval supervision                    |
| Rankings | Relative candidate order        | When ordering is more reliable than absolute scores |

The CLI provides `embed distill vectors|scores|rankings|plan|run|resume|status`, plus dataset creation/import/conversion, hard-negative mining, training, evaluation, comparison, inspection, and export. Current distillation execution uses deterministic fake services and reports no network use; it does not claim provider-backed embedding teachers.

Training binds model revision, prompt convention, pooling, padding, normalization, dimensions, objective, and split hash into the run identity. Evaluation supports retrieval recall/MRR and task-specific similarity, classification, and clustering metrics. Compare reports only when dataset and evaluator revisions match, and verify the exported `embedding-artifact-manifest.json` before reload. See [embedding recipes](src/content/docs/embedding-recipes.md), [evaluation and artifacts](src/content/docs/evaluation-artifacts.md), and the [complete embedding CLI reference](src/content/docs/cli-command-reference.md).

## TypeScript SDK

The public export map separates browser-safe data and planning modules from Node-only filesystem, subprocess, secret, and execution adapters.

Validate a canonical chat record:

```ts
import type { DatasetExampleV1 } from "@amxv/finetuning/core";
import { validateDatasetExample } from "@amxv/finetuning/validation";

const example: DatasetExampleV1 = {
  datasetSchemaVersion: "1.0.0",
  id: "sdk-chat-example",
  messages: [
    { role: "user", content: [{ type: "text", text: "Hello" }] },
    { role: "assistant", content: [{ type: "text", text: "Hello!" }] },
  ],
  provenance: {
    source: "docs",
    sourceId: "sdk-chat-example",
    license: "CC0-1.0",
  },
  createdAt: "2026-07-12T00:00:00.000Z",
};

console.log(validateDatasetExample(example).valid);
```

Build, validate, and split embedding records:

```ts
import { EmbeddingDatasetBuilder, EmbeddingRecordValidator, EmbeddingSplitPlanner } from "@amxv/finetuning/embeddings";

const builder = new EmbeddingDatasetBuilder();
const records = builder.records();
const validation = await new EmbeddingRecordValidator().validate(
  (async function* () {
    yield* records;
  })(),
);
const split = new EmbeddingSplitPlanner().plan(records, { salt: "example-v1" });

console.log({ validation, split });
```

These examples use shipped exports and are exercised from a clean packed consumer. Optional OpenAI and Anthropic adapters are available through `@amxv/finetuning/providers`; operational adapters live under `@amxv/finetuning/node`, `@amxv/finetuning/execution`, and `@amxv/finetuning/execution/runpod`. See the [SDK reference](src/content/docs/sdk-api.md) for the full stable surface and experimental boundary.

## Canonical data, provenance, and resume

Both tracks use append-only JSONL for records and canonical JSON manifests for identity. Freezing a dataset binds its versioned records and SHA-256 hash. Subsequent plans bind that manifest to configuration, provider decisions, recipe/template identity, checkpoints, evaluation, and export.

Resume is identity-aware rather than “start near this file.” Run, stage, record, and attempt keys preserve history; completed paid calls are reused; and atomic checkpoints are classified as full resume, weights-only warm start, incomplete, or incompatible. A changed dataset hash, model/tokenizer revision, template, split, or other immutable field prevents unsafe adoption.

## Python training runtime

`amxv-finetuning-trainer` is a separate Python 3.9+ package. Its dependency-free base validates contracts and runs the supported CPU fixtures; Transformers, Datasets, TRL, PEFT, Accelerate, tokenizers, and platform-appropriate bitsandbytes support are optional training extras and are not bundled into npm.

```bash
uv build python --out-dir tmp/python-dist
uv venv tmp/trainer-venv
uv pip install --python tmp/trainer-venv/bin/python \
  --no-deps tmp/python-dist/*.whl
tmp/trainer-venv/bin/python \
  -m amxv_finetuning_trainer.cli --help
```

The Python CLI supports `prepare`, `run`, `resume`, `status`, `evaluate`, `export`, and `verify`. It revalidates each versioned job, emits ordered JSONL events, writes complete checkpoints atomically, and produces a hash-verifiable artifact manifest. Installing training extras does not enable a production recipe or implicitly authorize weights, GPU use, remote code, or uploads. See the [Python trainer reference](src/content/docs/python-trainer.md).

## Architecture

| Boundary                                    | Responsibility                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `core`, `formats`, `validation`             | Canonical chat records, codecs, schemas, and integrity checks                                 |
| `embeddings/*`                              | Embedding records, formats, distillation, training, and evaluation                            |
| `providers/*`, `generation`, `distillation` | Optional teachers, capabilities, budgets, retry, and lineage                                  |
| `templates`, `training`                     | Immutable chat recipe identity and Python job contracts                                       |
| `orchestration`, `node`                     | DAG state, resume, filesystem, subprocess, locks, and secrets                                 |
| Python trainer                              | Tokenization/templates, masks, pooling, model execution, checkpoints, and reload verification |
| `execution`, `execution/runpod`             | Provider-neutral jobs and safe remote control-plane contracts                                 |

Read the [architecture guide](src/content/docs/architecture.md) and [concepts](src/content/docs/concepts.md) for the contract model in more detail.

## RunPod boundary

`finetuning runpod` provides pinned offline contracts, planning, dry-run lifecycle output, read-only diagnostics, credentialed volume listing, and fake lifecycle/hardening verification. `finetuning runpod doctor --json` reports the machine-readable capability boundary.

Live Pod creation, stop, termination, cleanup, and network-volume mutation fail closed before a mutation transport call. No authorized live qualification or spend evidence exists. Production recipes, spot execution, generic exec/log REST, direct Secrets representation, Serverless, and fleet execution remain unavailable. This is a safe control-plane and contract surface, **not a claim of live production qualification**. See [RunPod execution and support status](src/content/docs/runpod-execution.md) and the retained [control-plane](docs/runpod-phase20.md), [lifecycle](docs/runpod-phase21.md), [hardening](docs/runpod-phase22.md), and [Serverless/fleet](docs/runpod-phase23.md) evidence.

## Support and model readiness

[`locks/recipe-support-v1.json`](locks/recipe-support-v1.json) is the support authority. Missing evidence fails closed to `unavailable`.

| State            | Current scope                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------- |
| **Supported**    | `cpu-tiny-embedding-fixture`, for offline testing only; this is not production model support  |
| **Experimental** | `qwen3.5-9b-pilot` chat recipe; non-production and without passed GPU/reload/evaluation gates |
| **Unavailable**  | Six production chat recipes and five production embedding recipes                             |

Unavailable chat recipes are `qwen3.6-27b`, `qwen3.6-35b-a3b`, `nemotron-cascade-2-30b-a3b`, `nemotron-3-nano-30b-a3b`, `olmo-3.1-32b-instruct`, and `olmo-3.1-32b-think`. Their pinned-license, GPU smoke, clean reload, and evaluation gates have not passed.

Unavailable embedding recipes are `qwen3-embed-0.6b-lora`, `arctic-m-v2-full`, `bge-m3-dense`, `nomic-v2-moe-native`, and `gte-multilingual-base-full`. Exact revisions, prompt/pooling conventions, dimensions, dependencies, remote-code requirements, and blockers live in [`locks/embedding-models-v1.json`](locks/embedding-models-v1.json). BGE-M3 is specifically held unavailable because upstream metadata declares MIT while prior research expected Apache-2.0; a reviewed license artifact at the pinned revision is required to resolve the conflict.

No production chat or embedding recipe is currently claimed as supported. Model status also does not clear dataset rights, teacher-output terms, privacy, trademarks, or regulated-use obligations.

## Safety and compliance

- Network requests, paid calls, credentials, model downloads, uploads, overwrites, GPU paths, and `trust_remote_code` require explicit choices.
- Secrets are referenced by environment-variable name and must not be stored in configs, datasets, logs, or artifacts.
- This repository bundles no model weights, provider responses, third-party evaluation corpora, or third-party runtime code. Verify upstream licenses and notices at the pinned revision before use.

Review [security and compliance](src/content/docs/security-compliance.md), [operations and compliance](src/content/docs/operations-compliance.md), and [SUPPORT.md](SUPPORT.md) before using non-synthetic data or external services.

## Documentation

- [Quickstart and documentation map](src/content/docs/quickstart.md)
- [Chat response distillation and SFT](src/content/docs/chat-track.md)
- [Offline embedding tutorial](src/content/docs/embedding-quickstart.md)
- [CLI reference](src/content/docs/cli-reference.md)
- [TypeScript SDK reference](src/content/docs/sdk-api.md)
- [Configuration schemas](src/content/docs/config-schemas.md)
- [Validation](src/content/docs/validation.md)
- [Troubleshooting and FAQ](src/content/docs/troubleshooting-faq.md)
- [Migration and release](src/content/docs/migration-release.md)

## Development and verification

```bash
npm run typecheck
npm run lint
npm run format:check
npm run verify:product
npm run verify:docs
npm run docs:check
```

The verification suite builds the TypeScript package, exercises offline chat and embedding workflows, checks the public API and CLI snapshots, builds clean npm and Python artifacts, validates hashes and release metadata, and confirms that gated capabilities remain unavailable. It does not publish packages or run paid providers, model downloads, remote code, GPU jobs, or live RunPod mutations.

Contributions are welcome within the documented alpha boundaries. Read [CONTRIBUTING.md](CONTRIBUTING.md), [CHANGELOG.md](CHANGELOG.md), and [SUPPORT.md](SUPPORT.md) before opening a change.

## License and notices

The repository is licensed under [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution and distribution guidance. You remain responsible for the licenses and terms of datasets, teacher outputs, models, evaluation corpora, and optional provider integrations used with the toolkit.
