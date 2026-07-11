---
title: Quickstart
description: Install the package, build the CLI, generate a deterministic sample dataset, and validate it from a clean checkout.
order: 1
category: Start
summary: The default path stays offline and deterministic, so you can verify the toolkit before adding provider credentials.
---

## Install and build

Start from a clean checkout:

```bash
npm install
npm run build
node dist/cli/index.js --help
```

The package build stays separate from the docs site build. `npm run build` compiles the CLI and library into `dist/`.

## Understand the default runtime

The CLI defaults are offline:

- persona generation is deterministic unless you explicitly choose a provider
- dataset simulation is deterministic unless you explicitly choose a provider
- translation uses `local-pseudo` unless you explicitly choose a provider strategy

That means you can validate the core workflow without setting `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or any model name.

## Generate a first deterministic dataset

Use the bundled receptionist profile:

```bash
node dist/cli/index.js simulate-dataset \
  --profile sample-receptionist \
  --out outputs/receptionist-sample.jsonl \
  --limit 3 \
  --mode full_tool_trajectory

node dist/cli/index.js validate-dataset outputs/receptionist-sample.jsonl
```

The validator should report:

- `Rows: 3`
- `Tool calls: 3`
- `Tool results: 3`
- `Rows with tools: 3`
- `Dataset is valid.`

## Generate from a checked-in scenario file

Use the public example config directly when you want to inspect the scenario JSON:

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

Generated files should go into ignored local directories such as `outputs/` or `tmp/`, not back into `examples/` or `src/`.

## Try a second scenario

The toolkit is not receptionist-specific. This retail support sample uses the same scenario model:

```bash
node dist/cli/index.js simulate-dataset \
  --config examples/retail-support/scenario.json \
  --out outputs/retail-support-sample.jsonl \
  --limit 2 \
  --mode full_tool_trajectory

node dist/cli/index.js validate-dataset outputs/retail-support-sample.jsonl
```

## Next steps

- Read [Full tool trajectories](/docs/full-tool-trajectories) to inspect the exported row shape.
- Read [Scenario authoring](/docs/scenario-authoring) before modeling a new domain.
- Read [Provider config](/docs/provider-config) when you want model-backed generation or translation.
- Read [RunPod execution and support status](/docs/runpod-execution) before using any RunPod command.
