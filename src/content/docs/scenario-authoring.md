---
title: Scenario authoring
description: Define assistant behavior through scenario JSON, including personas, tool schemas, goals, and stopping rules.
order: 6
category: Authoring
summary: Scenario files are the public modeling surface for new domains, not hard-coded framework behavior.
---

## Core scenario fields

A scenario definition describes domain behavior in data. The important fields are:

- `assistantRole`
- `business`
- `personaSource`
- `toolInventory`
- `conversationGoals`
- `stoppingRules`
- optional `systemPrompt`
- optional `metadata`

The bundled examples in `examples/receptionist/scenario.json` and `examples/retail-support/scenario.json` are the best starting points.

## Persona source

`personaSource` controls how user personas are supplied:

- deterministic bundled personas for offline generation
- requested persona counts
- optional generator prompts for model-backed persona generation
- source metadata for downstream context

Use `generate-personas` when you want a standalone persona file, or let `simulate-dataset` derive personas as part of dataset creation.

## Tool inventory

`toolInventory` should remain provider-neutral. Define tool schemas in terms of names, descriptions, and JSON-schema-like parameters, then let the export and provider layers map them to the necessary wire format.

That keeps:

- scenario definitions reusable across providers
- validation focused on a single canonical internal shape
- tool-calling exports stable for OpenAI JSONL output

## Goals and stopping rules

`conversationGoals` describe what the assistant and persona are trying to accomplish. `stoppingRules` constrain turn limits, exit conditions, and escalation behavior.

Those fields matter because they shape:

- the number of turns produced
- whether tool use is expected
- whether a conversation should stop at a tool decision or continue to a final answer

## Authoring guidelines

- keep business context concrete enough to support realistic user requests
- keep tool names stable and descriptive
- keep parameter schemas narrow enough that validation can catch malformed arguments
- avoid encoding provider-specific behavior directly in the scenario
- keep secrets, API keys, and environment-specific runtime config out of scenario JSON

For advanced provider-backed runs, use [Provider config](/docs/provider-config) instead of extending the scenario shape with runtime secrets or model selections.
