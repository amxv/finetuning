# Alpha chat workflows

This guide separates deterministic CPU/offline examples from network, paid-provider, and GPU/model gates. Nothing here uploads data or downloads a model implicitly.

## Complete runnable offline path

The checked-in docs verifier executes this entire journey: create and freeze canonical records, initialize and plan distillation, explicitly select the honestly labelled fake teacher, freeze the distilled dataset, run the CPU trainer, resume from `checkpoint-1.json`, evaluate, export, and verify the artifact manifest.

```bash
npm run build
node dist/cli/index.js simulate-dataset --config examples/receptionist/scenario.json --out outputs/chat.jsonl --limit 2 --mode full_tool_trajectory
node dist/cli/index.js validate-dataset outputs/chat.jsonl
node dist/cli/index.js dataset freeze --input examples/chat-offline/records.jsonl --out tmp/chat-offline/frozen --force --json
node dist/cli/index.js distill init --root tmp/chat-offline/distill --config examples/chat-offline/distillation.json --input examples/chat-offline/records.jsonl --force --json
node dist/cli/index.js distill plan --root tmp/chat-offline/distill --json
node dist/cli/index.js distill responses --root tmp/chat-offline/distill --offline-fake --json
node dist/cli/index.js distill freeze --root tmp/chat-offline/distill --out tmp/chat-offline/distilled --force --json
node dist/cli/index.js training run --spec examples/chat-offline/training.json --python python3 --python-root python --json
node dist/cli/index.js training resume --spec examples/chat-offline/training.json --python python3 --python-root python --checkpoint ../tmp/chat-offline/train/checkpoint-1.json --json
node dist/cli/index.js training evaluate --spec examples/chat-offline/training.json --python python3 --python-root python --json
node dist/cli/index.js training export --spec examples/chat-offline/training.json --python python3 --python-root python --json
node dist/cli/index.js training status --spec examples/chat-offline/training.json --python python3 --python-root python --json
```

The fixture writes a hash-verifiable manifest without PyTorch, CUDA, provider credentials, network access, or model weights. Fake envelopes are attributed only to `custom/offline-fake`.

## Provider configuration, cost, and policy

Provider execution replaces `--offline-fake` with `--allow-network --generation-credential-env OPENAI_API_KEY --judging-credential-env ANTHROPIC_API_KEY --generation-budget-usd 1 --judging-budget-usd 1`. Those are strict gates, not an instruction to run during CI. The reliable adapters provide retries, concurrency, idempotent resume, redacted native envelopes, capabilities, usage and separate budgets.

## Qwen pilots and gated production training

`Qwen/Qwen3.5-9B` is a pilot only. Qwen3.6 QLoRA is not an offline example: it requires pinned model/tokenizer/license/template evidence, Python training extras, an explicit download, suitable GPU/CUDA capacity, and a successful preflight. Unresolved recipes fail closed. This alpha does not claim that large-model paths ran in CI.

## Interruption, resume, comparison, and artifacts

Run state and paid-success ledgers are append-only. Resume uses the same immutable dataset, recipe, revisions, template, seed policy, and checkpoint; a weights-only warm start is not a full resume. Compare candidate recipes by preflight status, hardware estimate, quantization allowance, template audit, and limitations before training. Verify `artifact-manifest.json` hashes before consuming an export.

## Migration and extensions

See the [migration guide](../MIGRATION.md) for old commands and imports. `convert-logs` remains deferred. Extension authors should implement provider-neutral contracts, inject I/O, preserve stable error codes and redaction, keep experimental exports isolated, and test deterministic fake implementations before adding network adapters. Embedding workflows intentionally arrive in Phase 17 documentation and are not invented here.
