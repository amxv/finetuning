import { createHash } from "node:crypto";
import type { RunPodPlanV1, RunPodRunStateV1 } from "./lifecycle.js";
import { RunPodError } from "./index.js";

export type ArchitectureFamily =
  | "qwen3-dense"
  | "qwen3-moe"
  | "nemotron-cascade"
  | "nemotron-nano"
  | "olmo-dense"
  | "qwen3-embedding"
  | "xlmr-embedding"
  | "nomic-moe"
  | "gte-remote";
export interface QLoRAProfileV1 {
  version: "1.0.0";
  recipeId: string;
  architecture: ArchitectureFamily;
  quantization: "nf4-4bit";
  computePrecision: "bf16" | "fp16";
  doubleQuantization: true;
  kernels: string[];
  requiredTargets: string[];
  minimumCoverage: number;
  memoryProbeRequired: true;
  adapterReloadRequired: true;
  productionStatus: "unavailable";
  unavailableReasons: string[];
}
export interface ModuleCoverageV1 {
  discovered: string[];
  adapted: string[];
  missing: string[];
  coverage: number;
  passed: boolean;
}
export interface DistributedContractV1 {
  version: "1.0.0";
  mode: "single" | "ddp" | "fsdp";
  singleNode: true;
  worldSize: number;
  visibleDevices: string[];
  topology: string;
  ncclEvidence: "not-run" | "passed" | "failed";
  effectiveBatchSize: number;
  microBatchSize: number;
  gradientAccumulation: number;
  samplerSeed: number;
  checkpointWorldSize: number;
  reshardSupported: false;
  metricTolerance: number;
  productionStatus: "unavailable";
}
export interface RecoveryReportV1 {
  version: "1.0.0";
  checkpoint: string;
  classification: "full-resume" | "weights-only-warm-start" | "corrupt-skipped" | "none";
  step: number;
  previousStep: number;
  lossWindowSteps: number;
  attempt: number;
  worldSizeCompatible: boolean;
  fallbacks: string[];
}
export interface CapacityAlternativeV1 {
  gpuType: string;
  vramGiB: number;
  dataCenterId: string;
  hourlyUsd: number;
  rank: number;
  compatible: boolean;
  reasons: string[];
  requiresConfirmation: true;
  changes: {
    hardware: true;
    cost: boolean;
    model: false;
    precision: false;
    quantization: false;
    gpuCount: false;
    distributedMode: false;
  };
}
export interface RunPodCostReportV1 {
  version: "1.0.0";
  runId: string;
  estimated: { computeUsd: number; storageUsd: number; asOf: string };
  observed: { elapsedSeconds: number; computeUsd: number; asOf: string };
  billed: {
    computeUsd?: number;
    storageUsd?: number;
    from?: string;
    through?: string;
    retrievedAt?: string;
    lagging: boolean;
  };
  retainedResources: string[];
  uncertainty: string[];
  hardCap: false;
}
export interface BillableInventoryV1 {
  version: "1.0.0";
  asOf: string;
  pods: Array<{ id: string; status: string; hourlyUsd: number }>;
  volumes: Array<{ id: string; monthlyUsd: number; retained: boolean }>;
  orphans: string[];
  idle: string[];
}

const profiles: Record<string, QLoRAProfileV1> = {
  "qwen3.6-27b": profile("qwen3.6-27b", "qwen3-dense", [
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "gate_proj",
    "up_proj",
    "down_proj",
  ]),
  "qwen3.6-35b-a3b": profile("qwen3.6-35b-a3b", "qwen3-moe", [
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "gate_proj",
    "up_proj",
    "down_proj",
    "experts",
    "shared_expert",
  ]),
  "nemotron-cascade-2-30b-a3b": profile("nemotron-cascade-2-30b-a3b", "nemotron-cascade", [
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "experts",
  ]),
  "nemotron-3-nano-30b-a3b": profile("nemotron-3-nano-30b-a3b", "nemotron-nano", [
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "mamba",
    "experts",
  ]),
  "olmo-3.1-32b-instruct": profile("olmo-3.1-32b-instruct", "olmo-dense", [
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "gate_proj",
    "up_proj",
    "down_proj",
  ]),
  "qwen3-embed-0.6b-lora": profile("qwen3-embed-0.6b-lora", "qwen3-embedding", [
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "gate_proj",
    "up_proj",
    "down_proj",
  ]),
};
export function qloraProfile(recipeId: string): QLoRAProfileV1 {
  const p = profiles[recipeId];
  if (!p) throw new RunPodError("RUNPOD_INCOMPATIBLE", `QLORA_RECIPE_UNAVAILABLE: ${recipeId}`);
  return p;
}
export function validateModuleCoverage(
  profile: QLoRAProfileV1,
  discovered: string[],
  adapted: string[],
): ModuleCoverageV1 {
  const missing = profile.requiredTargets.filter((required) => !adapted.some((x) => x.includes(required)));
  const coverage = profile.requiredTargets.length
    ? (profile.requiredTargets.length - missing.length) / profile.requiredTargets.length
    : 0;
  const unknown = adapted.filter((x) => !discovered.includes(x));
  if (unknown.length) throw new RunPodError("RUNPOD_INCOMPATIBLE", `QLORA_UNKNOWN_TARGET: ${unknown.join(",")}`);
  return {
    discovered,
    adapted,
    missing,
    coverage,
    passed: coverage >= profile.minimumCoverage && missing.length === 0,
  };
}
export function validateDistributed(
  input: Omit<DistributedContractV1, "version" | "singleNode" | "reshardSupported" | "productionStatus">,
): DistributedContractV1 {
  if (input.worldSize < 1 || input.visibleDevices.length !== input.worldSize)
    throw new RunPodError("RUNPOD_INCOMPATIBLE", "DISTRIBUTED_VISIBLE_DEVICE_MISMATCH");
  if (input.mode === "single" && input.worldSize !== 1)
    throw new RunPodError("RUNPOD_INCOMPATIBLE", "DISTRIBUTED_MODE_MISMATCH");
  if (input.mode !== "single" && input.ncclEvidence !== "passed")
    throw new RunPodError("RUNPOD_INCOMPATIBLE", "NCCL_PREFLIGHT_UNQUALIFIED");
  if (input.effectiveBatchSize !== input.microBatchSize * input.gradientAccumulation * input.worldSize)
    throw new RunPodError("RUNPOD_INCOMPATIBLE", "EFFECTIVE_BATCH_MISMATCH");
  if (input.checkpointWorldSize !== input.worldSize)
    throw new RunPodError("RUNPOD_INCOMPATIBLE", "CHECKPOINT_WORLD_SIZE_INCOMPATIBLE: reshard unsupported");
  return { ...input, version: "1.0.0", singleNode: true, reshardSupported: false, productionStatus: "unavailable" };
}
export function selectRecovery(
  checkpoints: Array<{
    path: string;
    step: number;
    complete: boolean;
    sha256: string;
    contents: Uint8Array;
    worldSize: number;
  }>,
  expectedWorldSize: number,
  previousStep: number,
  attempt: number,
  maxLossSteps: number,
): RecoveryReportV1 {
  const fallbacks: string[] = [];
  for (const cp of [...checkpoints].sort((a, b) => b.step - a.step)) {
    if (!cp.complete) {
      fallbacks.push(`${cp.path}:partial`);
      continue;
    }
    if (createHash("sha256").update(cp.contents).digest("hex") !== cp.sha256) {
      fallbacks.push(`${cp.path}:corrupt`);
      continue;
    }
    if (cp.worldSize !== expectedWorldSize)
      throw new RunPodError("RUNPOD_INCOMPATIBLE", "CHECKPOINT_WORLD_SIZE_INCOMPATIBLE: reshard unsupported");
    const loss = Math.max(0, previousStep - cp.step);
    if (loss > maxLossSteps) throw new RunPodError("RUNPOD_INCOMPATIBLE", `RECOVERY_LOSS_BOUND_EXCEEDED: ${loss}`);
    return {
      version: "1.0.0",
      checkpoint: cp.path,
      classification: "full-resume",
      step: cp.step,
      previousStep,
      lossWindowSteps: loss,
      attempt,
      worldSizeCompatible: true,
      fallbacks,
    };
  }
  return {
    version: "1.0.0",
    checkpoint: "",
    classification: fallbacks.some((x) => x.includes("corrupt")) ? "corrupt-skipped" : "none",
    step: 0,
    previousStep,
    lossWindowSteps: previousStep,
    attempt,
    worldSizeCompatible: true,
    fallbacks,
  };
}
export function rankCapacityAlternatives(
  plan: RunPodPlanV1,
  candidates: Array<{ gpuType: string; vramGiB: number; dataCenterId: string; hourlyUsd: number; available: number }>,
  minimumVramGiB: number,
): CapacityAlternativeV1[] {
  return candidates
    .map((c) => {
      const reasons: string[] = [];
      if (c.available < 1) reasons.push("capacity");
      if (c.dataCenterId !== plan.volume.dataCenterId) reasons.push("volume-locality");
      if (c.vramGiB < minimumVramGiB) reasons.push("vram");
      return {
        gpuType: c.gpuType,
        vramGiB: c.vramGiB,
        dataCenterId: c.dataCenterId,
        hourlyUsd: c.hourlyUsd,
        rank: 0,
        compatible: reasons.length === 0,
        reasons,
        requiresConfirmation: true as const,
        changes: {
          hardware: true as const,
          cost: c.hourlyUsd !== plan.cost.hourlyUsd,
          model: false as const,
          precision: false as const,
          quantization: false as const,
          gpuCount: false as const,
          distributedMode: false as const,
        },
      };
    })
    .sort((a, b) => Number(b.compatible) - Number(a.compatible) || a.hourlyUsd - b.hourlyUsd)
    .map((x, i) => ({ ...x, rank: i + 1 }));
}
export function reconcileCosts(input: {
  runId: string;
  estimatedComputeUsd: number;
  estimatedStorageUsd: number;
  estimateAt: string;
  elapsedSeconds: number;
  hourlyUsd: number;
  observedAt: string;
  billedComputeUsd?: number;
  billedStorageUsd?: number;
  billingFrom?: string;
  billingThrough?: string;
  billingRetrievedAt?: string;
  retainedResources: string[];
}): RunPodCostReportV1 {
  return {
    version: "1.0.0",
    runId: input.runId,
    estimated: { computeUsd: input.estimatedComputeUsd, storageUsd: input.estimatedStorageUsd, asOf: input.estimateAt },
    observed: {
      elapsedSeconds: input.elapsedSeconds,
      computeUsd: (input.hourlyUsd * input.elapsedSeconds) / 3600,
      asOf: input.observedAt,
    },
    billed: {
      ...(input.billedComputeUsd === undefined ? {} : { computeUsd: input.billedComputeUsd }),
      ...(input.billedStorageUsd === undefined ? {} : { storageUsd: input.billedStorageUsd }),
      ...(input.billingFrom ? { from: input.billingFrom } : {}),
      ...(input.billingThrough ? { through: input.billingThrough } : {}),
      ...(input.billingRetrievedAt ? { retrievedAt: input.billingRetrievedAt } : {}),
      lagging: !input.billingThrough || Date.parse(input.billingThrough) < Date.parse(input.observedAt),
    },
    retainedResources: input.retainedResources,
    uncertainty: [
      "Billing history can lag elapsed estimates.",
      "Storage and retained resources are accounted separately.",
      "Control-plane failure can cause overspend.",
    ],
    hardCap: false,
  };
}
export function assertUploadPolicy(input: { enabled: boolean; credentialEnv?: string; explicitAction: boolean }) {
  if (!input.enabled) return { enabled: false };
  if (!input.explicitAction || !input.credentialEnv)
    throw new RunPodError("RUNPOD_INCOMPATIBLE", "UPLOAD_REQUIRES_EXPLICIT_ACTION_AND_NAMED_CREDENTIAL");
  return { enabled: true, credentialEnv: input.credentialEnv };
}
export function assertIsolatedRuns(states: RunPodRunStateV1[]) {
  const prefixes = new Set<string>(),
    attempts = new Set<string>();
  for (const s of states) {
    const prefix = `/workspace/runs/${s.runId}`;
    if (prefixes.has(prefix) || attempts.has(s.attemptId))
      throw new RunPodError("RUNPOD_INCOMPATIBLE", "RUN_RESOURCE_COLLISION");
    prefixes.add(prefix);
    attempts.add(s.attemptId);
  }
  return true;
}
function profile(recipeId: string, architecture: ArchitectureFamily, requiredTargets: string[]): QLoRAProfileV1 {
  return {
    version: "1.0.0",
    recipeId,
    architecture,
    quantization: "nf4-4bit",
    computePrecision: "bf16",
    doubleQuantization: true,
    kernels: ["cuda", "bitsandbytes", "peft"],
    requiredTargets,
    minimumCoverage: 1,
    memoryProbeRequired: true,
    adapterReloadRequired: true,
    productionStatus: "unavailable",
    unavailableReasons: [
      "real GPU forward/backward, memory, kernel and adapter reload evidence not run",
      "RunPod mutation lifecycle not live-qualified",
    ],
  };
}
