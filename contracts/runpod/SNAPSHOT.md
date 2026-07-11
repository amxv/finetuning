# RunPod REST evidence

- Source: `https://rest.runpod.io/v1/openapi.json`
- Retrieved: 2026-07-12 (Asia/Kolkata)
- SHA-256: `1da83b045d6e4c9980d118a853dc16b788b8862280b3361b847f05ca2738cd84`
- OpenAPI: 3.0.3; API document version: 0.1.0

Reviewed mappings are deliberately limited to read-only Pod, network-volume, and Pod/network-volume billing operations. The snapshot describes mutation operations, but Phase 20 capabilities disable them. It contains no generic Pod exec/log operation and no Secrets resource. Spot/interruption fields are not treated as qualified semantics. Billing history is not a provider hard-dollar cap.

The adjacent official documentation extracts were retrieved with `webctx read-link`. The snapshot is never generated during install. The semantic-diff utility writes a review artifact and never updates this file.
