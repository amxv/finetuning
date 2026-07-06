---
title: Full tool trajectories
description: Generate and validate the canonical tool-calling dataset shape, including tool calls, tool results, and final assistant responses.
order: 2
category: Dataset Workflows
summary: Full tool trajectories are the default export path for tool-calling examples and preserve the complete assistant-tool-result exchange.
---

## Build the CLI

```bash
npm install
npm run build
```

## Generate a receptionist dataset

```bash
node dist/cli/index.js simulate-dataset \
  --config examples/receptionist/scenario.json \
  --out outputs/tutorial-receptionist.jsonl \
  --limit 3 \
  --mode full_tool_trajectory
```

For this sample, expect three rows, three tool calls, three tool results, and three rows with tools.

## Validate the dataset

```bash
node dist/cli/index.js validate-dataset outputs/tutorial-receptionist.jsonl
```

The validator checks JSONL parsing, message shape, assistant tool-call arguments, tool result references, tool result names, and summary counts.

## Inspect one row

Each `full_tool_trajectory` row follows this exact order:

1. `system`
2. `user`
3. `assistant` with `tool_calls`
4. `tool` with the matching `tool_call_id`
5. final `assistant` text response

The generated OpenAI-format row looks like this:

```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." },
    {
      "role": "assistant",
      "content": null,
      "tool_calls": [
        {
          "id": "call_sample_receptionist_1",
          "type": "function",
          "function": {
            "name": "search",
            "arguments": "{\"query\":\"sample query\"}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_sample_receptionist_1",
      "name": "search",
      "content": "{\"answer\":\"...\"}"
    },
    { "role": "assistant", "content": "..." }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "search",
        "description": "...",
        "parameters": {
          "type": "object",
          "properties": {
            "query": { "type": "string" }
          }
        }
      }
    }
  ]
}
```

Tool definitions are included when the selected export mode contains assistant tool calls and the trajectory has tool schemas.

## Compare export modes

The CLI supports three export modes:

- `plain_chat`: system, user, and assistant text only; no tool calls
- `tool_decision`: stop immediately after the assistant tool-call message
- `full_tool_trajectory`: include tool calls, tool results, and the final assistant response

Use `full_tool_trajectory` when you want the model to learn the complete tool loop. Use `tool_decision` only when you intentionally want examples to end at tool choice.

## Try another domain

```bash
node dist/cli/index.js simulate-dataset \
  --config examples/retail-support/scenario.json \
  --out outputs/tutorial-retail-support.jsonl \
  --limit 2 \
  --mode full_tool_trajectory

node dist/cli/index.js validate-dataset outputs/tutorial-retail-support.jsonl
```

The same commands work for non-receptionist domains because scenario definitions carry business context, tool inventory, and stopping behavior.
