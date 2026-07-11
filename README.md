# finetuning

`@amxv/finetuning` is a private-alpha toolkit for reproducible chat and embedding data, distillation, training orchestration, evaluation, resume, and export. The TypeScript package owns schemas, providers, manifests, CLI, and SDK workflows; the separately versioned Python wheel owns the local trainer boundary.

## Install

```bash
npm install
npm run build
```

Provider SDKs are optional. The five-minute start is deterministic, CPU-only, and uses no credentials, network, download, upload, GPU, or remote code:

```bash
node dist/cli/index.js simulate-dataset \
  --profile sample-receptionist \
  --out tmp/quickstart-chat.jsonl \
  --limit 3 \
  --mode full_tool_trajectory

node dist/cli/index.js validate-dataset tmp/quickstart-chat.jsonl

node dist/cli/index.js embed data validate examples/embedding-offline/records.jsonl \
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

Expected chat result: three valid rows, three tool calls, and three matching tool results. The embedding estimate reports `executable: true`, `network: false`, `uploads: false`, and `trustRemoteCode: false`.

The same offline chat workflow accepts checked-in scenario files such as `examples/receptionist/scenario.json` and `examples/retail-support/scenario.json`.

## Choose a route

- [Chat tutorial](src/content/docs/chat-track.md): generate conversations, preserve tool trajectories, distill responses, train, resume, evaluate, and export.
- [Embedding tutorial](src/content/docs/embedding-quickstart.md): validate retrieval pairs and run the complete CPU train, checkpoint, resume, evaluation, inspection, and export fixture.
- [Documentation index](src/content/docs/quickstart.md): concepts, how-to guides, CLI and SDK references, operations, security, troubleshooting, migration, and release notes.

Chat response distillation transfers generated assistant responses. Embedding vector, score, and ranking distillation transfer geometry or relevance—not prose. Both tracks share immutable manifests, provenance, budgets, provider policies, checkpoint identity, and artifact verification.

## Safety and support status

Every network request, provider credential, model download, upload, overwrite, GPU path, and `trust_remote_code` decision must be explicit. Secrets belong in environment variables referenced by name, never config files. Real-log conversion remains deferred.

Real-log conversion is explicitly deferred: this package does not accept production logs, and it has no public source contract, caller-supplied redaction hooks, or privacy-safe fixture coverage yet. Use only canonical or documented external dataset formats.

Machine-readable support is in [`locks/recipe-support-v1.json`](locks/recipe-support-v1.json). The tiny CPU embedding fixture is supported only as a test fixture; the Qwen 9B chat pilot is experimental; all production chat recipes and all five production embedding recipes are unavailable until their recorded license, hardware, reload, and evaluation gates pass. This repository does not claim the five-model MVP complete.

A model license does not clear dataset rights, teacher-output terms, privacy, trademarks, or regulated-use obligations. See [security and compliance](src/content/docs/security-compliance.md) before using non-synthetic data.

## Verify locally

```bash
npm run verify:product
npm run verify:docs
```

These commands build clean NPM and Python artifacts, run offline chat and embedding workflows, verify public APIs and schemas, inspect hashes, scan packaged content, and confirm that gated recipes stay unavailable. They do not publish packages or run provider, model-download, remote-code, or GPU tests.

Version `0.0.x` is private alpha. See [CHANGELOG.md](CHANGELOG.md), [MIGRATION.md](MIGRATION.md), and [SUPPORT.md](SUPPORT.md).
