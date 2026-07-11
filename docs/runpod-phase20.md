# RunPod Phase 20 support status

Evidence date: 2026-07-12. Pinned REST OpenAPI SHA-256: `1da83b045d6e4c9980d118a853dc16b788b8862280b3361b847f05ca2738cd84`.

Phase 20 provides a provider-neutral job envelope, strict validators, read-only REST discovery, redacted errors, and fake/offline contract tests. Mutations are intentionally unavailable until Phase 21. Configuration stores only the environment-variable name (`RUNPOD_API_KEY` by default), never its value.

Unavailable boundaries:

- Provider-side hard-dollar cap: unavailable; use explicitly labelled client-side runtime/cost estimates.
- Generic Pod exec or log-stream REST: unavailable; use immutable entrypoints, append-only durable event files, and verified SSH/Jupyter port mappings.
- Spot semantics: unavailable pending pinned and opt-in live qualification.
- Direct Secrets representation: unavailable in the pinned REST document.

The live feasibility exercise was **not run** on 2026-07-12 because `RUNPOD_LIVE_TEST=1`, explicit credentials, cost/runtime caps, ownership prefix, and mutation authority were not supplied. Therefore the offline foundation is complete, but the plan's real Pod/volume/checkpoint lifecycle evidence remains an acceptance blocker; no live resource was created and no spend occurred.
