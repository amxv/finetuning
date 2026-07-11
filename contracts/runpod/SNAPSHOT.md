# RunPod REST evidence

- Source: `https://rest.runpod.io/v1/openapi.json`
- Retrieved: 2026-07-12 (Asia/Kolkata)
- SHA-256: `3cde8a56e91915eecb9669dc6cbe21d3e4f1ea8543436f9df04c0173e120e78a`
- OpenAPI: 3.0.3; API document version: 0.1.0

Reviewed mappings are deliberately limited to read-only Pod, network-volume, and Pod/network-volume billing operations. The snapshot describes mutation operations, but Phase 20 capabilities disable them. It contains no generic Pod exec/log operation and no Secrets resource. Spot/interruption fields are not treated as qualified semantics. Billing history is not a provider hard-dollar cap.

The adjacent official documentation extracts were retrieved with `webctx read-link`. The snapshot is never generated during install. The semantic-diff utility writes a review artifact and never updates this file.
