---
title: Translation
description: Translate generated datasets with the offline local-pseudo path or explicit provider-backed OpenAI and Anthropic adapters.
order: 4
category: Dataset Workflows
summary: Translation is experimental, but it preserves tool-calling structure and validates output before writing.
---

## Status

Translation is experimental. The public workflow is stable enough to run, but you should treat provider strategy choices, prompts, and locale coverage as something to evaluate on your own datasets before production use.

## Offline default

The default strategy is `local-pseudo`, which keeps the workflow offline:

```bash
node dist/cli/index.js translate-dataset outputs/receptionist-sample.jsonl \
  --target-locale es-ES \
  --out outputs/receptionist-sample.es-ES.jsonl
```

This path transforms translatable message text locally and does not require any provider credentials.

## Provider-backed translation

OpenAI and Anthropic translation strategies are implemented behind the shared provider adapter boundary. They require:

- an explicit strategy: `openai` or `anthropic`
- an explicit model via `--translation-model`
- an API key available through the default env var or `--translation-api-key-env`

OpenAI example:

```bash
OPENAI_API_KEY=... node dist/cli/index.js translate-dataset outputs/receptionist-sample.jsonl \
  --strategy openai \
  --translation-model <model> \
  --target-locale es-ES \
  --out outputs/receptionist-sample.es-ES.jsonl
```

Anthropic example:

```bash
ANTHROPIC_API_KEY=... node dist/cli/index.js translate-dataset outputs/receptionist-sample.jsonl \
  --strategy anthropic \
  --translation-model <model> \
  --target-locale fr-CA \
  --out outputs/receptionist-sample.fr-CA.jsonl
```

Use `--translation-api-key-env <ENV_NAME>` when the key is stored in a non-default environment variable.

## Preservation rules

Translation preserves the schema-bearing parts of each row:

- system, user, and assistant text content are translated
- assistant `tool_calls` are preserved exactly
- tool result messages are preserved exactly
- tool definitions are preserved exactly
- metadata is preserved and extended with `sourceLocale` when known, `targetLocale`, `translationStatus`, `translationProvider`, `translationRequestPath`, and `translationModel` when relevant

Target locales must be valid BCP 47 identifiers such as `es-ES`, `fr-CA`, or `hi-IN`.

## Failure behavior

Provider-backed translation is intentionally strict:

- missing model selection fails before provider calls
- missing API key env vars fail before provider calls
- empty output for a non-empty source field is rejected
- translated rows are validated before being written to disk

That makes it easier to keep translation mistakes from silently leaking into training data.
