---
title: Migration, support, and release notes
description: Preserve legacy workflows, assess compatibility, and rehearse a private-alpha release safely.
order: 14
category: Project
---

Legacy flat chat commands and original root/core/providers/simulation/translation imports remain compatibility-tested. Prefer narrow stable subpaths for new code. `convert-logs` stays deferred. Experimental APIs may change during alpha with changelog and migration notes.

Before a private-alpha artifact rehearsal, run product, docs, type, build, format, package, Python, release, API/schema/export/help drift, secret, license/NOTICE, and reproducibility checks. Inspect packed contents and verify that no weights, provider envelopes, caches, credentials, ignored plans, or unlicensed evaluation data appear. Publication and version changes require explicit authority.

Compatibility details live in `schemas/protocol-compatibility-v1.json`; release provenance explicitly records `publishAuthorized: false` and `independentAcceptanceComplete: false`. The changelog, migration guide, and support policy remain the historical source for prior behavior.

The documentation acceptance script starts from clean packed NPM and wheel artifacts, follows the chat and embedding tasks, checks expected trees and hashes, and records elapsed command time. Browser checks additionally cover production search, links, focus, responsive layout, and overflow.
