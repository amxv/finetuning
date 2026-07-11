# Contributing

This repository is a standalone fine-tuning dataset toolkit. Keep changes aligned with the public v1 story: synthetic scenario-driven dataset generation, OpenAI JSONL export, validation, and experimental schema-preserving translation.

## Module Boundaries

- `src/core` owns provider-neutral types, scenario parsing, fixtures, OpenAI row formatting, dataset validation, and explicit deferred feature boundaries. It must not import CLI code, filesystem implementations, provider SDKs, persistence clients, Cloudflare bindings, Hono, D1, queues, or generated output files.
- `src/cli` owns argument parsing, local filesystem reads/writes, and user-facing command output. CLI commands should write only to user-selected paths and should refuse accidental overwrites unless `--force` is passed.
- `src/providers` owns model invocation contracts, provider runtime config/env resolution, and concrete OpenAI/Anthropic adapter wiring. Provider-specific SDK integration stays behind these contracts, not inside `src/core`.
- `src/simulation` owns runtime adapter contracts, scenario loading, filesystem interfaces, persistence interfaces, and future simulation runners.
- `src/translation` owns experimental row-preserving translation transforms and translation adapter contracts.
- `examples` contains checked-in scenario configs only. Generated personas, datasets, translated datasets, and scratch outputs belong in ignored directories such as `outputs/` or `tmp/`.

## Provider Adapters

Provider integrations must be explicit:

- identify the provider and request path in public metadata where relevant
- keep OpenAI chat fine-tuning JSONL as the canonical export format
- keep internal tool schemas provider-neutral until the adapter/export boundary
- do not hide one provider behind another provider's name
- do not add Cloudflare-specific runtime assumptions to reusable modules

Concrete OpenAI, Anthropic, or custom clients should satisfy the adapter interfaces exported from `src/providers` and `src/simulation`.

## Validation Expectations

Any change that affects generated rows, tool calls, tool results, scenario parsing, translation, or CLI output needs focused verification.

At minimum, run:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run verify
```

Use `npm run lint:js:fix` and `npm run lint:python:fix` for safe lint fixes, or `npm run format` to format all supported files. JavaScript, TypeScript, JSON, Markdown, YAML, and other Prettier-supported repository files are formatted with Prettier; Python is checked and formatted with Ruff 0.12.11 targeting Python 3.9. Generated builds, caches, package artifacts, snapshots, pinned RunPod OpenAPI evidence, and vendored dependencies are excluded from formatting.

Validation should cover:

- JSONL rows parse line by line
- every row has at least one message
- assistant tool-call arguments are valid JSON
- tool results reference earlier assistant tool-call ids
- tool result names match the referenced tool call
- `full_tool_trajectory` rows preserve assistant tool call, tool result, and final assistant response order
- translation preserves tool calls, tool results, tool definitions, and schema-bearing metadata

## Deferred Areas

Real-log conversion is deferred. Do not add partial log import behavior unless the work includes:

- a public log record contract
- assistant content extraction rules
- assistant tool-call and tool-result extraction rules
- caller-supplied redaction hooks
- privacy guidance
- privacy-safe redacted fixture coverage
- a converter independent of Cloudflare gateway, queue, Worker, D1, or other backend runtime assumptions

Provider-backed persona generation, simulation, and translation already exist behind explicit adapter/config boundaries. Keep new provider work inside those seams and extend verification when behavior changes.
