# Optional Serverless and fleet boundaries

RunPod Serverless is isolated from the Pod training backend. It is suitable only for bounded evaluation and inference after endpoint-specific live qualification. Checkpointed or long-running training is always rejected and continues to use the one-Pod-per-run design. Serving, inference, and evaluation worker images are separate immutable descriptors with exact model and runtime revisions. vLLM embedding compatibility is never inferred.

The fake queue models `IN_QUEUE`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `TIMED_OUT`, `CANCELLED`, and locally represented `PURGED`. Unknown states and invalid transitions fail closed. Cancellation of a running job records a request and does not promise immediate worker termination. Purge affects owned queued jobs and reports running jobs as unaffected. Requests have explicit payload, output, execution-time, and queue-TTL limits plus idempotency and ownership identities.

Scaling records active/minimum and maximum workers, idle timeout, execution timeout, scale-to-zero, scaler type/value, cold-start evidence, queue delay, and active/idle duration. Costs use Serverless worker pricing and never Pod hourly prices. Estimated and billed values remain distinct; no provider hard cap is claimed.

The fleet API is a fake contract only. One Pod per run remains the reference. Each job has a unique run prefix, attempt, credential-environment names, cache namespace, cost center, cancellation, and cleanup ownership. Cross-run adoption or deletion is rejected; fairness is FIFO; orphans are reported. Multi-node training and autonomous fleets remain out of scope.

Flash is only an optional Python deployment convenience and never the TypeScript control plane. Public Endpoints are an explicit evaluation convenience only. GraphQL, console endpoints, Flash, and undocumented APIs cannot bypass missing qualification.

Serverless and fleet support is **unavailable** because no dedicated endpoint/account, explicit low cost/runtime authority, live cancellation/scale/cold-start evidence, worker artifact reload, or cleanup proof was supplied. No live action or spend occurred. The four prior unresolved boundaries remain unchanged.
