---
title: Provider config
description: Configure OpenAI and Anthropic persona generation, simulation, and translation through config files or explicit command flags.
order: 5
category: How-to
summary: Provider-backed runs are explicit, config-driven, and keep secrets in environment variables instead of checked-in JSON.
---

## What provider config is for

Scenario JSON should stay provider-neutral. Use `--provider-config <path>` when you want to define runtime provider selections separately from the scenario itself.

The config may contain `providers.persona`, `providers.simulation`, and `providers.translation` objects. Each object can include:

- `provider`
- `model`
- `apiKeyEnv`
- `baseUrl`
- `temperature`
- `maxOutputTokens`
- `headers`
- `metadata`

## Example config file

The checked-in example at `examples/provider-config.example.json` stores env var names only:

```json
{
  "providers": {
    "simulation": {
      "provider": "openai",
      "model": "replace-with-simulation-model",
      "apiKeyEnv": "OPENAI_API_KEY"
    },
    "translation": {
      "provider": "anthropic",
      "model": "replace-with-translation-model",
      "apiKeyEnv": "ANTHROPIC_API_KEY"
    }
  }
}
```

Do not place secret API key values in this file. Only store environment variable names.

## Use the config for simulation

```bash
OPENAI_API_KEY=... node dist/cli/index.js simulate-dataset \
  --config examples/receptionist/scenario.json \
  --provider-config examples/provider-config.example.json \
  --out outputs/receptionist-openai.jsonl \
  --limit 1 \
  --mode full_tool_trajectory
```

To override the config for one run:

```bash
OPENAI_API_KEY=... node dist/cli/index.js simulate-dataset \
  --config examples/receptionist/scenario.json \
  --provider-config examples/provider-config.example.json \
  --simulation-provider openai \
  --simulation-model <model> \
  --simulation-api-key-env OPENAI_API_KEY \
  --out outputs/receptionist-openai.jsonl \
  --limit 1 \
  --mode full_tool_trajectory
```

## Override precedence

Resolution order is:

1. explicit CLI flags for the active command
2. `--provider-config` values
3. provider selections embedded inside a toolkit-style `--config` object, when present
4. command defaults such as deterministic simulation or `local-pseudo` translation

If you explicitly choose a provider-backed path, the CLI validates required model and API key settings before attempting provider calls.

## Default env vars

The built-in defaults are:

- `OPENAI_API_KEY` for OpenAI
- `ANTHROPIC_API_KEY` for Anthropic

Use a custom env var name only when you need to route credentials differently for a specific environment.
