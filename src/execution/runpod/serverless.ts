import { createHash } from "node:crypto";
import { RunPodError } from "./index.js";
export const serverlessEvidence = {
  retrievedAt: "2026-07-12",
  openapiSha256: "3cde8a56e91915eecb9669dc6cbe21d3e4f1ea8543436f9df04c0173e120e78a",
  docs: [
    {
      url: "https://docs.runpod.io/serverless/endpoints/send-requests",
      sha256: "976a7e4ebb47a58bfd4652eeb9ab66e090ea76e3e19841012f50987d20b2a7c2",
    },
    {
      url: "https://docs.runpod.io/serverless/endpoints/job-operations",
      sha256: "0e69458997af41d2fd326b706ca69447d53b7521407d0522f8f80e2d0a8f9dd7",
    },
    {
      url: "https://docs.runpod.io/serverless/endpoints/endpoint-configurations",
      sha256: "c88115228daf2358bf015d56b7b0a1ff1f659b05ad7cbd2c7cebb51c79372c89",
    },
  ],
} as const;
export type ServerlessOperation = "evaluate" | "infer";
export type ServerlessState =
  "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "TIMED_OUT" | "CANCELLED" | "PURGED";
export interface ServerlessCapabilitiesV1 {
  version: "1.0.0";
  status: "unavailable";
  operations: { run: true; runsync: true; status: true; cancel: true; purgeQueue: true };
  training: false;
  liveEvidence: false;
  flashControlPlane: false;
  publicEndpoints: "evaluation-convenience-only";
  evidence: typeof serverlessEvidence;
}
export interface ServerlessRequestV1 {
  version: "1.0.0";
  endpointId: string;
  operation: ServerlessOperation;
  idempotencyKey: string;
  ownershipMarker: string;
  input: Record<string, unknown>;
  limits: { payloadBytes: number; outputBytes: number; executionTimeoutMs: number; queueTtlMs: number };
  provider: { runpod: { mode: "run" | "runsync"; lowPriority?: boolean } };
}
export interface ServerlessResultV1 {
  version: "1.0.0";
  id: string;
  endpointId: string;
  state: ServerlessState;
  ownershipMarker: string;
  queueDelayMs?: number;
  executionMs?: number;
  output?: unknown;
  outputBytes?: number;
  error?: string;
  cancelRequested?: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface WorkerImageV1 {
  version: "1.0.0";
  purpose: "evaluation" | "inference" | "serving";
  reference: string;
  digest: `sha256:${string}`;
  modelRevision: string;
  runtime: string;
  runtimeRevision: string;
  tasks: Array<"chat" | "embedding">;
  vllmEmbeddingQualified: boolean;
  productionStatus: "unavailable";
}
export interface ServerlessScalingV1 {
  version: "1.0.0";
  workersMin: number;
  workersMax: number;
  idleTimeoutSeconds: number;
  executionTimeoutMs: number;
  scalerType: "QUEUE_DELAY" | "REQUEST_COUNT";
  scalerValue: number;
  scaleToZero: boolean;
  coldStartMeasured: false;
}
export interface ServerlessCostV1 {
  version: "1.0.0";
  pricingKind: "serverless-worker";
  activeWorkerSeconds: number;
  idleWorkerSeconds: number;
  coldStartSeconds: number;
  queueSeconds: number;
  estimatedUsd: number;
  billedUsd?: number;
  evidenceAt: string;
  billingLag: boolean;
  podPricingUsed: false;
  hardCap: false;
}
const maximum = { payload: 1_000_000, output: 4_000_000, runtime: 600_000, ttl: 1_800_000 };
export function serverlessCapabilities(): ServerlessCapabilitiesV1 {
  return {
    version: "1.0.0",
    status: "unavailable",
    operations: { run: true, runsync: true, status: true, cancel: true, purgeQueue: true },
    training: false,
    liveEvidence: false,
    flashControlPlane: false,
    publicEndpoints: "evaluation-convenience-only",
    evidence: serverlessEvidence,
  };
}
export function validateServerlessRequest(request: ServerlessRequestV1): ServerlessRequestV1 {
  if (request.operation !== "evaluate" && request.operation !== "infer")
    throw incompatible("bounded evaluation/inference only");
  if (/train|checkpoint/i.test(JSON.stringify(request.input)))
    throw incompatible("Serverless cannot run checkpointed or long-running training");
  const actual = Buffer.byteLength(JSON.stringify({ input: request.input }));
  if (actual > request.limits.payloadBytes || request.limits.payloadBytes > maximum.payload)
    throw incompatible("payload limit");
  if (request.limits.outputBytes > maximum.output) throw incompatible("output limit");
  if (request.limits.executionTimeoutMs < 1 || request.limits.executionTimeoutMs > maximum.runtime)
    throw incompatible("runtime limit");
  if (request.limits.queueTtlMs < 1 || request.limits.queueTtlMs > maximum.ttl) throw incompatible("queue TTL");
  if (!request.endpointId || !request.idempotencyKey || !request.ownershipMarker) throw incompatible("identity");
  return request;
}
export function validateScaling(v: ServerlessScalingV1) {
  if (v.workersMin < 0 || v.workersMax < 0 || v.workersMin > v.workersMax) throw incompatible("worker scale");
  if (v.scaleToZero !== (v.workersMin === 0)) throw incompatible("scale-to-zero");
  if (v.idleTimeoutSeconds < 1 || v.executionTimeoutMs < 5_000 || v.scalerValue <= 0)
    throw incompatible("scaling timeout/value");
  return v;
}
export function validateWorker(image: WorkerImageV1, task: "chat" | "embedding") {
  if (!image.tasks.includes(task)) throw incompatible("worker task");
  if (task === "embedding" && image.runtime === "vllm" && !image.vllmEmbeddingQualified)
    throw incompatible("vLLM embedding compatibility unqualified");
  return image;
}
export class FakeServerlessQueue {
  private jobs = new Map<string, ServerlessResultV1>();
  private idempotency = new Map<string, string>();
  constructor(private now = () => new Date().toISOString()) {}
  submit(request: ServerlessRequestV1) {
    validateServerlessRequest(request);
    const existing = this.idempotency.get(request.idempotencyKey);
    if (existing) return this.status(existing);
    const id = `job-${this.jobs.size + 1}`,
      time = this.now(),
      job: ServerlessResultV1 = {
        version: "1.0.0",
        id,
        endpointId: request.endpointId,
        state: "IN_QUEUE",
        ownershipMarker: request.ownershipMarker,
        createdAt: time,
        updatedAt: time,
      };
    this.jobs.set(id, job);
    this.idempotency.set(request.idempotencyKey, id);
    return structuredClone(job);
  }
  status(id: string) {
    const job = this.jobs.get(id);
    if (!job) throw incompatible("unknown job/state");
    return structuredClone(job);
  }
  transition(id: string, state: ServerlessState, output?: unknown) {
    const job = this.jobs.get(id);
    if (!job) throw incompatible("unknown job");
    const allowed: Record<ServerlessState, ServerlessState[]> = {
      IN_QUEUE: ["IN_PROGRESS", "CANCELLED", "PURGED", "TIMED_OUT", "FAILED"],
      IN_PROGRESS: ["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED"],
      COMPLETED: [],
      FAILED: [],
      TIMED_OUT: [],
      CANCELLED: [],
      PURGED: [],
    };
    if (!allowed[job.state].includes(state)) throw incompatible(`invalid transition ${job.state}->${state}`);
    job.state = state;
    job.updatedAt = this.now();
    if (output !== undefined) {
      job.output = output;
      job.outputBytes = Buffer.byteLength(JSON.stringify(output));
    }
    return structuredClone(job);
  }
  cancel(id: string, owner: string) {
    const job = this.jobs.get(id);
    if (!job || job.ownershipMarker !== owner)
      throw new RunPodError("RUNPOD_FORBIDDEN", "foreign Serverless cancellation refused");
    if (job.state === "IN_QUEUE") return this.transition(id, "CANCELLED");
    if (job.state === "IN_PROGRESS") {
      job.cancelRequested = true;
      job.updatedAt = this.now();
      return structuredClone(job);
    }
    return structuredClone(job);
  }
  purge(owner: string) {
    let purged = 0;
    for (const job of this.jobs.values())
      if (job.state === "IN_QUEUE" && job.ownershipMarker === owner) {
        this.transition(job.id, "PURGED");
        purged++;
      }
    return {
      purged,
      runningUnaffected: [...this.jobs.values()]
        .filter((x) => x.ownershipMarker === owner && x.state === "IN_PROGRESS")
        .map((x) => x.id),
    };
  }
}
export interface FleetJobV1 {
  version: "1.0.0";
  runId: string;
  attemptId: string;
  owner: string;
  runPrefix: string;
  credentialEnvNames: string[];
  cacheNamespace: string;
  podId?: string;
  costCenter: string;
  status: "queued" | "assigned" | "running" | "completed" | "failed";
}
export class FakeFleetDispatcher {
  private queue: FleetJobV1[] = [];
  private owners = new Map<string, string>();
  submit(job: FleetJobV1) {
    if (job.runPrefix !== `/workspace/runs/${job.runId}` || job.credentialEnvNames.some((x) => /token=|key=/i.test(x)))
      throw incompatible("fleet isolation/secrets");
    if (this.owners.has(job.runId) || this.queue.some((x) => x.attemptId === job.attemptId))
      throw incompatible("fleet duplicate/cross-adoption");
    this.owners.set(job.runId, job.owner);
    this.queue.push(structuredClone(job));
    return job;
  }
  next() {
    return this.queue.find((x) => x.status === "queued");
  }
  assign(runId: string, podId: string, owner: string) {
    const job = this.queue.find((x) => x.runId === runId);
    if (!job || job.owner !== owner) throw new RunPodError("RUNPOD_FORBIDDEN", "cross-owner fleet adoption refused");
    job.podId = podId;
    job.status = "assigned";
    return structuredClone(job);
  }
  cleanup(runId: string, owner: string) {
    const job = this.queue.find((x) => x.runId === runId);
    if (!job || job.owner !== owner) throw new RunPodError("RUNPOD_FORBIDDEN", "cross-owner fleet cleanup refused");
    this.queue = this.queue.filter((x) => x.runId !== runId);
    this.owners.delete(runId);
    return { runId, podId: job.podId, owned: true };
  }
  orphans(activePodIds: string[]) {
    return this.queue.filter((x) => x.podId && !activePodIds.includes(x.podId)).map((x) => x.runId);
  }
}
export function artifactDigest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function incompatible(what: string) {
  return new RunPodError("RUNPOD_INCOMPATIBLE", `SERVERLESS_INCOMPATIBLE: ${what}`);
}
