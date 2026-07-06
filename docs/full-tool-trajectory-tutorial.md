# Full Tool-Trajectory Tutorial

This tutorial generates a small OpenAI chat fine-tuning JSONL file from a checked-in scenario config. It uses only public repo files and writes output to ignored local directories.

## 1. Build The CLI

```bash
npm install
npm run build
```

## 2. Generate A Receptionist Dataset

```bash
node dist/cli/index.js simulate-dataset \
  --config examples/receptionist/scenario.json \
  --out outputs/tutorial-receptionist.jsonl \
  --limit 3 \
  --mode full_tool_trajectory
```

The command prints a dataset summary. For this sample, expect three rows, three tool calls, three tool results, and three rows with tools.

## 3. Validate The Dataset

```bash
node dist/cli/index.js validate-dataset outputs/tutorial-receptionist.jsonl
```

The validator checks JSONL parsing, message shape, assistant tool-call arguments, tool result references, and summary counts.

## 4. Inspect One Row

Each `full_tool_trajectory` row follows this order:

1. `system`
2. `user`
3. `assistant` with `tool_calls`
4. `tool` with matching `tool_call_id`
5. final `assistant` text response

Tool definitions are included in rows that contain assistant tool calls. Tool result content is serialized as deterministic JSON text.

## 5. Try Another Scenario

```bash
node dist/cli/index.js simulate-dataset \
  --config examples/retail-support/scenario.json \
  --out outputs/tutorial-retail-support.jsonl \
  --limit 2 \
  --mode full_tool_trajectory

node dist/cli/index.js validate-dataset outputs/tutorial-retail-support.jsonl
```

The same commands work for a non-receptionist domain because scenario definitions carry domain behavior.
