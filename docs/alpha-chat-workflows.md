# Alpha chat workflows

This guide separates deterministic CPU/offline examples from network, paid-provider, and GPU/model gates. Nothing here uploads data or downloads a model implicitly.

## Runnable offline path

Build the package, generate canonical OpenAI chat JSONL, validate it, convert through the stable format APIs, and exercise the fake trainer:

```bash
npm run build
node dist/cli/index.js simulate-dataset --config examples/receptionist/scenario.json --out outputs/chat.jsonl --limit 2 --mode full_tool_trajectory
node dist/cli/index.js validate-dataset outputs/chat.jsonl
python3 -m amxv_finetuning_trainer.fake_runner ../examples/offline-training-spec.json
```

The fake runner writes an artifact and hash manifest without PyTorch, CUDA, provider credentials, network access, or model weights. OpenAI-to-canonical and Hugging Face conversational/text conversion are available from `@amxv/finetuning/formats`; inspect conversion loss before accepting output.

## Provider configuration, cost, and policy

[`examples/provider-config.example.json`](../examples/provider-config.example.json) stores environment-variable names, never secret values. CLI flags override environment references, which override project configuration and defaults. Distillation planning requires source-rights, teacher-terms, intended-use, retention, reasoning, and student-license attestations; generation and judging costs are separately accounted. Use fake providers for offline acceptance and explicitly authorize every paid call.

## Qwen pilots and gated production training

`Qwen/Qwen3.5-9B` is a pilot only. Qwen3.6 QLoRA is not an offline example: it requires pinned model/tokenizer/license/template evidence, Python training extras, an explicit download, suitable GPU/CUDA capacity, and a successful preflight. Unresolved recipes fail closed. This alpha does not claim that large-model paths ran in CI.

## Interruption, resume, comparison, and artifacts

Run state and paid-success ledgers are append-only. Resume uses the same immutable dataset, recipe, revisions, template, seed policy, and checkpoint; a weights-only warm start is not a full resume. Compare candidate recipes by preflight status, hardware estimate, quantization allowance, template audit, and limitations before training. Verify `artifact-manifest.json` hashes before consuming an export.

## Migration and extensions

See the [migration guide](../MIGRATION.md) for old commands and imports. `convert-logs` remains deferred. Extension authors should implement provider-neutral contracts, inject I/O, preserve stable error codes and redaction, keep experimental exports isolated, and test deterministic fake implementations before adding network adapters. Embedding workflows intentionally arrive in Phase 17 documentation and are not invented here.
