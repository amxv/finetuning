---
title: CLI reference
description: Review the supported commands, their high-level purpose, and the most important flags for each workflow.
order: 8
category: Reference
summary: The CLI exposes deterministic defaults first and makes provider-backed paths explicit per command.
---

## Commands

The CLI binary name is `finetuning`. During local development you typically run `node dist/cli/index.js`.

Every command page/help output is authoritative for its syntax. Exit `0` means success; usage, validation, policy, provider, budget, unavailable-capability, checkpoint, and artifact-integrity failures are nonzero and expose stable codes where the command supports JSON. Unless help explicitly says otherwise, commands do not read stdin or write result data to stdout, and mutation requires an output path. `--json` reserves stdout for one result document; progress belongs on stderr. `--dry-run` plans without side effects. `--force` may overwrite data and is never implied.

| Surface                                       | Default     | Network/cost                       | Mutation/data-loss boundary                     |
| --------------------------------------------- | ----------- | ---------------------------------- | ----------------------------------------------- |
| deterministic chat generation/validation      | offline     | none                               | writes only explicit `--out`; refuses overwrite |
| provider-backed chat/translation/distillation | opt-in      | paid/provider-dependent            | budget + env reference + resume ledger required |
| embedding data/evaluation fixture             | offline     | none                               | stdin/stdout only where help declares `-`       |
| embedding production model/train              | unavailable | download/GPU may be required later | lock gates must pass first                      |
| RunPod diagnostics and volume list            | read-only   | credentialed read only             | live lifecycle/volume mutation unavailable      |

Configuration precedence is CLI → referenced environment value → command config → default. Never store a resolved secret. With `--json`, stdout contains one result object and diagnostics stay on stderr. A nonzero exit distinguishes usage/config, unavailable capability, policy/license, budget, provider/network, incomplete checkpoint, artifact integrity, and internal failures.

## `generate-personas`

Purpose: generate persona JSON in one batch.

Important arguments:

- `--profile <id>` or `--config <path>`
- `--out <path>`
- `--count <n>`
- `--provider-config <path>`
- `--persona-provider deterministic|openai|anthropic`
- `--persona-model <model>`
- `--persona-api-key-env <ENV_NAME>`
- `--force`

## `simulate-dataset`

Purpose: generate OpenAI chat fine-tuning JSONL from a scenario.

Important arguments:

- `--profile <id>` or `--config <path>`
- `--out <path>`
- `--limit <n>`
- `--mode plain_chat|tool_decision|full_tool_trajectory`
- `--provider-config <path>`
- `--simulation-provider deterministic|openai|anthropic`
- `--simulation-model <model>`
- `--simulation-api-key-env <ENV_NAME>`
- `--force`

## `validate-dataset`

Purpose: validate JSONL and print dataset summary information.

Important arguments:

- positional dataset path
- `--input <path>`

## `translate-dataset`

Purpose: translate natural-language message content while preserving tool-calling schema.

Important arguments:

- positional dataset path
- `--target-locale <bcp47>`
- `--out <path>`
- `--source-locale <bcp47>`
- `--provider-config <path>`
- `--strategy local-pseudo|openai|anthropic`
- `--translation-model <model>`
- `--translation-api-key-env <ENV_NAME>`
- `--force`

## `convert-logs`

Purpose: expose the deferred real-log conversion boundary.

Current behavior:

- exits with the shared deferred-boundary error
- does not accept production log input
- exists to make the v1 boundary explicit rather than implicit

## Noun-oriented chat commands

- `dataset freeze`
- `pipeline status|resume`
- `distill init|plan|responses|resume|status|freeze`
- `template inspect|render|audit`
- `training prepare|run|resume|status|evaluate|export`

These commands use versioned manifests and safe overwrite/resume rules. Run `finetuning <noun> <verb> --help` for exact config, environment, stdin/output, JSON, mutation, cost, network, and version behavior.

## Embedding commands

The complete tested matrix contains 39 command pairs:

- `embed data create|import|convert|validate|inspect|split|dedupe|freeze|export`
- `embed generate queries|documents|pairs`
- `embed mine negatives`
- `embed distill vectors|scores|rankings|plan|run|resume|status`
- `embed models list|info|license|compat`
- `embed recipes list|show|lock`
- `embed train init|validate|estimate|run|resume|status|evaluate|export|inspect`
- `embed evaluate run|compare|inspect`

All 39 help pages are executed by the documentation gate. Mutating embedding commands accept dry-run where implemented; configuration is strict and versioned; CLI flags override environment references, command config, then defaults. Production recipes remain unavailable. See [Configuration and schemas](/docs/config-schemas) and [Models, recipes, providers, and execution](/docs/models-providers).

### Rendered command registry

Every entry uses the exact registered form `finetuning embed <noun> <verb> [--config <path>] [--json] [--quiet] [--dry-run]`. The docs gate executes each corresponding `--help` page and fails if this registry omits a command.

| Group        | Registered commands                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data         | `embed data create`, `embed data import`, `embed data convert`, `embed data validate`, `embed data inspect`, `embed data split`, `embed data dedupe`, `embed data freeze`, `embed data export`         |
| Generate     | `embed generate queries`, `embed generate documents`, `embed generate pairs`                                                                                                                           |
| Mining       | `embed mine negatives`                                                                                                                                                                                 |
| Distillation | `embed distill vectors`, `embed distill scores`, `embed distill rankings`, `embed distill plan`, `embed distill run`, `embed distill resume`, `embed distill status`                                   |
| Models       | `embed models list`, `embed models info`, `embed models license`, `embed models compat`                                                                                                                |
| Recipes      | `embed recipes list`, `embed recipes show`, `embed recipes lock`                                                                                                                                       |
| Training     | `embed train init`, `embed train validate`, `embed train estimate`, `embed train run`, `embed train resume`, `embed train status`, `embed train evaluate`, `embed train export`, `embed train inspect` |
| Evaluation   | `embed evaluate run`, `embed evaluate compare`, `embed evaluate inspect`                                                                                                                               |

### Effects and contracts

| Reference field | Contract                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Capability      | Data inspection, fixture evaluation, and CPU fixture training are offline. Production recipes and unqualified remote mutations fail unavailable.                                                                                                                               |
| Configuration   | `--config` is strict and versioned. CLI flags override environment references, config, then defaults. Credentials are environment-variable names, never stored values.                                                                                                         |
| Input/output    | Data commands accept a positional input or `-` only where their exact help declares it. `--out` controls files or `-`; `--json` reserves stdout for one document and `--quiet` suppresses non-result output.                                                                   |
| Mutation        | `--dry-run` plans without writes. Mutating commands require explicit destinations and refuse overwrite unless their help declares and the caller supplies `--force`. Resume writes only within the bound run directory.                                                        |
| Network/cost    | Offline commands make no network calls. Provider-backed distillation requires explicit network permission, credential references, prices, separate generation/judging budgets, and resume identity. Model downloads, GPU execution, RunPod mutation, and uploads remain gated. |
| Errors/version  | Exit `0` is success. Usage, schema, policy/license, budget, provider/network, unavailable capability, checkpoint, artifact-integrity, and internal failures are nonzero. Serialized data, specs, events, checkpoints, and artifacts carry independently checked versions.      |

## RunPod commands

`runpod init|doctor|plan|launch|status|connect|cancel|stop|terminate|cleanup|resume|fetch|orphans|cost` and `runpod volume list|ensure|delete` are discoverable. Planning and dry runs are offline; status/cost contracts are read-only. Credentialed `volume list` returns pinned provider fields with `ownershipVerified: false`. Live Pod and volume mutations fail before transport because qualification and provider-side ownership evidence are unavailable.

Use [RunPod execution and support status](/docs/runpod-execution) for the exact boundary and retained evidence.
