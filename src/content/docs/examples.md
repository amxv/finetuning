---
title: Examples
description: Use the bundled receptionist and retail support scenarios, plus the provider config example, as starting points for your own datasets.
order: 7
category: Tutorials
summary: The checked-in examples show how to model different domains without changing toolkit code.
---

## Receptionist scenario

`examples/receptionist/scenario.json` recreates the extracted receptionist use case as public sample data.

Use the profile alias when you want the shortest command:

```bash
node dist/cli/index.js simulate-dataset \
  --profile sample-receptionist \
  --out outputs/receptionist-sample.jsonl \
  --limit 3 \
  --mode full_tool_trajectory
```

Use the file path when you want to inspect or modify the scenario definition itself:

```bash
node dist/cli/index.js simulate-dataset \
  --config examples/receptionist/scenario.json \
  --out outputs/receptionist-from-config.jsonl \
  --limit 3 \
  --mode full_tool_trajectory
```

## Retail support scenario

`examples/retail-support/scenario.json` demonstrates the same framework for a second domain:

```bash
node dist/cli/index.js simulate-dataset \
  --config examples/retail-support/scenario.json \
  --out outputs/retail-support-sample.jsonl \
  --limit 2 \
  --mode full_tool_trajectory
```

This is the fastest way to confirm the toolkit is domain-neutral rather than receptionist-specific.

## Provider config example

`examples/provider-config.example.json` shows the expected provider runtime shape. It stores env var names only, never secret values.

Use it as a template for:

- model-backed persona generation
- model-backed simulation
- provider-backed translation

Keep any generated personas, datasets, or translated outputs in `outputs/` or another ignored local directory.
