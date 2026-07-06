# finetuning

Standalone toolkit for generating, validating, and optionally localizing OpenAI chat fine-tuning datasets from scenario definitions.

The current v1 surface is intentionally narrow and OSS-focused: define an assistant scenario, generate synthetic personas or deterministic sample conversations, export OpenAI JSONL, and validate the result. The repository was extracted from a receptionist-oriented backend, but the package is not a receptionist runtime and does not depend on Cloudflare Workers, queues, D1, Hono, dashboard storage, or appointment-booking infrastructure.

## What Works In V1

| Workflow | Status | CLI |
| --- | --- | --- |
| Synthetic persona generation | V1 | `generate-personas` |
| Synthetic dataset generation | V1 | `simulate-dataset` |
| OpenAI JSONL validation | V1 | `validate-dataset` |
| Schema-preserving translation | Experimental | `translate-dataset` |
| Log-derived dataset conversion | Deferred | `convert-logs` exits with a deferred error |

Full tool trajectories are the canonical tool-calling dataset shape. Each generated tool example includes:

1. system message
2. user message
3. assistant tool-call message
4. matching tool result message
5. final assistant message after the tool result

The `tool_decision` export mode is still available for datasets that intentionally stop at the assistant tool choice, and `plain_chat` omits tool calls.

## Install And Build

```bash
npm install
npm run build
node dist/cli/index.js --help
```

The local CLI binary is `dist/cli/index.js` after `npm run build`. Generated outputs should go under `outputs/` or another ignored local directory.

## Generate A Receptionist Sample

The bundled `sample-receptionist` profile recreates the extracted receptionist use case as public sample data. You can use the bundled profile id directly:

```bash
node dist/cli/index.js simulate-dataset \
  --profile sample-receptionist \
  --out outputs/receptionist-sample.jsonl \
  --limit 3 \
  --mode full_tool_trajectory

node dist/cli/index.js validate-dataset outputs/receptionist-sample.jsonl
```

Or use the checked-in example scenario config:

```bash
node dist/cli/index.js generate-personas \
  --config examples/receptionist/scenario.json \
  --out outputs/receptionist-personas.json \
  --count 2

node dist/cli/index.js simulate-dataset \
  --config examples/receptionist/scenario.json \
  --out outputs/receptionist-from-config.jsonl \
  --limit 3 \
  --mode full_tool_trajectory

node dist/cli/index.js validate-dataset outputs/receptionist-from-config.jsonl
```

Expected validation summary for the three-row receptionist sample:

- `Rows: 3`
- `Tool calls: 3`
- `Tool results: 3`
- `Rows with tools: 3`
- `Dataset is valid.`

## Try A Second Domain

`examples/retail-support/scenario.json` demonstrates the same scenario shape for a retail support assistant:

```bash
node dist/cli/index.js simulate-dataset \
  --config examples/retail-support/scenario.json \
  --out outputs/retail-support-sample.jsonl \
  --limit 2 \
  --mode full_tool_trajectory

node dist/cli/index.js validate-dataset outputs/retail-support-sample.jsonl
```

This proves the core model is domain-neutral. Receptionist behavior is sample configuration, not framework behavior.

## Full Tool-Trajectory Walkthrough

A scenario config defines:

- `assistantRole`
- `business`
- `personaSource`
- `toolInventory`
- `conversationGoals`
- `stoppingRules`
- optional `systemPrompt` and `metadata`

Run `simulate-dataset` with `--mode full_tool_trajectory` to produce OpenAI-format JSONL:

```bash
node dist/cli/index.js simulate-dataset \
  --config examples/receptionist/scenario.json \
  --out outputs/tutorial-receptionist.jsonl \
  --limit 1 \
  --mode full_tool_trajectory
```

The first row will have this shape:

```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": null, "tool_calls": [{ "id": "call_sample_receptionist_1", "type": "function", "function": { "name": "search", "arguments": "{\"query\":\"sample query\"}" } }] },
    { "role": "tool", "tool_call_id": "call_sample_receptionist_1", "name": "search", "content": "{\"answer\":\"...\"}" },
    { "role": "assistant", "content": "..." }
  ],
  "tools": [
    { "type": "function", "function": { "name": "search", "description": "...", "parameters": { "type": "object", "properties": { "query": { "type": "string" } } } } }
  ],
  "metadata": {
    "scenarioId": "sample-receptionist",
    "generatedBy": "finetuning-cli"
  }
}
```

Always validate generated JSONL before using it for training:

```bash
node dist/cli/index.js validate-dataset outputs/tutorial-receptionist.jsonl
```

The current CLI simulation is deterministic and sample-oriented. Provider-backed model simulation belongs behind the adapter interfaces in `src/providers` and `src/simulation` and is not implemented as a concrete HTTP client in v1.

## Translation

Translation is experimental. The default `local-pseudo` strategy is offline and prefixes translatable message text while preserving schema-bearing fields:

```bash
node dist/cli/index.js translate-dataset outputs/receptionist-sample.jsonl \
  --target-locale es-ES \
  --out outputs/receptionist-sample.es-ES.jsonl
```

Provider-backed translation is available through the same schema-preserving path. It translates one message text field per provider request, requires an explicit model, and reads API keys from environment variables:

```bash
OPENAI_API_KEY=... node dist/cli/index.js translate-dataset outputs/receptionist-sample.jsonl \
  --strategy openai \
  --translation-model <model> \
  --target-locale es-ES \
  --out outputs/receptionist-sample.es-ES.jsonl

ANTHROPIC_API_KEY=... node dist/cli/index.js translate-dataset outputs/receptionist-sample.jsonl \
  --strategy anthropic \
  --translation-model <model> \
  --target-locale fr-CA \
  --out outputs/receptionist-sample.fr-CA.jsonl
```

Use `--translation-api-key-env <ENV_NAME>` when the key lives in a non-default environment variable. The default env vars are `OPENAI_API_KEY` for `--strategy openai` and `ANTHROPIC_API_KEY` for `--strategy anthropic`.

Rules:

- system, user, and assistant text content are translated
- assistant `tool_calls` are preserved exactly
- tool result messages are preserved exactly
- tool definitions are preserved exactly
- provider-backed output must be non-empty when the source field is non-empty
- translated rows are validated before writing
- metadata is preserved and extended with `sourceLocale` when known, `targetLocale`, `translationStatus`, `translationProvider`, `translationRequestPath`, and `translationModel` for provider-backed translation
- target locales must be BCP 47 codes such as `es-ES`, `fr-CA`, or `hi-IN`

## Log-Derived Datasets

Real-log conversion is explicitly deferred for v1. The package does not define or accept any production log shape and does not ship a log-derived dataset converter. The `convert-logs` CLI command exists only as a discoverable deferred boundary and exits with an error.

Before this repository accepts public log-derived datasets, it needs:

- an accepted public log record shape
- assistant content extraction rules
- assistant tool-call and tool-result extraction rules
- caller-supplied redaction hooks for messages, tool arguments, tool results, and metadata
- privacy guidance for removing personal data, secrets, internal identifiers, and unsafe free-form payloads before conversion
- privacy-safe redacted fixtures and validation coverage
- a converter implementation that is independent of Cloudflare gateway, queue, Worker, D1, or other backend runtime assumptions

Until those pieces exist, do not pass production logs to this package expecting them to be converted or redacted.

## Library Surface

```ts
import {
  buildOpenAIFineTuningRow,
  loadScenarioSource,
  receptionistScenarioProfile,
  validateOpenAIJsonl,
} from "@amxv/finetuning";
```

Entrypoints:

- `@amxv/finetuning`: package aggregator and workflow manifests
- `@amxv/finetuning/core`: provider-neutral data model, scenarios, OpenAI row builder, validation, fixtures
- `@amxv/finetuning/providers`: provider adapter contracts and unconfigured provider placeholders
- `@amxv/finetuning/simulation`: scenario loading and runtime adapter contracts
- `@amxv/finetuning/translation`: experimental translation transform and adapter contract

See `docs/architecture.md` for the public architecture and `CONTRIBUTING.md` for development boundaries.

## Development

```bash
npm run typecheck
npm run verify
```

`npm run verify` builds the package, checks canonical fixtures, runs CLI workflows, verifies translation preservation, verifies log-conversion deferment, and runs the documented sample workflow from the checked-in example configs.
