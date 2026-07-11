---
title: Validation
description: Understand what the dataset validator checks, what summary output means, and how validation fits into generation and translation workflows.
order: 3
category: How-to
summary: Validation is the required checkpoint before using generated or translated JSONL for training.
---

## Run the validator

```bash
node dist/cli/index.js validate-dataset outputs/receptionist-sample.jsonl
```

`validate-dataset` accepts a positional dataset path or `--input <path>`.

## What validation catches

The validator checks dataset shape and tool-calling integrity, including:

- line-by-line JSONL parsing failures
- rows with no messages
- unsupported or malformed message roles
- assistant tool-call arguments that are not valid JSON
- tool results that do not reference an earlier assistant tool call
- tool result names that do not match the referenced tool call
- duplicate or inconsistent tool-call identifiers
- dataset summary counts such as row count, tool-call count, tool-result count, rows with tools, and average message counts

For `full_tool_trajectory` rows, the important structural guarantee is that the assistant tool-call message appears before the tool result, which appears before the final assistant response.

## Why validation matters after translation

`translate-dataset` validates translated rows before writing output. That protects the schema-bearing parts of the example:

- assistant `tool_calls` remain unchanged
- tool result messages remain unchanged
- tool definitions remain unchanged
- row metadata is preserved and extended with translation metadata

If provider-backed translation produces empty text for a non-empty source field, the workflow rejects the output instead of writing broken JSONL.

## Project-level verification

For development changes that affect dataset structure, run:

```bash
npm run typecheck
npm run verify
```

The verification suite exercises deterministic CLI workflows, provider config handling, provider adapter behavior, translation, persona generation, simulation runners, log-conversion deferment, and the README/tutorial commands.
