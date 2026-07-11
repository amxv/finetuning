# RunPod Serverless evidence

Retrieved with `webctx read-link` on 2026-07-12.

- `https://docs.runpod.io/serverless/endpoints/send-requests` — SHA-256 `976a7e4ebb47a58bfd4652eeb9ab66e090ea76e3e19841012f50987d20b2a7c2`
- `https://docs.runpod.io/serverless/endpoints/job-operations` — SHA-256 `0e69458997af41d2fd326b706ca69447d53b7521407d0522f8f80e2d0a8f9dd7`
- `https://docs.runpod.io/serverless/endpoints/endpoint-configurations` — SHA-256 `c88115228daf2358bf015d56b7b0a1ff1f659b05ad7cbd2c7cebb51c79372c89`
- `https://rest.runpod.io/v1/openapi.json` — SHA-256 `1da83b045d6e4c9980d118a853dc16b788b8862280b3361b847f05ca2738cd84`

The official job documentation revalidates `/run`, `/runsync`, status, cancel, and `/purge-queue`. These queue operations use the separate `api.runpod.ai/v2` Serverless boundary; they are not Pod REST endpoints in the pinned `rest.runpod.io/v1` document. The implementation therefore exposes bounded fake contracts and unavailable capabilities, not a production transport.
