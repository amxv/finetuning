---
title: Security, privacy, and compliance
description: Threat-model secrets, sensitive data, provider output, artifacts, retention, deletion, and legal obligations.
order: 12
category: Security
---

## Threat model

Assume datasets, prompts, tool arguments/results, provider envelopes, logs, checkpoints, environment variables, and artifact paths may contain secrets or personal data. Attackers may supply malicious JSONL, symlinks, oversized vectors, prompt content, remote code, or tampered artifacts. Validation, bounded streaming, atomic writes, scoped locks, redaction, content hashes, pinned revisions, and fail-closed capabilities reduce—but do not eliminate—risk.

Keep credentials in environment variables referenced by name. Redact authorization headers, keys, tokens, message content, tool payloads, and native envelopes before persistence. Do not ingest production logs: conversion remains deferred until a public source contract, redaction hooks, retention/deletion semantics, and privacy fixtures exist.

Record consent and lawful basis, source and teacher-output rights, data classification, purpose limitation, residency, provider subprocessors, retention, deletion lineage, incident contacts, and approval. Deletion must traverse source IDs, transformations, frozen manifests, ledgers, checkpoints, exports, and backups; a model may require retraining because weight-level deletion is not guaranteed.

A model license does not clear data, teacher-output, privacy, trademark, or regulated-use rights. Preserve LICENSE/NOTICE and upstream evidence at pinned revisions. Verify provider terms for distillation and retention. The packaged inventory and provenance exclude model weights and third-party evaluation corpora. An SBOM should be generated only under the approved release policy and reviewed before publication.

Budgets stop local scheduling on estimates or observed usage; they are not provider-side hard caps. Network/upload/remote-code operations require explicit opt-in. See [support and release](/docs/migration-release) before production use.
