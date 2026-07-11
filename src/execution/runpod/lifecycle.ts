import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicWrite } from "../../node/storage.js";
import type { ExecutionJobV1, JobArtifactV1 } from "../index.js";
import { canonicalJobHash } from "../index.js";
import { RUNPOD_EVIDENCE_DATE, RUNPOD_OPENAPI_SHA256, RunPodError } from "./index.js";

export const runPodPlanVersion = "1.0.0" as const;
export interface RunPodCostEstimateV1 {
  version: "1.0.0";
  hourlyUsd: number;
  runtimeHours: number;
  computeMaxUsd: number;
  storageMonthlyUsd?: number;
  maxUsd: number;
  hardCap: false;
  evidenceAt: string;
  billingLagWarning: string;
}
export interface RunPodPlanV1 {
  version: typeof runPodPlanVersion;
  runId: string;
  specHash: string;
  task: "chat" | "embedding";
  gpu: { type: string; count: 1; vramGiB: number; available: number; dataCenterId: string };
  volume: {
    id: string;
    dataCenterId: string;
    mountPath: "/workspace";
    runPrefix: string;
    cachePrefix: "/workspace/cache";
    retained: true;
  };
  image: { reference: string; digest: string };
  disk: { containerGiB: number; volumeGiB: number; checkpointHeadroomGiB: number };
  deadline: string;
  cost: RunPodCostEstimateV1;
  exactMutations: string[];
  warnings: string[];
  openapiSha256: typeof RUNPOD_OPENAPI_SHA256;
  evidenceDate: string;
}
export type LifecycleStatus =
  | "planned"
  | "creating-volume"
  | "creating-pod"
  | "running"
  | "cancelled"
  | "stopped"
  | "terminated"
  | "succeeded"
  | "failed";
export interface RunPodRunStateV1 {
  version: "1.0.0";
  runId: string;
  attemptId: string;
  attempt: number;
  specHash: string;
  imageDigest: string;
  ownershipMarker: string;
  status: LifecycleStatus;
  providerPodId?: string;
  providerVolumeId?: string;
  eventCursor: number;
  deadline: string;
  estimatedMaxUsd: number;
  createdAt: string;
  updatedAt: string;
}
export interface RunPodLifecycleResultV1 {
  version: "1.0.0";
  operation: string;
  runId: string;
  status: LifecycleStatus;
  podId?: string;
  volumeId?: string;
  retained: string[];
  warnings: string[];
}
export interface RunPodCleanupManifestV1 {
  version: "1.0.0";
  runId: string;
  podDeleted: boolean;
  runPrefixDeleted: boolean;
  volumeDeleted: boolean;
  retained: string[];
  partial: boolean;
}
export interface RunPodFetchReportV1 {
  version: "1.0.0";
  runId: string;
  artifacts: JobArtifactV1[];
  verified: number;
  destination: string;
}
export interface LifecyclePod {
  id: string;
  name: string;
  state: "RUNNING" | "EXITED" | "TERMINATED";
  imageDigest: string;
  ownershipMarker: string;
  specHash: string;
  volumeId: string;
}
export interface LifecycleVolume {
  id: string;
  name: string;
  dataCenterId: string;
  sizeGiB: number;
  ownershipMarker: string;
}
export interface RunPodLifecycleBackend {
  listPods(): Promise<LifecyclePod[]>;
  createPod(input: Omit<LifecyclePod, "id" | "state">): Promise<LifecyclePod>;
  stopPod(id: string): Promise<void>;
  deletePod(id: string): Promise<void>;
  listVolumes(): Promise<LifecycleVolume[]>;
  createVolume(input: Omit<LifecycleVolume, "id">): Promise<LifecycleVolume>;
  deleteVolume(id: string): Promise<void>;
}
export interface RunPodMutationTransport { request(path:string,init?:RequestInit):Promise<unknown> }
export class RestRunPodLifecycleBackend implements RunPodLifecycleBackend {
  constructor(private transport:RunPodMutationTransport,private liveAuthorized=false){}
  private gate(){if(!this.liveAuthorized)throw new RunPodError("RUNPOD_FORBIDDEN","live RunPod mutations require explicit allowLive authorization")}
  async listPods(){const v=await this.transport.request("/pods");if(!Array.isArray(v))throw new RunPodError("RUNPOD_INCOMPATIBLE","unknown Pod list response");return v.map(parseLifecyclePod)}
  async createPod(input:Omit<LifecyclePod,"id"|"state">){this.gate();return parseLifecyclePod(await this.transport.request("/pods",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:input.name,imageName:input.imageDigest,networkVolumeId:input.volumeId,env:{AMXV_OWNERSHIP_MARKER:input.ownershipMarker,AMXV_SPEC_HASH:input.specHash}})}))}
  async stopPod(id:string){this.gate();await this.transport.request(`/pods/${encodeURIComponent(id)}/stop`,{method:"POST"})}
  async deletePod(id:string){this.gate();await this.transport.request(`/pods/${encodeURIComponent(id)}`,{method:"DELETE"})}
  async listVolumes(){const v=await this.transport.request("/networkvolumes");if(!Array.isArray(v))throw new RunPodError("RUNPOD_INCOMPATIBLE","unknown volume list response");return v.map(parseLifecycleVolume)}
  async createVolume(input:Omit<LifecycleVolume,"id">){this.gate();return parseLifecycleVolume(await this.transport.request("/networkvolumes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:input.name,size:input.sizeGiB,dataCenterId:input.dataCenterId,metadata:{ownershipMarker:input.ownershipMarker}})}))}
  async deleteVolume(id:string){this.gate();await this.transport.request(`/networkvolumes/${encodeURIComponent(id)}`,{method:"DELETE"})}
}
function parseLifecyclePod(v:unknown):LifecyclePod{if(!v||typeof v!=="object")throw new RunPodError("RUNPOD_INCOMPATIBLE","unknown Pod response");const x=v as Record<string,unknown>,env=(x.env??{}) as Record<string,unknown>;if(typeof x.id!=="string"||typeof x.name!=="string"||typeof x.image!=="string"||typeof x.networkVolumeId!=="string"||!["RUNNING","EXITED","TERMINATED"].includes(String(x.desiredStatus)))throw new RunPodError("RUNPOD_INCOMPATIBLE","unknown Pod response fields");return {id:x.id,name:x.name,state:x.desiredStatus as LifecyclePod["state"],imageDigest:x.image,volumeId:x.networkVolumeId,ownershipMarker:String(env.AMXV_OWNERSHIP_MARKER??""),specHash:String(env.AMXV_SPEC_HASH??"")}}
function parseLifecycleVolume(v:unknown):LifecycleVolume{if(!v||typeof v!=="object")throw new RunPodError("RUNPOD_INCOMPATIBLE","unknown volume response");const x=v as Record<string,unknown>,metadata=(x.metadata??{}) as Record<string,unknown>;if(typeof x.id!=="string"||typeof x.name!=="string"||typeof x.dataCenterId!=="string"||!Number.isInteger(x.size))throw new RunPodError("RUNPOD_INCOMPATIBLE","unknown volume response fields");return {id:x.id,name:x.name,dataCenterId:x.dataCenterId,sizeGiB:Number(x.size),ownershipMarker:String(metadata.ownershipMarker??"")}}

export function planRunPodJob(
  job: ExecutionJobV1,
  input: {
    gpuType: string;
    vramGiB: number;
    available: number;
    dataCenterId: string;
    volumeId: string;
    volumeDataCenterId: string;
    hourlyUsd: number;
    storageMonthlyUsd?: number;
    containerGiB: number;
    volumeGiB: number;
    checkpointHeadroomGiB: number;
    maxUsd: number;
    evidenceAt: string;
  },
): RunPodPlanV1 {
  if (job.resources.gpuCount !== 1) throw new RunPodError("RUNPOD_INCOMPATIBLE", "Phase 21 requires exactly one GPU");
  if (input.available < 1) throw new RunPodError("RUNPOD_INCOMPATIBLE", "RUNPOD_CAPACITY: requested GPU unavailable");
  if (input.dataCenterId !== input.volumeDataCenterId)
    throw new RunPodError("RUNPOD_INCOMPATIBLE", "RUNPOD_LOCALITY: GPU and volume data centers differ");
  const hours = (Date.parse(job.deadline) - Date.now()) / 3_600_000;
  if (!(hours > 0)) throw new RunPodError("RUNPOD_INCOMPATIBLE", "RUNPOD_DEADLINE: deadline must be in the future");
  const compute = round(input.hourlyUsd * hours);
  if (compute > input.maxUsd)
    throw new RunPodError("RUNPOD_INCOMPATIBLE", `RUNPOD_BUDGET: estimated ${compute} exceeds maxUsd ${input.maxUsd}`);
  return {
    version: runPodPlanVersion,
    runId: job.runId,
    specHash: canonicalJobHash(job),
    task: job.task,
    gpu: {
      type: input.gpuType,
      count: 1,
      vramGiB: input.vramGiB,
      available: input.available,
      dataCenterId: input.dataCenterId,
    },
    volume: {
      id: input.volumeId,
      dataCenterId: input.volumeDataCenterId,
      mountPath: "/workspace",
      runPrefix: `/workspace/runs/${job.runId}`,
      cachePrefix: "/workspace/cache",
      retained: true,
    },
    image: job.image,
    disk: {
      containerGiB: input.containerGiB,
      volumeGiB: input.volumeGiB,
      checkpointHeadroomGiB: input.checkpointHeadroomGiB,
    },
    deadline: job.deadline,
    cost: {
      version: "1.0.0",
      hourlyUsd: input.hourlyUsd,
      runtimeHours: hours,
      computeMaxUsd: compute,
      ...(input.storageMonthlyUsd === undefined ? {} : { storageMonthlyUsd: input.storageMonthlyUsd }),
      maxUsd: input.maxUsd,
      hardCap: false,
      evidenceAt: input.evidenceAt,
      billingLagWarning: "Billing history may lag; maxUsd is an estimate, not a provider-enforced hard cap.",
    },
    exactMutations: [
      "create one on-demand Pod attached to the named independent volume",
      "stop or delete only the owned Pod; retain the volume",
    ],
    warnings: [
      "Control-plane failure can outlive the local watchdog and exceed the estimate.",
      "Stopped Pods may leave retained network-volume storage billing.",
      "Disposable Pod disk is never the only checkpoint location.",
    ],
    openapiSha256: RUNPOD_OPENAPI_SHA256,
    evidenceDate: RUNPOD_EVIDENCE_DATE,
  };
}

export class RunPodLifecycleController {
  constructor(
    private backend: RunPodLifecycleBackend,
    private statePath: string,
    private ownershipMarker: string,
    private now = () => new Date().toISOString(),
  ) {}
  async launch(job: ExecutionJobV1, plan: RunPodPlanV1, dryRun = false): Promise<RunPodLifecycleResultV1> {
    if (dryRun) return result("launch", plan.runId, "planned", undefined, plan.volume.id);
    let state = await this.readState().catch(() => undefined);
    if (state) {
      this.assertOwned(state);
      if (state.specHash !== plan.specHash || state.imageDigest !== plan.image.digest)
        throw new RunPodError("RUNPOD_INCOMPATIBLE", "existing run cannot be adopted: spec/image mismatch");
      if (state.providerPodId)
        return result("launch", state.runId, state.status, state.providerPodId, state.providerVolumeId);
    }
    const found = (await this.backend.listPods()).find(
      (p) =>
        p.specHash === plan.specHash &&
        p.imageDigest === plan.image.digest &&
        p.ownershipMarker === this.ownershipMarker,
    );
    if (found) {
      state = this.newState(job, plan, "running", found.id, found.volumeId);
      await this.writeState(state);
      return result("launch", job.runId, "running", found.id, found.volumeId);
    }
    state = this.newState(job, plan, "creating-pod", undefined, plan.volume.id);
    await this.writeState(state);
    const pod = await this.backend.createPod({
      name: `amxv-${job.runId}`,
      imageDigest: plan.image.digest,
      ownershipMarker: this.ownershipMarker,
      specHash: plan.specHash,
      volumeId: plan.volume.id,
    });
    state = { ...state, status: "running", providerPodId: pod.id, updatedAt: this.now() };
    await this.writeState(state);
    return result("launch", job.runId, "running", pod.id, plan.volume.id);
  }
  async status(): Promise<RunPodRunStateV1> {
    const s = await this.readState();
    this.assertOwned(s);
    if (s.providerPodId) {
      const pod = (await this.backend.listPods()).find((p) => p.id === s.providerPodId);
      if (!pod && s.status !== "terminated")
        throw new RunPodError("RUNPOD_INCOMPATIBLE", "owned Pod is missing; reconcile before retry");
      if (pod) s.status = pod.state === "RUNNING" ? "running" : pod.state === "EXITED" ? "stopped" : "terminated";
    }
    await this.writeState(s);
    return s;
  }
  async stop(dryRun = false) {
    const s = await this.readState();
    this.assertOwned(s);
    if (!dryRun && s.providerPodId) await this.backend.stopPod(s.providerPodId);
    if (!dryRun) {
      s.status = "stopped";
      s.updatedAt = this.now();
      await this.writeState(s);
    }
    return result("stop", s.runId, dryRun ? s.status : "stopped", s.providerPodId, s.providerVolumeId);
  }
  async terminate(yes = false, dryRun = false) {
    const s = await this.readState();
    this.assertOwned(s);
    if (!yes && !dryRun)
      throw new RunPodError("RUNPOD_INCOMPATIBLE", "termination requires --yes; the retained volume is not deleted");
    if (!dryRun && s.providerPodId) await this.backend.deletePod(s.providerPodId);
    if (!dryRun) {
      s.status = "terminated";
      s.updatedAt = this.now();
      await this.writeState(s);
    }
    return result("terminate", s.runId, dryRun ? s.status : "terminated", s.providerPodId, s.providerVolumeId);
  }
  async cleanup(options: {
    deleteRunPrefix: boolean;
    deleteVolume: boolean;
    yes: boolean;
    dryRun: boolean;
    root?: string;
  }): Promise<RunPodCleanupManifestV1> {
    const s = await this.readState();
    this.assertOwned(s);
    if ((options.deleteRunPrefix || options.deleteVolume) && !options.yes && !options.dryRun)
      throw new RunPodError("RUNPOD_INCOMPATIBLE", "data deletion requires --yes and explicit scope");
    let podDeleted = false,
      runPrefixDeleted = false,
      volumeDeleted = false;
    if (!options.dryRun && s.providerPodId && s.status !== "terminated") {
      await this.backend.deletePod(s.providerPodId);
      podDeleted = true;
    }
    if (!options.dryRun && options.deleteRunPrefix && options.root) {
      await rm(join(options.root, "runs", s.runId), { recursive: true, force: true });
      runPrefixDeleted = true;
    }
    if (!options.dryRun && options.deleteVolume && s.providerVolumeId) {
      const volume = (await this.backend.listVolumes()).find((v) => v.id === s.providerVolumeId);
      if (!volume || volume.ownershipMarker !== this.ownershipMarker)
        throw new RunPodError("RUNPOD_FORBIDDEN", "foreign volume cleanup refused");
      await this.backend.deleteVolume(volume.id);
      volumeDeleted = true;
    }
    return {
      version: "1.0.0",
      runId: s.runId,
      podDeleted,
      runPrefixDeleted,
      volumeDeleted,
      retained: [
        ...(!runPrefixDeleted ? [`/workspace/runs/${s.runId}`] : []),
        ...(!volumeDeleted && s.providerVolumeId ? [`volume:${s.providerVolumeId}`] : []),
      ],
      partial: false,
    };
  }
  private newState(
    job: ExecutionJobV1,
    plan: RunPodPlanV1,
    status: LifecycleStatus,
    pod?: string,
    volume?: string,
  ): RunPodRunStateV1 {
    return {
      version: "1.0.0",
      runId: job.runId,
      attemptId: job.attemptId,
      attempt: job.attempt,
      specHash: plan.specHash,
      imageDigest: job.image.digest,
      ownershipMarker: this.ownershipMarker,
      status,
      ...(pod ? { providerPodId: pod } : {}),
      ...(volume ? { providerVolumeId: volume } : {}),
      eventCursor: 0,
      deadline: job.deadline,
      estimatedMaxUsd: plan.cost.maxUsd,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
  }
  private async readState() {
    return JSON.parse(await readFile(this.statePath, "utf8")) as RunPodRunStateV1;
  }
  private async writeState(s: RunPodRunStateV1) {
    await mkdir(dirname(this.statePath), { recursive: true });
    await atomicWrite(this.statePath, JSON.stringify(s, null, 2) + "\n");
    await import("node:fs/promises").then((fs) => fs.chmod(this.statePath, 0o600));
  }
  private assertOwned(s: RunPodRunStateV1) {
    if (s.ownershipMarker !== this.ownershipMarker)
      throw new RunPodError("RUNPOD_FORBIDDEN", "foreign run ownership refused");
  }
}

export class FakeRunPodLifecycleBackend implements RunPodLifecycleBackend {
  pods: LifecyclePod[] = [];
  volumes: LifecycleVolume[] = [];
  calls: string[] = [];
  failAfter?: string;
  async listPods() {
    return structuredClone(this.pods);
  }
  async createPod(input: Omit<LifecyclePod, "id" | "state">) {
    const pod = { ...input, id: `pod-${this.pods.length + 1}`, state: "RUNNING" as const };
    this.pods.push(pod);
    this.calls.push("createPod");
    if (this.failAfter === "createPod") throw new RunPodError("RUNPOD_TIMEOUT", "timeout after create");
    return pod;
  }
  async stopPod(id: string) {
    this.calls.push("stopPod");
    const p = this.pods.find((x) => x.id === id);
    if (!p) throw new Error("missing Pod");
    p.state = "EXITED";
  }
  async deletePod(id: string) {
    this.calls.push("deletePod");
    this.pods = this.pods.filter((x) => x.id !== id);
  }
  async listVolumes() {
    return structuredClone(this.volumes);
  }
  async createVolume(input: Omit<LifecycleVolume, "id">) {
    const v = { ...input, id: `volume-${this.volumes.length + 1}` };
    this.volumes.push(v);
    this.calls.push("createVolume");
    return v;
  }
  async deleteVolume(id: string) {
    this.calls.push("deleteVolume");
    this.volumes = this.volumes.filter((x) => x.id !== id);
  }
}

export async function verifyAndFetchArtifacts(
  source: string,
  destination: string,
  artifacts: JobArtifactV1[],
  runId: string,
): Promise<RunPodFetchReportV1> {
  await mkdir(destination, { recursive: true });
  let verified = 0;
  for (const artifact of artifacts) {
    const name = artifact.uri.split("/").at(-1);
    if (!name) throw new RunPodError("RUNPOD_INCOMPATIBLE", "invalid artifact URI");
    const bytes = await readFile(join(source, name));
    if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256)
      throw new RunPodError("RUNPOD_INCOMPATIBLE", `artifact hash mismatch: ${name}`);
    await writeFile(join(destination, name), bytes, { mode: 0o600 });
    verified++;
  }
  return { version: "1.0.0", runId, artifacts, verified, destination };
}
function result(
  operation: string,
  runId: string,
  status: LifecycleStatus,
  podId?: string,
  volumeId?: string,
): RunPodLifecycleResultV1 {
  return {
    version: "1.0.0",
    operation,
    runId,
    status,
    ...(podId ? { podId } : {}),
    ...(volumeId ? { volumeId } : {}),
    retained: volumeId ? [`volume:${volumeId}`] : [],
    warnings: ["Network-volume storage may continue billing after the Pod stops."],
  };
}
function round(v: number) {
  return Math.round(v * 1e6) / 1e6;
}
