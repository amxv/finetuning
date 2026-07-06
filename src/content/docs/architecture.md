---
title: Architecture
description: Understand the package boundaries, workflow ownership, provider seams, and deferred log-conversion boundary.
order: 9
category: Reference
summary: The toolkit keeps `src/core` provider-neutral while pushing provider SDKs and runtime config into dedicated adapter layers.
---

## Scope

This repository is a standalone fine-tuning dataset toolkit. It was extracted from a receptionist backend, but the public package is not a receptionist runtime and does not depend on Cloudflare Workers, Hono routes, D1 storage, queues, or dashboard data models.

## Source boundaries

Current source ownership is:

- `src/core`: provider-neutral data model, OpenAI JSONL row formatting, validation, and fixtures
- `src/providers`: provider runtime config/env resolution plus concrete OpenAI and Anthropic adapters
- `src/simulation`: scenario loading, deterministic persona generation, model-backed persona generation, deterministic simulation, model-backed simulation, and runtime IO boundaries
- `src/translation`: local-pseudo and provider-backed schema-preserving translation adapters
- `src/cli`: argument parsing, config-file reading, output writing, and workflow orchestration
- `src/index.ts`: public package aggregator and workflow manifests

`src/core` must not import provider SDKs, CLI code, filesystem implementations, Cloudflare-specific runtime code, or generated outputs.

## Workflow status

| Workflow | Status | Public surface |
| --- | --- | --- |
| Synthetic dataset generation | V1 | `simulate-dataset` |
| Persona generation | V1 | `generate-personas` |
| Dataset validation | V1 | `validate-dataset` |
| Dataset translation | Experimental | `translate-dataset` |
| Log-to-dataset import | Deferred | `convert-logs` exits with a shared deferred error |

## Provider model

The canonical export target is OpenAI chat fine-tuning JSONL. Provider-backed behavior is explicit and config-driven:

- deterministic persona generation and simulation stay available offline
- model-backed persona generation supports OpenAI and Anthropic
- model-backed simulation supports OpenAI and Anthropic
- provider-backed translation supports OpenAI and Anthropic
- local-pseudo translation remains the offline default

Internal tool schemas stay provider-neutral until adapter or export boundaries map them to provider-specific formats.

## Output guarantees

At the file-format boundary, the toolkit guarantees:

- OpenAI-compatible JSONL rows
- ordered `system`, `user`, and `assistant` messages for plain chat
- ordered `system`, `user`, `assistant`, `tool`, `assistant` messages for full tool trajectories
- tool definitions included when relevant for tool-calling rows
- validation coverage for malformed tool calls, tool result references, duplicate ids, and dataset summaries
- translated output that preserves tool calls, tool results, tool definitions, and schema-bearing metadata

## Deferred log conversion

Real-log conversion remains intentionally unavailable until the repo has:

- a public log record contract
- assistant content extraction rules
- assistant tool-call extraction rules
- tool-result extraction rules
- caller-supplied redaction hooks
- privacy guidance
- privacy-safe redacted fixtures
- runtime-independent converter implementation

Until then, `convert-logs` is only a discoverable deferred boundary.
