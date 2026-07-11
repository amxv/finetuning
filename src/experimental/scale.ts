import { canonicalSha256 } from "../core/canonical.js";
import type { JsonObject, JsonValue } from "../core/model.js";
export type RemoteRunnerKind = "docker" | "slurm" | "cloud";
export type RemoteStatus = "queued" | "running" | "succeeded" | "failed_retryable" | "failed_terminal" | "cancelled";
export interface RemoteJobManifestV1 {
  version: "1.0.0";
  jobId: string;
  idempotencyKey: string;
  runner: RemoteRunnerKind;
  status: RemoteStatus;
  attempt: number;
  capabilities: { cancel: boolean; retry: boolean; events: boolean };
  events: Array<{ sequence: number; type: string; at: string; data?: JsonObject }>;
  artifacts: Array<{ key: string; sha256: string; bytes: number }>;
  updatedAt: string;
}
export interface DurableManifestStore {
  get(id: string): Promise<RemoteJobManifestV1 | undefined>;
  compareAndSet(id: string, expected: string | undefined, value: RemoteJobManifestV1): Promise<string>;
}
export class InMemoryManifestStore implements DurableManifestStore {
  #values = new Map<string, { etag: string; value: RemoteJobManifestV1 }>();
  async get(id: string) {
    return structuredClone(this.#values.get(id)?.value);
  }
  async compareAndSet(id: string, expected: string | undefined, value: RemoteJobManifestV1) {
    const current = this.#values.get(id);
    if (current?.etag !== expected) throw new Error("MANIFEST_CAS_CONFLICT");
    const etag = canonicalSha256(value as never);
    this.#values.set(id, { etag, value: structuredClone(value) });
    return etag;
  }
  etag(id: string) {
    return this.#values.get(id)?.etag;
  }
}
export class DurableRemoteRunner {
  constructor(
    readonly kind: RemoteRunnerKind,
    readonly store: InMemoryManifestStore,
    readonly now = () => new Date().toISOString(),
  ) {}
  async submit(key: string): Promise<RemoteJobManifestV1> {
    const id = canonicalSha256(`${this.kind}:${key}`);
    const existing = await this.store.get(id);
    if (existing) return existing;
    const value: RemoteJobManifestV1 = {
      version: "1.0.0",
      jobId: id,
      idempotencyKey: key,
      runner: this.kind,
      status: "queued",
      attempt: 0,
      capabilities: { cancel: true, retry: true, events: true },
      events: [],
      artifacts: [],
      updatedAt: this.now(),
    };
    await this.store.compareAndSet(id, undefined, value);
    return value;
  }
  async transition(id: string, status: RemoteStatus, data?: JsonObject) {
    const value = await this.store.get(id);
    if (!value) throw new Error("REMOTE_JOB_NOT_FOUND");
    const etag = this.store.etag(id);
    value.status = status;
    value.attempt += status === "running" ? 1 : 0;
    value.events.push({ sequence: value.events.length, type: status, at: this.now(), ...(data ? { data } : {}) });
    value.updatedAt = this.now();
    await this.store.compareAndSet(id, etag, value);
    return value;
  }
  status(id: string) {
    return this.store.get(id);
  }
  cancel(id: string) {
    return this.transition(id, "cancelled");
  }
  retry(id: string) {
    return this.transition(id, "queued");
  }
}
export class InMemoryObjectStore {
  #data = new Map<string, { bytes: Uint8Array; etag: string }>();
  fault?: (op: string) => void;
  async put(key: string, bytes: Uint8Array, expected?: string) {
    this.fault?.("put");
    const current = this.#data.get(key);
    if (current?.etag !== expected) throw new Error("OBJECT_CAS_CONFLICT");
    const etag = canonicalSha256(Array.from(bytes) as never);
    this.#data.set(key, { bytes: bytes.slice(), etag });
    return etag;
  }
  async get(key: string, expectedHash?: string) {
    this.fault?.("get");
    const value = this.#data.get(key);
    if (!value) throw new Error("OBJECT_NOT_FOUND");
    if (expectedHash && value.etag !== expectedHash) throw new Error("OBJECT_INTEGRITY_FAILURE");
    return value.bytes.slice();
  }
  async delete(key: string) {
    this.#data.delete(key);
  }
}
export class InMemoryLeaseLock {
  #leases = new Map<string, { owner: string; expires: number }>();
  acquire(key: string, owner: string, now: number, ttl: number) {
    const current = this.#leases.get(key);
    if (current && current.expires > now && current.owner !== owner) throw new Error("LEASE_CONFLICT");
    this.#leases.set(key, { owner, expires: now + ttl });
  }
  renew(key: string, owner: string, now: number, ttl: number) {
    const current = this.#leases.get(key);
    if (!current || current.owner !== owner || current.expires <= now) throw new Error("LEASE_LOST");
    current.expires = now + ttl;
  }
  release(key: string, owner: string) {
    if (this.#leases.get(key)?.owner !== owner) throw new Error("LEASE_OWNER_MISMATCH");
    this.#leases.delete(key);
  }
}
export interface BatchItem {
  requestId: string;
  estimatedCost: number;
  payload: JsonObject;
}
export interface BatchResult {
  requestId: string;
  cost: number;
  response?: JsonObject;
  rawRef?: string;
  error?: string;
}
export class ProviderBatchLedger {
  #submitted = new Map<string, BatchItem>();
  #results = new Map<string, BatchResult>();
  constructor(readonly budget: number) {}
  submit(items: BatchItem[]) {
    for (const item of items) {
      if (this.#submitted.has(item.requestId)) continue;
      const estimated = [...this.#submitted.values()].reduce((n, x) => n + x.estimatedCost, 0) + item.estimatedCost;
      if (estimated > this.budget) throw new Error("BATCH_BUDGET_EXCEEDED");
      this.#submitted.set(item.requestId, structuredClone(item));
    }
    return [...this.#submitted.keys()];
  }
  reconcile(results: BatchResult[]) {
    for (const result of results)
      if (this.#submitted.has(result.requestId) && !this.#results.has(result.requestId))
        this.#results.set(result.requestId, {
          ...structuredClone(result),
          ...(result.rawRef ? { rawRef: canonicalSha256(result.rawRef) } : {}),
        });
    return {
      submitted: this.#submitted.size,
      completed: this.#results.size,
      pending: [...this.#submitted.keys()].filter((x) => !this.#results.has(x)),
      cost: [...this.#results.values()].reduce((n, x) => n + x.cost, 0),
    };
  }
}
export function reconcileDedupeShards(shards: Array<{ shard: string; hash: string; recordId: string }[]>) {
  const groups = new Map<string, string[]>();
  for (const item of shards
    .flat()
    .sort((a, b) => a.shard.localeCompare(b.shard) || a.recordId.localeCompare(b.recordId))) {
    const values = groups.get(item.hash) ?? [];
    values.push(item.recordId);
    groups.set(item.hash, values);
  }
  return [...groups]
    .map(([hash, ids]) => ({ hash, representative: [...ids].sort()[0]!, members: [...ids].sort() }))
    .sort((a, b) => a.hash.localeCompare(b.hash));
}
export interface HumanReviewDecisionV1 {
  version: "1.0.0";
  taskId: string;
  recordId: string;
  reviewer: string;
  decision: "accept" | "reject" | "escalate";
  reason: string;
  createdAt: string;
  previousDecisionHash?: string;
}
export class AppendOnlyReviewLog {
  readonly decisions: HumanReviewDecisionV1[] = [];
  append(value: HumanReviewDecisionV1) {
    const previous = this.decisions.at(-1);
    if (previous && value.previousDecisionHash !== canonicalSha256(previous as never))
      throw new Error("REVIEW_PROVENANCE_BROKEN");
    this.decisions.push(structuredClone(value));
  }
}
export function parquetPreflight(optionalDependencyAvailable: boolean) {
  if (!optionalDependencyAvailable)
    throw new Error("PARQUET_OPTIONAL_DEPENDENCY_MISSING: install an explicit Parquet adapter");
  return { semantics: "canonical", lossReporting: "required", network: false };
}
