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

Provider-backed workflows are explicit and config-driven. The CLI defaults stay offline: deterministic persona generation, deterministic sample dataset simulation, and local pseudo-translation run without API keys. Provider-backed persona generation, simulation, and translation require provider/model/env-var configuration from flags or `--provider-config`.

Translation is experimental for v1. The repo exposes schema-preserving library transforms and an explicit `translate-dataset` CLI workflow. The default local pseudo-translation request path stays offline, and provider-backed OpenAI/Anthropic translation is available only through explicit strategy, model, and API-key-env configuration.

Real-log conversion is explicitly deferred. It is not part of v1, no public log shape is accepted, and no converter is exported. The workflow will remain unavailable until the repo has a public source contract, redaction hooks, privacy guidance, and privacy-safe fixture-backed validation.

## Supported Workflows

| Workflow | Status | Public surface |
| --- | --- | --- |
| Synthetic dataset generation | V1 | `simulate-dataset`, library workflow manifest |
| Persona generation | V1 | `generate-personas`, library workflow manifest |
| Dataset validation | V1 | `validate-dataset`, library workflow manifest |
| Dataset translation | Experimental | `translate-dataset`, explicitly experimental |
| Log-to-dataset import | Deferred | `convert-logs` exits with the shared deferred-boundary error; no converter is implemented |

Every workflow in this table has a public manifest in `src/index.ts`. V1 CLI commands for persona generation, dataset generation, validation, and translation are implemented in `src/cli/index.ts`, with command code limited to argument parsing, file reading/writing, config resolution, and workflow orchestration. Persona and simulation behavior lives in `src/simulation`, provider construction lives in `src/providers`, and schema-preserving translation lives in `src/translation`.

## Supported Providers

The canonical export target is OpenAI chat fine-tuning JSONL. Simulation providers are adapter-based and may include OpenAI, Anthropic, or a custom model client. Internal tool schemas should remain provider-neutral, with provider-specific conversion happening at the adapter/export boundary.

Provider status for v1:

| Provider role | Supported providers | Status |
| --- | --- | --- |
| Dataset export | OpenAI chat fine-tuning JSONL | V1 target |
| Simulation model calls | deterministic, OpenAI, Anthropic | V1; OpenAI and Anthropic run through model-backed simulation adapters |
| Translation model calls | local-pseudo, OpenAI, Anthropic, custom adapters | Experimental; OpenAI and Anthropic are wired through `ModelClient` |
| Cloudflare bindings, queues, D1, Hono | None | Non-goal |

Provider integrations are represented by `ModelClient`, `ProviderAdapter`, concrete OpenAI/Anthropic adapters, provider-specific adapter marker types, and `ProviderRuntimeConfig` in `src/providers`. OpenAI and Anthropic SDK imports are confined to `src/providers`; `src/core` remains provider-neutral.

Translation provider identity is explicit. The library-level `TranslationTextAdapter` reports a provider (`local-pseudo`, `openai`, `anthropic`, or `custom`), request path (`local-pseudo` or `provider-adapter`), and provider model when applicable. The bundled CLI supports `local-pseudo`, `openai`, and `anthropic`; provider-backed strategies require `--translation-model` and resolve API keys from `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `--translation-api-key-env`.

Provider runtime selections can be supplied through `--provider-config <path>` without changing scenario JSON. The config object may contain `providers.persona`, `providers.simulation`, and `providers.translation` entries with `provider`, `model`, `apiKeyEnv`, and optional runtime fields such as `baseUrl`, `temperature`, `maxOutputTokens`, `headers`, and `metadata`. Config files store environment variable names, not secrets. CLI flags override config-file values for the current command.

## Repository Boundaries

Current source boundaries:

- `src/core`: provider-neutral data model, OpenAI JSONL row formatter, validators, and fixtures
- `src/providers`: model invocation contracts, provider runtime config/env resolution, and OpenAI/Anthropic/custom adapters
- `src/simulation`: persona generators, simulation runners, filesystem IO contract, optional persistence contract, and output-directory-aware request shape
- `src/translation`: local-pseudo and provider-backed schema-preserving translation adapters
- `src/cli`: CLI entrypoint, argument parsing, config-file reading, output writing, and command discovery
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

Translation is enabled experimentally with strict preservation rules:

- translate system message content
- translate user message content
- translate assistant text content, including assistant content attached to a tool-call message when present
- preserve assistant `tool_calls` exactly, including ids, function names, and JSON argument strings
- preserve tool result messages exactly, including `tool_call_id`, `name`, and `content`
- preserve tool definitions exactly, including function names, descriptions, and parameter schemas
- preserve existing metadata and add `sourceLocale` when known, `targetLocale`, `translationStatus`, `translationProvider`, `translationRequestPath`, and provider `translationModel` when applicable
- require non-empty translated text when the source text field is non-empty
- validate translated rows before writing CLI output

Only BCP 47 locale codes are accepted in public API and CLI fields, for example `es-ES`, `fr-CA`, or `hi-IN`; language names are intentionally not accepted as target identifiers.

## Library API Surface

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
- `translateOpenAIFineTuningRow`, `translateOpenAIJsonl`, `TranslationTextAdapter`, `createOpenAITranslationAdapter`, `createAnthropicTranslationAdapter`, `createProviderTranslationAdapter`, and `experimentalTranslationRules`: experimental schema-preserving translation surface
- `ModelClient`, `ProviderAdapter`, `openAIProviderAdapter`, `anthropicProviderAdapter`, `createProviderAdapter`, `createModelClientFromConfig`, provider request/response mappers, and provider error types: provider integration boundary
- `FileSystemAdapter`, `DatasetWriter`, `PersistenceAdapter`, and `SimulationRunner`: runtime and IO boundaries for simulation workflows
- `deferredLogConversionBoundary` and `createDeferredLogConversionError`: explicit v1 boundary proving real-log conversion is not implemented and listing the privacy/redaction prerequisites for any future converter
- `supportedWorkflows`: discoverable workflow manifest
- `cliCommands`: discoverable CLI manifest

The following implementation APIs are intentionally not exported:

- log converters
- concrete SDK client classes from `src/providers/openai.ts` and `src/providers/anthropic.ts`

Tool definitions are included in exported rows only when the selected export mode contains assistant tool calls and the trajectory has tool schemas. Plain chat rows omit tools by default. Full tool trajectories are the canonical tool-calling export behavior; `tool_decision` remains available for users who only want tool-choice examples.

## CLI Surface

The CLI binary name is `finetuning`.

Implemented commands:

- `finetuning generate-personas (--profile <id> | --config <path>) --out <path> [--count <n>] [--provider-config <path>] [--persona-provider deterministic|openai|anthropic] [--persona-model <model>] [--persona-api-key-env <ENV_NAME>] [--force]`
- `finetuning simulate-dataset (--profile <id> | --config <path>) --out <path> [--limit <n>] [--mode <mode>] [--provider-config <path>] [--simulation-provider deterministic|openai|anthropic] [--simulation-model <model>] [--simulation-api-key-env <ENV_NAME>] [--force]`
- `finetuning validate-dataset <path>`
- `finetuning translate-dataset <path> --target-locale <bcp47> --out <path> [--source-locale <bcp47>] [--provider-config <path>] [--strategy local-pseudo|openai|anthropic] [--translation-model <model>] [--translation-api-key-env <ENV_NAME>] [--force]` (experimental)

`generate-personas` writes persona JSON in one batch to the requested output path. `simulate-dataset` writes OpenAI JSONL in one batch and refuses to overwrite an existing file unless `--force` is passed. Both default to deterministic sample behavior and switch to provider-backed behavior only when flags or provider config select OpenAI or Anthropic. `validate-dataset` validates JSONL rows and reports row counts, valid/invalid row counts, message counts, tool-call counts, tool-result counts, average messages per row, and language counts when row metadata includes a locale.

`translate-dataset` is experimental. It validates input JSONL, translates natural-language message content through `local-pseudo` or an explicit OpenAI/Anthropic provider-backed adapter, preserves tool schema and tool-call structure, validates the translated output, and writes only to the requested output path. Provider-backed translation operates one text field at a time through `TranslationTextRequest` and rejects empty or wrapper-style provider output instead of trying broad cleanup. `convert-logs` is still deferred and must not be used for production logs; it exits before reading any log source.

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
