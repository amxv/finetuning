import { redactSecrets } from "../../node/redaction.js";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
export const RUNPOD_OPENAPI_SHA256 = "3cde8a56e91915eecb9669dc6cbe21d3e4f1ea8543436f9df04c0173e120e78a" as const;
export const RUNPOD_EVIDENCE_DATE = "2026-07-12T00:00:00+05:30" as const;
export type RunPodState = "RUNNING" | "EXITED" | "TERMINATED";
export interface RunPodPodV1 {
  id: string;
  name: string;
  image: string;
  desiredStatus: RunPodState;
  machine?: { dataCenterId?: string; gpuAvailable?: number };
  networkVolume?: { id: string; name: string; size: number; dataCenterId: string };
  costPerHr?: number;
}
export interface RunPodVolumeV1 {
  id: string;
  name: string;
  size: number;
  dataCenterId: string;
}
export interface RunPodCapabilitiesV1 {
  version: "1.0.0";
  openapiSha256: typeof RUNPOD_OPENAPI_SHA256;
  evidenceDate: string;
  pods: { read: boolean; mutation: boolean };
  networkVolumes: { read: boolean; mutation: boolean };
  billing: { pods: boolean; networkVolumes: boolean };
  hardDollarCap: false;
  genericExecLogs: false;
  spotSemantics: false;
  directSecrets: false;
}
export class RunPodError extends Error {
  constructor(
    public code:
      | "RUNPOD_AUTH"
      | "RUNPOD_FORBIDDEN"
      | "RUNPOD_RATE_LIMIT"
      | "RUNPOD_TRANSIENT"
      | "RUNPOD_TIMEOUT"
      | "RUNPOD_ABORTED"
      | "RUNPOD_INCOMPATIBLE",
    message: string,
    public status?: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "RunPodError";
  }
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      details: redactSecrets((this.details ?? null) as never),
    };
  }
}
export interface RunPodConfig {
  apiKeyEnv: string;
  baseUrl: string;
  timeoutMs: number;
}
export function parseRunPodConfig(value: unknown = {}): RunPodConfig {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RunPodError("RUNPOD_INCOMPATIBLE", "config must be an object");
  const v = value as Record<string, unknown>;
  const allowed = ["apiKeyEnv", "baseUrl", "timeoutMs"];
  const unknown = Object.keys(v).filter((k) => !allowed.includes(k));
  if (unknown.length) throw new RunPodError("RUNPOD_INCOMPATIBLE", `unknown config keys: ${unknown.join(", ")}`);
  if ("apiKey" in v) throw new RunPodError("RUNPOD_INCOMPATIBLE", "persisted API key values are forbidden");
  return {
    apiKeyEnv: typeof v.apiKeyEnv === "string" ? v.apiKeyEnv : "RUNPOD_API_KEY",
    baseUrl: typeof v.baseUrl === "string" ? v.baseUrl : "https://rest.runpod.io/v1",
    timeoutMs: typeof v.timeoutMs === "number" ? v.timeoutMs : 15_000,
  };
}
export class RunPodTransport {
  constructor(
    readonly config = parseRunPodConfig(),
    private fetcher: typeof fetch = fetch,
  ) {}
  async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const key = process.env[this.config.apiKeyEnv];
    if (!key) throw new RunPodError("RUNPOD_AUTH", `missing environment variable ${this.config.apiKeyEnv}`);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort("timeout"), this.config.timeoutMs);
    const abort = () => ctl.abort("aborted");
    init.signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await this.fetcher(`${this.config.baseUrl}${path}`, {
        ...init,
        headers: { accept: "application/json", authorization: `Bearer ${key}`, ...init.headers },
        signal: ctl.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw classify(response.status, body);
      return body;
    } catch (e) {
      if (ctl.signal.aborted)
        throw new RunPodError(
          init.signal?.aborted ? "RUNPOD_ABORTED" : "RUNPOD_TIMEOUT",
          init.signal?.aborted ? "request aborted" : "request timed out",
        );
      throw e;
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", abort);
    }
  }
}
export class RunPodControlPlane {
  constructor(private transport: RunPodTransport) {}
  capabilities(): RunPodCapabilitiesV1 {
    return {
      version: "1.0.0",
      openapiSha256: RUNPOD_OPENAPI_SHA256,
      evidenceDate: RUNPOD_EVIDENCE_DATE,
      pods: { read: true, mutation: false },
      networkVolumes: { read: true, mutation: false },
      billing: { pods: true, networkVolumes: true },
      hardDollarCap: false,
      genericExecLogs: false,
      spotSemantics: false,
      directSecrets: false,
    };
  }
  async listPods(): Promise<RunPodPodV1[]> {
    return parsePods(await this.transport.request("/pods"));
  }
  async getPod(id: string): Promise<RunPodPodV1> {
    return parsePod(await this.transport.request(`/pods/${encodeURIComponent(id)}`));
  }
  async listVolumes(): Promise<RunPodVolumeV1[]> {
    const v = await this.transport.request("/networkvolumes");
    if (!Array.isArray(v)) throw incompatible("volume list");
    return v.map(parseVolume);
  }
  async authCheck() {
    await this.listPods();
    return { authenticated: true, openapiSha256: RUNPOD_OPENAPI_SHA256 };
  }
}
export class RunPodObjectStore {
  readonly available = false;
  explain() {
    return "S3-compatible independent-volume transfer is unavailable until endpoint and credential semantics are verified.";
  }
}
export class RunPodConnector {
  guidance(pod: RunPodPodV1) {
    return {
      ssh: pod.machine
        ? "Use the verified public IP and port mapping returned by the Pod resource; credentials are never persisted."
        : "Connection details are not visible yet.",
      jupyter: "Use the RunPod-provided HTTP port mapping when present.",
      logs: "Generic REST exec/log streaming is unavailable; read append-only durable event files from the mounted volume.",
    };
  }
}
export interface RunPodProviderStateV1 {
  version: "1.0.0";
  runId: string;
  attemptId: string;
  specHash: string;
  imageDigest: string;
  providerPodId?: string;
  providerVolumeId?: string;
  ownershipMarker: string;
  updatedAt: string;
}
export async function writeRunPodState(path: string, state: RunPodProviderStateV1): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
  await chmod(path, 0o600);
}
export function canAdopt(
  state: RunPodProviderStateV1,
  expected: { specHash: string; imageDigest: string; ownershipMarker: string },
): boolean {
  return (
    state.specHash === expected.specHash &&
    state.imageDigest === expected.imageDigest &&
    state.ownershipMarker === expected.ownershipMarker
  );
}
export function requireReconcileBeforeRetry(state: RunPodProviderStateV1): void {
  if (state.providerPodId)
    throw new RunPodError("RUNPOD_INCOMPATIBLE", "ambiguous mutation must be reconciled by provider ID before retry");
}
export * from "./lifecycle.js";
export * from "./hardening.js";
export * from "./serverless.js";
function parsePods(v: unknown) {
  if (!Array.isArray(v)) throw incompatible("pod list");
  return v.map(parsePod);
}
function parsePod(v: unknown): RunPodPodV1 {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw incompatible("pod");
  const p = v as Record<string, unknown>;
  if (
    typeof p.id !== "string" ||
    typeof p.name !== "string" ||
    typeof p.image !== "string" ||
    !(["RUNNING", "EXITED", "TERMINATED"] as unknown[]).includes(p.desiredStatus)
  )
    throw incompatible("pod fields/state");
  return p as unknown as RunPodPodV1;
}
function parseVolume(v: unknown): RunPodVolumeV1 {
  if (!v || typeof v !== "object") throw incompatible("volume");
  const x = v as Record<string, unknown>;
  if (
    typeof x.id !== "string" ||
    typeof x.name !== "string" ||
    !Number.isInteger(x.size) ||
    typeof x.dataCenterId !== "string"
  )
    throw incompatible("volume fields");
  return x as unknown as RunPodVolumeV1;
}
function classify(status: number, details: unknown) {
  const code =
    status === 401
      ? "RUNPOD_AUTH"
      : status === 403
        ? "RUNPOD_FORBIDDEN"
        : status === 429
          ? "RUNPOD_RATE_LIMIT"
          : status >= 500
            ? "RUNPOD_TRANSIENT"
            : "RUNPOD_INCOMPATIBLE";
  return new RunPodError(code, `RunPod REST request failed (${status})`, status, details);
}
function incompatible(what: string) {
  return new RunPodError("RUNPOD_INCOMPATIBLE", `missing or unknown ${what} in pinned REST response`);
}
