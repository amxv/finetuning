import { createHash, randomBytes } from "node:crypto";

export const jobProtocol = "finetuning.amxv.dev/job/v1" as const;
export type JobTask = "chat" | "embedding";
export interface ImmutableReferenceV1 {
  id: string;
  revision: string;
  sha256: string;
}
export interface JobArtifactV1 {
  uri: string;
  sha256: string;
  mediaType: string;
  bytes?: number;
}
export interface ExecutionJobV1 {
  apiVersion: typeof jobProtocol;
  runId: string;
  attemptId: string;
  attempt: number;
  task: JobTask;
  recipe: ImmutableReferenceV1;
  model: ImmutableReferenceV1;
  tokenizer: ImmutableReferenceV1;
  image: { reference: string; digest: `sha256:${string}` };
  inputs: JobArtifactV1[];
  resources: { cpu: number; memoryGiB: number; gpuCount: number; gpuType?: string; volumeGiB?: number };
  precision: "fp32" | "fp16" | "bf16";
  quantization: "none" | "8bit" | "4bit";
  checkpoint: { cadenceSteps: number; resumeFrom?: JobArtifactV1; requireCompleteState: boolean };
  evaluation: { enabled: boolean };
  export: { format: string; destination: string };
  deadline: string;
  executor?: { provider: string; extension: Record<string, unknown> };
}
export interface ExecutionEventV1 {
  apiVersion: "finetuning.amxv.dev/execution-event/v1";
  runId: string;
  attemptId: string;
  sequence: number;
  timestamp: string;
  kind: "started" | "progress" | "checkpoint" | "artifact" | "completed" | "failed";
  payload?: Record<string, unknown>;
}
export interface CheckpointManifestV1 {
  apiVersion: "finetuning.amxv.dev/checkpoint/v1";
  runId: string;
  attemptId: string;
  step: number;
  complete: boolean;
  artifacts: JobArtifactV1[];
}
export interface ExecutionResultV1 {
  apiVersion: "finetuning.amxv.dev/result/v1";
  runId: string;
  attemptId: string;
  status: "succeeded" | "failed" | "cancelled";
  artifacts: JobArtifactV1[];
  lastCheckpoint?: CheckpointManifestV1;
}

export function parseExecutionJob(value: unknown): ExecutionJobV1 {
  const v = object(value);
  exact(v, [
    "apiVersion",
    "runId",
    "attemptId",
    "attempt",
    "task",
    "recipe",
    "model",
    "tokenizer",
    "image",
    "inputs",
    "resources",
    "precision",
    "quantization",
    "checkpoint",
    "evaluation",
    "export",
    "deadline",
    "executor",
  ]);
  if (
    v.apiVersion !== jobProtocol ||
    !uuid(v.runId) ||
    typeof v.attemptId !== "string" ||
    !Number.isInteger(v.attempt) ||
    !(["chat", "embedding"] as unknown[]).includes(v.task)
  )
    throw new Error("EXECUTION_PROTOCOL_INCOMPATIBLE: invalid job identity");
  for (const key of ["recipe", "model", "tokenizer"]) {
    const r = object(v[key]);
    exact(r, ["id", "revision", "sha256"]);
    if (!text(r.id) || !text(r.revision) || !hash(r.sha256)) throw new Error(`EXECUTION_JOB_INVALID: ${key}`);
  }
  const image = object(v.image);
  exact(image, ["reference", "digest"]);
  if (!text(image.reference) || typeof image.digest !== "string" || !image.digest.startsWith("sha256:"))
    throw new Error("EXECUTION_JOB_INVALID: image");
  if (
    !Array.isArray(v.inputs) ||
    !Number.isInteger(v.attempt) ||
    typeof v.deadline !== "string" ||
    !Number.isFinite(Date.parse(v.deadline))
  )
    throw new Error("EXECUTION_JOB_INVALID: inputs/deadline");
  if (
    !(["fp32", "fp16", "bf16"] as unknown[]).includes(v.precision) ||
    !(["none", "8bit", "4bit"] as unknown[]).includes(v.quantization)
  )
    throw new Error("EXECUTION_JOB_INVALID: precision/quantization");
  return value as ExecutionJobV1;
}
export function validateEventOrdering(events: ExecutionEventV1[]): void {
  for (let i = 0; i < events.length; i++)
    if (events[i]?.sequence !== i + 1) throw new Error("EXECUTION_EVENT_ORDER_INVALID");
}
export function canonicalJobHash(job: ExecutionJobV1): string {
  return createHash("sha256").update(canonical(job)).digest("hex");
}
export function createUuidV7(now = Date.now()): string {
  const b = randomBytes(16);
  let n = BigInt(now);
  for (let i = 5; i >= 0; i--) {
    b[i] = Number(n & 255n);
    n >>= 8n;
  }
  b[6] = (b[6]! & 15) | 112;
  b[8] = (b[8]! & 63) | 128;
  return `${b.toString("hex", 0, 4)}-${b.toString("hex", 4, 6)}-${b.toString("hex", 6, 8)}-${b.toString("hex", 8, 10)}-${b.toString("hex", 10)}`;
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("EXECUTION_JOB_INVALID: expected object");
  return v as Record<string, unknown>;
}
function exact(v: Record<string, unknown>, keys: string[]) {
  const unknown = Object.keys(v).filter((k) => !keys.includes(k));
  if (unknown.length) throw new Error(`EXECUTION_UNKNOWN_FIELD: ${unknown.join(",")}`);
}
function text(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}
function hash(v: unknown) {
  return typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
}
function uuid(v: unknown) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
