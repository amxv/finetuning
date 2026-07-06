# finetuning

Toolkit for generating, validating, and localizing fine-tuning datasets for OpenAI chat models, extracted from a receptionist-oriented internal backend and generalized into a standalone repository.

## Current status

This repository is being bootstrapped from an implementation plan.

- Implementation plan: `gg/agent-outputs/fine-tuning-oss-extraction-plan-2026-07-06.md`
- Default branch: `main`
- Initial implementation mode: RPI-fast on `main` without managed worktrees, per lead override

## Recommended v1 scope

The first public release is scoped to synthetic scenario-driven dataset generation for chat and tool-calling assistants. The v1 target includes persona generation, OpenAI chat fine-tuning JSONL export, full tool-trajectory rows, dataset validation, and one receptionist example profile.

Translation is experimental. The standalone package includes schema-preserving translation transforms, explicit provider/request-path metadata, and a local pseudo-translation path for validation and integration testing. Real provider-backed translation remains behind a library adapter boundary. Real-log conversion is explicitly deferred for v1: the package does not define or accept any production log shape and does not ship a log-derived dataset converter until there is a public log contract, redaction hooks, privacy guidance, and privacy-safe fixture coverage.

Receptionist backend concerns are explicitly out of scope for this package. The OSS toolkit should not depend on Cloudflare Workers bindings, queue handlers, D1 persistence, Hono routes, receptionist dashboard storage, or production appointment-booking infrastructure.

## Public surface

- Library entrypoint: `@amxv/finetuning`
- Core entrypoint: `@amxv/finetuning/core`
- Provider adapter entrypoint: `@amxv/finetuning/providers`
- Simulation boundary entrypoint: `@amxv/finetuning/simulation`
- CLI binary: `finetuning`
- Architecture and API note: `docs/architecture.md`

The current scaffold declares the public workflow and CLI names with status labels, plus the canonical internal trajectory model for later extraction phases. It includes provider-neutral types for scenario definitions, business context, personas, tool schemas, tool calls, tool results, conversation messages, trajectories, and OpenAI fine-tuning rows.

The core builder surface treats full tool trajectories as the canonical tool-calling dataset shape: an assistant tool-call message is followed by the matching tool result and a final assistant response. A `tool_decision` export mode is still available for datasets that intentionally stop at the model's tool choice. Provider and simulation modules define adapter interfaces for model invocation, filesystem IO, optional persistence, and user-selected output directories without binding reusable core code to backend runtime concerns.

## Scenario profiles

The framework core is domain-neutral. Domain behavior is described by scenario profiles that include:

- `assistantRole`
- `business` or domain context
- `personaSource`, including a target `count`, optional generator prompt, optional bundled personas, and optional source label
- `toolInventory`, including public tool schemas and an optional source label
- `conversationGoals`
- `stoppingRules`
- optional `systemPrompt` and `metadata`

Receptionist behavior is provided as the bundled `sample-receptionist` profile, not as the framework default. A second bundled `sample-retail-support` profile demonstrates the same surface for a retail support assistant.

Library callers can import bundled profiles or supply their own JSON-compatible scenario object:

```ts
import {
  loadScenarioSource,
  receptionistScenarioProfile,
  retailSupportScenarioProfile,
} from "@amxv/finetuning";

const receptionist = await loadScenarioSource(receptionistScenarioProfile);
const retail = await loadScenarioSource({ bundledProfileId: retailSupportScenarioProfile.id });
const custom = await loadScenarioSource({ json: await fs.readText("scenario.json") });
```

The CLI help lists bundled scenario profile ids. Runnable v1 commands accept `--profile <id>` for bundled profiles or `--config <path>` for user-supplied scenario JSON, so users can point the toolkit at their own scenario without editing code.

## CLI usage

Build the package before invoking the local CLI directly:

```bash
npm run build
node dist/cli/index.js --help
```

Generate personas from a bundled profile:

```bash
node dist/cli/index.js generate-personas \
  --profile sample-retail-support \
  --out outputs/retail-personas.json \
  --count 2
```

Generate a tiny deterministic OpenAI JSONL dataset:

```bash
node dist/cli/index.js simulate-dataset \
  --profile sample-receptionist \
  --out outputs/receptionist-sample.jsonl \
  --limit 3 \
  --mode full_tool_trajectory
```

Validate a dataset and print a summary:

```bash
node dist/cli/index.js validate-dataset outputs/receptionist-sample.jsonl
```

`simulate-dataset` writes the requested JSONL file in one batch and refuses to overwrite an existing output unless `--force` is passed. The current simulation command is deterministic and scaffold-aligned: it creates small sample trajectories from the scenario profile and tool schemas. Provider-backed model simulation remains behind the simulation adapter boundary for later phases.

Translate a dataset with the experimental local pseudo-translation path:

```bash
node dist/cli/index.js translate-dataset outputs/receptionist-sample.jsonl \
  --target-locale es-ES \
  --out outputs/receptionist-sample.es-ES.jsonl
```

Translation uses BCP 47 locale codes such as `es-ES`, `fr-CA`, or `hi-IN`, not language names. The experimental CLI path translates system, user, and assistant text content. It preserves assistant tool calls, tool-call IDs, function names, function arguments, tool result messages, tool definitions, and existing schema-bearing metadata. The output is validated after translation and records `targetLocale`, `translationStatus`, `translationProvider`, and `translationRequestPath` in row metadata.

Provider-backed translation is exposed as a library adapter boundary, not hidden behind the CLI.

## Log-derived datasets

Real-log conversion is not included in v1. The `convert-logs` CLI command is a deferred boundary that exits with an error; it is present only so scripts and documentation can discover that the workflow is unavailable, not to imply a supported converter.

Before this repository accepts public log-derived datasets, it needs:

- an accepted public log record shape
- assistant content extraction rules
- assistant tool-call and tool-result extraction rules
- caller-supplied redaction hooks for messages, tool arguments, tool results, and metadata
- privacy guidance for removing personal data, secrets, internal identifiers, and unsafe free-form payloads before conversion
- privacy-safe redacted fixtures and validation coverage
- a converter implementation that is independent of Cloudflare gateway, queue, Worker, D1, or other backend runtime assumptions

Until those pieces exist, use synthetic scenario generation and validation only. Do not pass production logs to this package expecting them to be converted or redacted.

Later extraction phases will implement provider-backed simulation, provider adapters, localization, and production-ready dataset IO behind these boundaries.
