import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const qualificationSchemaVersion = "2.0.0" as const;
export type QualificationState = "configured" | "smokeAuthorized" | "smokePassed" | "qualified";
export type SupportState = "unavailable" | "experimental" | "supported";
export type ArchitectureFamily = "dense" | "hybrid" | "moe" | "hybrid-moe" | "custom-code";

export interface QualificationRecipeV2 {
  recipeSchemaVersion: typeof qualificationSchemaVersion;
  id: string;
  track: "chat" | "embedding";
  modelId: string;
  revision: string;
  license: { spdx: string; pinnedArtifact: boolean; note: string };
  architecture: { family: ArchitectureFamily; modelType: string; remoteCode: boolean; customKernels: string[] };
  qualification: { state: "configured"; supportState: "unavailable"; firstWaveExecutable: boolean };
  optimization: {
    methods: ("lora" | "qlora" | "full")[];
    targetModules: string[];
    targetParameters: string[];
    modulesToSave: string[];
    frozen: string[];
  };
  blockers: string[];
  runtime: { gpu: string; vramGiB: number; storageGiB: number; image: string; distributed: string };
}

const common = {
  recipeSchemaVersion: qualificationSchemaVersion,
  qualification: { state: "configured", supportState: "unavailable", firstWaveExecutable: true },
} as const;
const runtime = (
  gpu: string,
  vramGiB: number,
  storageGiB: number,
  distributed = "single-gpu-only-until-qualified",
) => ({
  gpu,
  vramGiB,
  storageGiB,
  image: "ubuntu-22.04-cuda-12.6-python-3.11-pytorch-2.8@sha256:required",
  distributed,
});
const legal = (spdx: string, pinnedArtifact: boolean, note: string) => ({ spdx, pinnedArtifact, note });
const opt = (
  methods: QualificationRecipeV2["optimization"]["methods"],
  targetModules: string[],
  frozen: string[] = [],
  targetParameters: string[] = [],
  modulesToSave: string[] = [],
) => ({ methods, targetModules, targetParameters, modulesToSave, frozen });

export const qualificationRecipes: readonly QualificationRecipeV2[] = [
  {
    ...common,
    id: "qwen3.6-27b",
    track: "chat",
    modelId: "Qwen/Qwen3.6-27B",
    revision: "6a9e13bd6fc8f0983b9b99948120bc37f49c13e9",
    license: legal("Apache-2.0", true, "pinned repository LICENSE"),
    architecture: { family: "hybrid", modelType: "qwen3_5", remoteCode: false, customKernels: [] },
    optimization: opt(
      ["qlora", "lora"],
      ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj", "linear_attn"],
      ["vision", "lm_head"],
    ),
    blockers: [
      "architecture inventory hash required",
      "manual assistant-mask fixtures required",
      "GPU mechanics evidence absent",
    ],
    runtime: runtime("H100 80GB or RTX PRO 6000 96GB", 80, 300),
  },
  {
    ...common,
    id: "qwen3.6-35b-a3b",
    track: "chat",
    modelId: "Qwen/Qwen3.6-35B-A3B",
    revision: "995ad96eacd98c81ed38be0c5b274b04031597b0",
    license: legal("Apache-2.0", true, "pinned repository LICENSE"),
    architecture: { family: "hybrid-moe", modelType: "qwen3_5_moe", remoteCode: false, customKernels: [] },
    qualification: { ...common.qualification, firstWaveExecutable: false },
    optimization: opt(
      ["qlora"],
      ["q_proj", "k_proj", "v_proj", "o_proj", "linear_attn"],
      ["router", "experts", "vision", "lm_head"],
      ["expert-packed-parameters-after-qualification"],
    ),
    blockers: [
      "not authorized in first smoke wave",
      "packed expert target_parameters unresolved",
      "router/expert save-reload evidence absent",
    ],
    runtime: runtime("H100 80GB or RTX PRO 6000 96GB", 80, 300),
  },
  {
    ...common,
    id: "nemotron-cascade-2-30b-a3b",
    track: "chat",
    modelId: "nvidia/Nemotron-Cascade-2-30B-A3B",
    revision: "6327cdbcf907e1c7cec9cb29fb6e6cebdf8feaf7",
    license: legal(
      "LicenseRef-NVIDIA-Open-Model",
      false,
      "URL-hosted terms require snapshot, hash, and legal acceptance",
    ),
    architecture: { family: "custom-code", modelType: "nemotron_h", remoteCode: true, customKernels: ["mamba"] },
    qualification: { ...common.qualification, firstWaveExecutable: false },
    optimization: opt(["qlora"], [], ["router", "experts"]),
    blockers: [
      "not authorized in first smoke wave",
      "pinned LICENSE artifact absent",
      "remote code and Mamba kernels unreviewed",
      "dedicated Nemotron adapter absent",
    ],
    runtime: runtime("RTX PRO 6000 96GB or H100 80GB", 80, 300),
  },
  {
    ...common,
    id: "nemotron-3-nano-30b-a3b",
    track: "chat",
    modelId: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16",
    revision: "cbd3fa9f933d55ef16a84236559f4ee2a0526848",
    license: legal(
      "LicenseRef-NVIDIA-Nemotron-Open-Model",
      false,
      "URL-hosted terms require snapshot, hash, and legal acceptance",
    ),
    architecture: { family: "custom-code", modelType: "nemotron_h", remoteCode: true, customKernels: ["mamba"] },
    qualification: { ...common.qualification, firstWaveExecutable: false },
    optimization: opt(["qlora"], [], ["router", "experts"]),
    blockers: [
      "not authorized in first smoke wave",
      "pinned LICENSE artifact absent",
      "remote code and Mamba kernels unreviewed",
      "dedicated Nemotron adapter absent",
    ],
    runtime: runtime("RTX PRO 6000 96GB or H100 80GB", 80, 300),
  },
  {
    ...common,
    id: "olmo-3.1-32b-instruct",
    track: "chat",
    modelId: "allenai/Olmo-3.1-32B-Instruct",
    revision: "ac0587e4a7744a551c059d8cd17ba220bc940dae",
    license: legal("Apache-2.0", false, "metadata only; authoritative license artifact required"),
    architecture: { family: "dense", modelType: "olmo3", remoteCode: false, customKernels: [] },
    optimization: opt(
      ["qlora", "lora"],
      ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
      ["lm_head"],
    ),
    blockers: [
      "pinned LICENSE artifact absent",
      "manual assistant-mask fixtures required",
      "GPU mechanics evidence absent",
    ],
    runtime: runtime("H100 or A100 80GB", 80, 250),
  },
  {
    ...common,
    id: "olmo-3.1-32b-think",
    track: "chat",
    modelId: "allenai/Olmo-3.1-32B-Think",
    revision: "832c3f543499af8fe68b88359501de9cb7840544",
    license: legal("Apache-2.0", false, "metadata only; authoritative license artifact required"),
    architecture: { family: "dense", modelType: "olmo3", remoteCode: false, customKernels: [] },
    optimization: opt(
      ["qlora", "lora"],
      ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
      ["lm_head"],
    ),
    blockers: [
      "pinned LICENSE artifact absent",
      "reasoning-mask policy evidence absent",
      "GPU mechanics evidence absent",
    ],
    runtime: runtime("H100 or A100 80GB", 80, 250),
  },
  {
    ...common,
    id: "qwen3-embed-0.6b-lora",
    track: "embedding",
    modelId: "Qwen/Qwen3-Embedding-0.6B",
    revision: "97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3",
    license: legal("Apache-2.0", false, "metadata only; authoritative license artifact required"),
    architecture: { family: "dense", modelType: "qwen3", remoteCode: false, customKernels: [] },
    optimization: opt(
      ["lora", "full"],
      ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
      ["lm_head"],
    ),
    blockers: ["pinned LICENSE artifact absent", "GPU mechanics evidence absent"],
    runtime: runtime("RTX 4090 24GB or A40 48GB", 24, 100),
  },
  {
    ...common,
    id: "arctic-m-v2-full",
    track: "embedding",
    modelId: "Snowflake/snowflake-arctic-embed-m-v2.0",
    revision: "95c2741480856aa9666782eb4afe11959938017f",
    license: legal("Apache-2.0", false, "metadata only; authoritative license artifact required"),
    architecture: { family: "custom-code", modelType: "gte", remoteCode: true, customKernels: [] },
    optimization: opt(["lora", "full"], ["packed_qkv", "output", "ffn"]),
    blockers: [
      "pinned LICENSE artifact absent",
      "remote code revision/hash review required",
      "GPU mechanics evidence absent",
    ],
    runtime: runtime("A40 or A6000 48GB", 48, 100),
  },
  {
    ...common,
    id: "bge-m3-dense",
    track: "embedding",
    modelId: "BAAI/bge-m3",
    revision: "5617a9f61b028005a4858fdac845db406aefb181",
    license: legal(
      "MIT",
      false,
      "former Apache assumption resolved as erroneous; model-card and upstream MIT inventory approval required",
    ),
    architecture: { family: "dense", modelType: "xlm-roberta", remoteCode: false, customKernels: [] },
    optimization: opt(["lora", "full"], ["query", "key", "value", "dense"], [], [], []),
    blockers: [
      "corrected MIT legal inventory not yet approved",
      "sparse/ColBERT/hybrid heads excluded",
      "GPU mechanics evidence absent",
    ],
    runtime: runtime("A40 or A6000 48GB", 48, 150),
  },
  {
    ...common,
    id: "nomic-v2-moe-native",
    track: "embedding",
    modelId: "nomic-ai/nomic-embed-text-v2-moe",
    revision: "1066b6599d099fbb93dfcb64f9c37a7c9e503e85",
    license: legal("Apache-2.0", false, "metadata only; authoritative license artifact required"),
    architecture: {
      family: "custom-code",
      modelType: "nomic_bert",
      remoteCode: true,
      customKernels: ["MegaBlocks", "FlashAttention"],
    },
    qualification: { ...common.qualification, firstWaveExecutable: false },
    optimization: opt(["lora"], [], ["router"], ["expert-packed-parameters-after-qualification"]),
    blockers: [
      "not authorized in first smoke wave",
      "native Contrastors/MegaBlocks lane required",
      "external code revision/license review absent",
      "router auxiliary-loss and utilization evidence absent",
    ],
    runtime: runtime("H100 80GB", 80, 150),
  },
  {
    ...common,
    id: "gte-multilingual-base-full",
    track: "embedding",
    modelId: "Alibaba-NLP/gte-multilingual-base",
    revision: "9bbca17d9273fd0d03d5725c7a4b0f6b45142062",
    license: legal("Apache-2.0", false, "metadata only; authoritative license artifact required"),
    architecture: { family: "custom-code", modelType: "new", remoteCode: true, customKernels: [] },
    optimization: opt(["lora", "full"], ["reviewed-encoder-linears"]),
    blockers: [
      "Alibaba-NLP/new-impl revision/hash/license review required",
      "sparse head excluded",
      "GPU mechanics evidence absent",
    ],
    runtime: runtime("A40 or A6000 48GB", 48, 150),
  },
];

export const requiredAuthorizationGates = [
  "experimentalExecutionApproved",
  "networkApproved",
  "downloadsApproved",
  "remoteCodeApproved",
  "gpuApproved",
  "budgetApproved",
  "uploadsApproved",
  "modelLicenseAccepted",
  "datasetRightsApproved",
  "architectureEvidenceApproved",
  "frameworkEvidenceApproved",
  "customKernelApproved",
] as const;
export type AuthorizationGates = Record<(typeof requiredAuthorizationGates)[number], boolean>;

export function recipeIdentityHash(recipe: QualificationRecipeV2): string {
  return createHash("sha256").update(JSON.stringify(recipe)).digest("hex");
}
export function inspectQualificationRecipe(id: string): QualificationRecipeV2 {
  const recipe = qualificationRecipes.find((item) => item.id === id);
  if (!recipe) throw new Error(`Unknown qualification recipe: ${id}`);
  return recipe;
}
export function preflightQualification(id: string, gates?: Partial<AuthorizationGates>) {
  const recipe = inspectQualificationRecipe(id);
  const closed = requiredAuthorizationGates.filter((gate) => gates?.[gate] !== true);
  const blockers = [...recipe.blockers, ...closed.map((gate) => `authorization gate closed: ${gate}`)];
  if (!recipe.qualification.firstWaveExecutable) blockers.unshift("recipe is non-executable in first smoke wave");
  return {
    recipeId: id,
    configured: true,
    executable: blockers.length === 0,
    identityHash: recipeIdentityHash(recipe),
    blockers,
  };
}
export function planRunPodSmoke(id: string) {
  const recipe = inspectQualificationRecipe(id);
  return {
    planVersion: "1.0.0",
    createsResources: false,
    networkCalls: false,
    recipeId: id,
    revision: recipe.revision,
    gpu: recipe.runtime.gpu,
    minimumVramGiB: recipe.runtime.vramGiB,
    storageGiB: recipe.runtime.storageGiB,
    image: recipe.runtime.image,
    distributedStrategy: recipe.runtime.distributed,
    executableInFirstWave: recipe.qualification.firstWaveExecutable,
    blockers: recipe.blockers,
  };
}

export interface QualificationEvidenceV1 {
  evidenceVersion: "1.0.0";
  recipeId: string;
  recipeIdentityHash: string;
  architecture: string;
  revision: string;
  state: Exclude<QualificationState, "configured">;
  previousState: QualificationState;
  artifactSha256: string;
  assertions: Record<string, boolean>;
  signatureSha256: string;
}
const transitions: Record<QualificationState, QualificationState[]> = {
  configured: ["smokeAuthorized"],
  smokeAuthorized: ["smokePassed"],
  smokePassed: ["qualified"],
  qualified: [],
};
export async function validateQualificationEvidence(path: string): Promise<QualificationEvidenceV1> {
  const raw = await readFile(path, "utf8"),
    evidence = JSON.parse(raw) as QualificationEvidenceV1;
  const recipe = inspectQualificationRecipe(evidence.recipeId);
  if (
    evidence.recipeIdentityHash !== recipeIdentityHash(recipe) ||
    evidence.revision !== recipe.revision ||
    evidence.architecture !== recipe.architecture.modelType
  )
    throw new Error("Qualification evidence identity/revision/architecture mismatch");
  if (!transitions[evidence.previousState]?.includes(evidence.state))
    throw new Error("Qualification evidence transition is not monotonic");
  if (
    !/^[a-f0-9]{64}$/.test(evidence.artifactSha256) ||
    !Object.keys(evidence.assertions ?? {}).length ||
    Object.values(evidence.assertions).some((v) => v !== true)
  )
    throw new Error("Qualification evidence assertions are incomplete");
  const unsigned = { ...evidence, signatureSha256: "" };
  const expected = createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
  if (evidence.signatureSha256 !== expected) throw new Error("Qualification evidence signature mismatch");
  return evidence;
}
