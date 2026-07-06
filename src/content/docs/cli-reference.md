---
title: CLI reference
description: Review the supported commands, their high-level purpose, and the most important flags for each workflow.
order: 8
category: Reference
summary: The CLI exposes deterministic defaults first and makes provider-backed paths explicit per command.
---

## Commands

The CLI binary name is `finetuning`. During local development you typically run `node dist/cli/index.js`.

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
