# Architecture Note

This repository is being bootstrapped as a standalone fine-tuning dataset toolkit. It is extracted from a receptionist backend, but the public package is not a receptionist runtime and does not depend on Cloudflare Workers, Hono routes, D1 storage, queues, or dashboard data models.

## V1 Scope

V1 targets developers and teams building model-specific assistants that need synthetic fine-tuning corpora, especially corpora that include tool-calling behavior. The initial product scope is:

- synthetic scenario-driven dataset generation
- persona generation for synthetic conversations
- chat-only and full tool-trajectory examples
- OpenAI chat fine-tuning JSONL export
- JSONL validation and dataset summaries
- one receptionist example profile as a sample scenario, not as the core domain

Translation is experimental for v1. It may be exposed behind explicit commands and library modules once the provider identity, field-preservation rules, and validation workflow are implemented.

Real-log conversion is deferred. It will not be part of v1 until the repo has a public source contract, redaction hooks, privacy guidance, and fixture-backed validation.

## Supported Workflows

| Workflow | Status | Public surface |
| --- | --- | --- |
| Synthetic dataset generation | V1 | `simulate-dataset`, library workflow manifest |
| Persona generation | V1 | `generate-personas`, library workflow manifest |
| Dataset validation | V1 | `validate-dataset`, library workflow manifest |
| Dataset translation | Experimental | `translate-dataset`, explicitly experimental |
| Log-to-dataset import | Deferred | `convert-logs`, documented placeholder only |

Every workflow in this table has a public manifest in `src/index.ts`. V1 CLI commands for persona generation, deterministic sample dataset generation, and dataset validation are implemented in `src/cli/index.ts`. The reusable model, OpenAI export row shape, JSONL validation surface, and representative fixtures live under `src/core`. Provider-backed simulation concerns live behind adapter interfaces in `src/providers` and `src/simulation`.

## Supported Providers

The canonical export target is OpenAI chat fine-tuning JSONL. Simulation providers are adapter-based and may include OpenAI, Anthropic, or a custom model client. Internal tool schemas should remain provider-neutral, with provider-specific conversion happening at the adapter/export boundary.

Provider status for v1:

| Provider role | Supported providers | Status |
| --- | --- | --- |
| Dataset export | OpenAI chat fine-tuning JSONL | V1 target |
| Simulation model calls | OpenAI, Anthropic, custom adapters | V1 target, implementation deferred to provider phase |
| Translation model calls | OpenAI, Anthropic, custom adapters | Experimental |
| Cloudflare bindings, queues, D1, Hono | None | Non-goal |

Provider integrations are represented by `ModelClient`, `ProviderAdapter`, and provider-specific adapter marker types in `src/providers`. The exported OpenAI and Anthropic adapters are intentionally unconfigured placeholders in this phase; concrete HTTP SDK wiring belongs outside `src/core`.

## Repository Boundaries

Current source boundaries:

- `src/core`: provider-neutral data model, OpenAI JSONL row formatter, validators, and fixtures
- `src/providers`: model invocation contracts and OpenAI/Anthropic/custom adapter scaffolding
- `src/simulation`: simulation runtime contracts, filesystem IO contract, optional persistence contract, and output-directory-aware request shape
- `src/cli`: CLI entrypoint and command discovery
- `src/index.ts`: public package aggregator

The core layer must not import provider clients, CLI code, filesystem implementations, persistence implementations, Cloudflare bindings, Hono routes, D1 storage, queues, or generated output files.

## Output Guarantees

V1 output should be deterministic at the file-format boundary even when model-generated content is variable:

- output rows are JSONL records compatible with OpenAI chat fine-tuning input expectations
- chat-only examples contain ordered system, user, and assistant messages
- full tool-trajectory examples preserve assistant tool calls, tool result messages, and final assistant responses
- decision-only examples are available through `tool_decision` mode and stop immediately after the assistant tool-call message
- tool result payloads are normalized deterministic JSON objects unless a result is explicitly represented as text
- validation reports malformed JSONL, missing messages, unsupported roles, malformed tool calls, and summary counts
- generated files are written to user-selected output directories, not source directories

Dataset writing is represented as a `DatasetWriter`/`FileSystemAdapter` boundary in `src/simulation`. Concrete writers must receive an output directory from config or CLI input and should treat `outputs/` as an ignored local default, not as source.

Translation, when enabled experimentally, must preserve schema-bearing fields such as tool names, tool-call IDs, arguments, and tool-result structure. Only natural-language content should be translated unless a config explicitly opts into another behavior.

## Initial Library API Surface

The public library entrypoint is the package root:

```ts
import {
  cliCommands,
  supportedWorkflows,
  type FineTuningToolkitConfig,
} from "@amxv/finetuning";
```

Initial exported surface:

- `FineTuningToolkitConfig`: config shape for scenario, provider, and output selection
- `SupportedProvider`: provider identifiers for adapter configuration
- `WorkflowStatus`: status labels for `v1`, `experimental`, and `deferred` features
- `BusinessContext`, `PersonaDefinition`, `ToolSchema`, `ToolCall`, `ToolResult`: provider-neutral scenario and tool primitives
- `ConversationMessage`: discriminated union for system, user, assistant text, assistant tool-call, and tool-result messages
- `ConversationTrajectory`: canonical internal conversation container
- `SimulatedAssistantTurn`: structured simulation turn result that can contain assistant text, tool calls, tool results, and final assistant responses
- `ExportMode`: `plain_chat`, `tool_decision`, or `full_tool_trajectory`
- `buildOpenAIFineTuningRow` and `buildOpenAIFineTuningRows`: trajectory-oriented OpenAI export builders
- `validateOpenAIFineTuningRow` and `assertValidOpenAIFineTuningRow`: runtime validation for exported examples
- `serializeOpenAIJsonlRows`, `validateOpenAIJsonl`, and `summarizeOpenAIJsonlRows`: JSONL serialization, dataset-level validation, and summary reporting
- `ModelClient`, `ProviderAdapter`, and provider adapter placeholder exports: provider integration boundary
- `FileSystemAdapter`, `DatasetWriter`, `PersistenceAdapter`, and `SimulationRunner`: runtime and IO boundaries for simulation workflows
- `supportedWorkflows`: discoverable workflow manifest
- `cliCommands`: discoverable CLI manifest

The following implementation APIs are intentionally not exported yet because their adapter boundaries are later plan deliverables:

- simulator runners
- concrete provider clients
- translation transforms
- log converters

Tool definitions are included in exported rows only when the selected export mode contains assistant tool calls and the trajectory has tool schemas. Plain chat rows omit tools by default. Full tool trajectories are the canonical tool-calling export behavior; `tool_decision` remains available for users who only want tool-choice examples.

## Initial CLI Surface

The CLI binary name is `finetuning`.

Planned commands:

- `finetuning generate-personas --config <path> --out <path>`
- `finetuning simulate-dataset --config <path> --out <path>`
- `finetuning validate-dataset <path>`
- `finetuning translate-dataset <path> --target-locale <locale> --out <path>` (experimental)
- `finetuning convert-logs --config <path> --out <path>` (deferred)

Implemented commands:

- `finetuning generate-personas (--profile <id> | --config <path>) --out <path> [--count <n>] [--force]`
- `finetuning simulate-dataset (--profile <id> | --config <path>) --out <path> [--limit <n>] [--mode <mode>] [--force]`
- `finetuning validate-dataset <path>`

`generate-personas` writes persona JSON in one batch to the requested output path. `simulate-dataset` writes OpenAI JSONL in one batch and refuses to overwrite an existing file unless `--force` is passed. Its current behavior is deterministic sample generation from the scenario profile and provider-neutral tool schemas, not model-provider simulation. `validate-dataset` validates JSONL rows and reports row counts, valid/invalid row counts, message counts, tool-call counts, tool-result counts, average messages per row, and language counts when row metadata includes a locale.

`translate-dataset` is still experimental and exits without writing output until provider-backed translation is implemented. `convert-logs` is still deferred.

## Non-Goals

The OSS toolkit does not own receptionist production runtime concerns:

- no Cloudflare Worker `Bindings`
- no Cloudflare queue handlers
- no D1 persistence
- no Hono route handlers
- no receptionist dashboard or storage model
- no production appointment-booking backend
- no queue-backed translation storage
- no generated private datasets committed as source

Receptionist behavior may appear only as an example profile showing how a domain-specific assistant can be modeled with public scenario configuration.

## Scenario Configuration

Scenario definitions are the public way to describe domain behavior. They are data objects, not framework defaults. A scenario definition contains:

- assistant role
- business or domain context
- persona source settings, including requested count, optional generator prompt, optional bundled personas, and source metadata
- tool inventory, including provider-neutral tool schemas
- conversation goals
- stopping rules, including turn limits, stop conditions, and escalation criteria
- optional system prompt and metadata

`src/core/scenarios.ts` contains bundled sample profiles and scenario JSON parsing helpers. `sample-receptionist` recreates the extracted receptionist domain as example content. `sample-retail-support` proves the same model works for a non-receptionist assistant. Fixtures may use these profiles as sample data, but core builders and validators must continue to operate on generic `ConversationTrajectory` and `ScenarioDefinition` objects.

`src/simulation` exposes `loadScenarioSource`, which accepts a `ScenarioDefinition`, bundled profile id, JSON string, or path loaded through a `FileSystemAdapter`. This keeps user-supplied scenario files at the adapter boundary and avoids requiring source edits for new assistant domains.

The framework should not introduce new receptionist assumptions in core APIs. Domain-specific counts, personas, company/business details, tools, prompt text, and stopping behavior belong in scenario profiles or user-provided config.
