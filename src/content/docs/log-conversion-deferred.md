---
title: Log conversion deferred
description: Understand why real-log conversion is intentionally unavailable and what must exist before it can be released safely.
order: 10
category: Reference
summary: "`convert-logs` is a deliberate boundary, not a partially implemented feature."
---

## Current behavior

The CLI exposes `convert-logs`, but the command exits with a deferred-boundary error instead of accepting or converting logs.

That is intentional. The project does not currently define or accept any production log shape.

## Why the boundary exists

Real log conversion is high-risk because it can mix:

- private user data
- free-form assistant content
- tool arguments and tool results that may contain secrets
- metadata that may reveal internal identifiers or runtime details

Making the deferred state explicit is safer than silently suggesting logs can be imported today.

## Required prerequisites

Before public log conversion is released, the repository needs:

- an accepted public log record shape
- assistant content extraction rules
- assistant tool-call extraction rules
- assistant tool-result extraction rules
- caller-supplied redaction hooks for messages, tool arguments, tool results, and metadata
- privacy guidance for removing personal data, secrets, internal identifiers, and unsafe payloads
- privacy-safe redacted fixtures and verification coverage
- a converter implementation independent of Cloudflare gateway, queue, Worker, D1, or other backend runtime assumptions

Until those pieces exist, do not pass production logs to this package expecting conversion or redaction.
