# finetuning

Toolkit for generating, validating, and localizing fine-tuning datasets for OpenAI chat models, extracted from a receptionist-oriented internal backend and generalized into a standalone repository.

## Current status

This repository is being bootstrapped from an implementation plan.

- Implementation plan: `gg/agent-outputs/fine-tuning-oss-extraction-plan-2026-07-06.md`
- Default branch: `main`
- Initial implementation mode: RPI-fast on `main` without managed worktrees, per lead override

## Recommended v1 scope

The first public release is scoped to synthetic scenario-driven dataset generation for chat and tool-calling assistants. The v1 target includes persona generation, OpenAI chat fine-tuning JSONL export, full tool-trajectory rows, dataset validation, and one receptionist example profile.

Translation is experimental until provider routing, field-preservation rules, and validation are implemented in the standalone package. Real-log conversion is deferred until there is a public log contract, redaction story, and privacy-safe fixture coverage.

Receptionist backend concerns are explicitly out of scope for this package. The OSS toolkit should not depend on Cloudflare Workers bindings, queue handlers, D1 persistence, Hono routes, receptionist dashboard storage, or production appointment-booking infrastructure.

## Public surface

- Library entrypoint: `@amxv/finetuning`
- Core entrypoint: `@amxv/finetuning/core`
- Provider adapter entrypoint: `@amxv/finetuning/providers`
- Simulation boundary entrypoint: `@amxv/finetuning/simulation`
- CLI binary: `finetuning`
- Architecture and API note: `docs/architecture.md`

The current scaffold declares the public workflow and CLI names with status labels, plus the canonical internal trajectory model for later extraction phases. It includes provider-neutral types for business context, personas, tool schemas, tool calls, tool results, conversation messages, trajectories, and OpenAI fine-tuning rows.

The core builder surface treats full tool trajectories as the canonical tool-calling dataset shape: an assistant tool-call message is followed by the matching tool result and a final assistant response. A `tool_decision` export mode is still available for datasets that intentionally stop at the model's tool choice. Provider and simulation modules define adapter interfaces for model invocation, filesystem IO, optional persistence, and user-selected output directories without binding reusable core code to backend runtime concerns.

Later extraction phases will implement concrete simulation, provider adapters, CLI workflows, localization, and production-ready dataset IO behind these boundaries.
