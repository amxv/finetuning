# Experimental remote scale and governed logs

Docker, Slurm, cloud-style runners, provider batches, object stores, distributed locks/dedupe, human review, Parquet adapters, and governed production logs are experimental. They are importable only from `@amxv/finetuning/experimental/advanced-distillation`; none performs a live network call by default.

Remote status is reconstructed from durable versioned manifests. Submission identities are deterministic, transitions are append-only events, retries are idempotent, cancellation is explicit, and artifacts carry byte counts and hashes. Object adapters use compare-and-set identities and lease ownership; local fixtures inject faults and verify integrity. Parquet requires an explicit optional adapter and must report canonical conversion loss.

The stable `convert-logs` command remains deferred and refuses input. The experimental governed source requires explicit consent and rights basis, retention/deletion policy, encryption key reference, permitted residency, immutable source revision, reasoning policy, caller redaction, and a clean post-redaction PII/secret scan. Missing any gate produces `GOVERNED_LOGS_DISABLED`.

Deletion is never implicit. A confirmed lineage plan walks required descendants through canonical records, blobs, manifests, indexes, distillation, training, and evaluation assets and emits a content-addressed tombstone report; policies may retain declared assets.
