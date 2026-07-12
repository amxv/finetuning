import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const qualificationSchemaVersion = "2.0.0" as const;
export type QualificationState = "configured" | "smokeAuthorized" | "smokePassed" | "qualified";
export type QualificationOperationClass = "mechanicsSmoke" | "qualificationRun" | "experimentalUse";
export type SupportState = "unavailable" | "experimental" | "supported";
export type ArchitectureFamily = "dense" | "hybrid" | "moe" | "hybrid-moe" | "custom-code";
export type QualificationBlockerPhase = "smokeAuthorization" | "smokePass";
export interface QualificationBlocker {
  code: string;
  phase: QualificationBlockerPhase;
  message: string;
}

export interface QualificationRecipeV2 {
  recipeSchemaVersion: typeof qualificationSchemaVersion;
  id: string;
  track: "chat" | "embedding";
  modelId: string;
  revision: string;
  identity: {
    tokenizerRevision: string;
    configRevision: string;
    templateHash:
      { status: "required"; sha256: null } | { status: "pinned"; sha256: string } | { status: "not-required" };
    codeRevision: { status: "not-required" } | { status: "required"; revision: null; sha256: null };
  };
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
  blockerRecords: QualificationBlocker[];
  runtime: {
    gpu: string;
    vramGiB: number;
    storageGiB: number;
    image: { status: "required"; candidate: string; digest: null };
    distributed: string;
  };
  rendering?: {
    maskStrategy: "verified-token-boundaries-v1";
    eosPolicy: string;
    padPolicy: string;
    assistantBoundaryPolicy: string;
    reasoningPolicy: string;
    historyThinking: string;
    toolPolicy: string;
    goldenFixtureIds: string[];
    fixtureStatus: "blocked-pending-upstream-artifact-capture";
  };
  embedding?: {
    queryPrompt: string;
    documentPrompt: string;
    pooling: "cls" | "last-token" | "mean";
    paddingSide: "left" | "right";
    normalization: "l2";
    dimensions: number[];
    objective: "info-nce-matryoshka" | "info-nce" | "native-lane-required";
    negativePolicy: string;
    nativeHeads: string[];
    excludedHeads: string[];
  };
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
  image: { status: "required" as const, candidate: "ubuntu-22.04-cuda-12.6-python-3.11-pytorch-2.8", digest: null },
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

export const qualificationBlockerCatalog: Record<string, Omit<QualificationBlocker, "code">> = {
  TEXT_ONLY_LOADER_UNIMPLEMENTED: {
    phase: "smokeAuthorization",
    message: "verified text-only conditional-generation loader not implemented",
  },
  ARCHITECTURE_INVENTORY_REQUIRED: { phase: "smokeAuthorization", message: "architecture inventory hash required" },
  ASSISTANT_MASK_FIXTURES_REQUIRED: {
    phase: "smokeAuthorization",
    message: "manual assistant-mask fixtures required",
  },
  GPU_MECHANICS_EVIDENCE_ABSENT: { phase: "smokePass", message: "GPU mechanics evidence absent" },
  FIRST_SMOKE_WAVE_NOT_AUTHORIZED: { phase: "smokeAuthorization", message: "not authorized in first smoke wave" },
  PACKED_EXPERT_TARGETS_UNRESOLVED: {
    phase: "smokeAuthorization",
    message: "packed expert target_parameters unresolved",
  },
  ROUTER_EXPERT_RELOAD_EVIDENCE_ABSENT: {
    phase: "smokeAuthorization",
    message: "router/expert save-reload evidence absent",
  },
  LICENSE_ARTIFACT_ABSENT: { phase: "smokeAuthorization", message: "pinned LICENSE artifact absent" },
  REMOTE_CODE_KERNELS_UNREVIEWED: {
    phase: "smokeAuthorization",
    message: "remote code and Mamba kernels unreviewed",
  },
  NEMOTRON_ADAPTER_ABSENT: { phase: "smokeAuthorization", message: "dedicated Nemotron adapter absent" },
  REASONING_MASK_POLICY_EVIDENCE_ABSENT: {
    phase: "smokeAuthorization",
    message: "reasoning-mask policy evidence absent",
  },
  REMOTE_CODE_IDENTITY_REVIEW_REQUIRED: {
    phase: "smokeAuthorization",
    message: "remote code revision/hash review required",
  },
  BGE_MIT_INVENTORY_UNAPPROVED: {
    phase: "smokeAuthorization",
    message: "corrected MIT legal inventory not yet approved",
  },
  SPARSE_COLBERT_HYBRID_HEADS_EXCLUDED: {
    phase: "smokeAuthorization",
    message: "sparse/ColBERT/hybrid heads excluded",
  },
  NATIVE_CONTRASTORS_MEGABLOCKS_LANE_REQUIRED: {
    phase: "smokeAuthorization",
    message: "native Contrastors/MegaBlocks lane required",
  },
  EXTERNAL_CODE_LICENSE_REVIEW_ABSENT: {
    phase: "smokeAuthorization",
    message: "external code revision/license review absent",
  },
  ROUTER_TELEMETRY_EVIDENCE_ABSENT: {
    phase: "smokeAuthorization",
    message: "router auxiliary-loss and utilization evidence absent",
  },
  GTE_NEW_IMPL_REVIEW_REQUIRED: {
    phase: "smokeAuthorization",
    message: "Alibaba-NLP/new-impl revision/hash/license review required",
  },
  SPARSE_HEAD_EXCLUDED: { phase: "smokeAuthorization", message: "sparse head excluded" },
};
const blockerCodeByMessage = new Map(
  Object.entries(qualificationBlockerCatalog).map(([code, blocker]) => [blocker.message, code]),
);
const blockerRecords = (messages: string[]): QualificationBlocker[] =>
  messages.map((message) => {
    const code = blockerCodeByMessage.get(message);
    if (!code) throw new Error(`Missing qualification blocker code for: ${message}`);
    const blocker = qualificationBlockerCatalog[code];
    if (!blocker) throw new Error(`Missing qualification blocker definition for: ${code}`);
    return { code, ...blocker };
  });

const baseQualificationRecipes: readonly Omit<QualificationRecipeV2, "identity" | "blockerRecords">[] = [
  {
    ...common,
    id: "qwen3.6-27b",
    track: "chat",
    modelId: "Qwen/Qwen3.6-27B",
    revision: "6a9e13bd6fc8f0983b9b99948120bc37f49c13e9",
    license: legal("Apache-2.0", true, "pinned repository LICENSE"),
    architecture: { family: "hybrid", modelType: "qwen3_5", remoteCode: false, customKernels: [] },
    qualification: { ...common.qualification, firstWaveExecutable: false },
    optimization: opt(
      ["qlora", "lora"],
      ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj", "linear_attn"],
      ["vision", "lm_head"],
    ),
    blockers: [
      "verified text-only conditional-generation loader not implemented",
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
      ["lora"],
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
    optimization: opt(["lora"], ["packed_qkv", "output", "ffn"]),
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
    optimization: opt(["lora"], ["query", "key", "value", "dense"], [], [], []),
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
    optimization: opt(["lora"], ["reviewed-encoder-linears"]),
    blockers: [
      "Alibaba-NLP/new-impl revision/hash/license review required",
      "sparse head excluded",
      "GPU mechanics evidence absent",
    ],
    runtime: runtime("A40 or A6000 48GB", 48, 150),
  },
];

const embeddingSemantics: Record<string, NonNullable<QualificationRecipeV2["embedding"]>> = {
  "qwen3-embed-0.6b-lora": {
    queryPrompt: "Instruct: {task}\\nQuery:{query}",
    documentPrompt: "{document}",
    pooling: "last-token",
    paddingSide: "left",
    normalization: "l2",
    dimensions: [32, 64, 128, 256, 512, 768, 1024],
    objective: "info-nce-matryoshka",
    negativePolicy: "in-batch-and-optional-uniform-hard-negatives",
    nativeHeads: ["dense"],
    excludedHeads: [],
  },
  "arctic-m-v2-full": {
    queryPrompt: "query: {query}",
    documentPrompt: "{document}",
    pooling: "cls",
    paddingSide: "right",
    normalization: "l2",
    dimensions: [256, 768],
    objective: "info-nce-matryoshka",
    negativePolicy: "in-batch-and-optional-uniform-hard-negatives",
    nativeHeads: ["dense"],
    excludedHeads: [],
  },
  "bge-m3-dense": {
    queryPrompt: "{query}",
    documentPrompt: "{document}",
    pooling: "cls",
    paddingSide: "right",
    normalization: "l2",
    dimensions: [1024],
    objective: "info-nce",
    negativePolicy: "in-batch-and-optional-uniform-hard-negatives",
    nativeHeads: ["dense", "sparse", "colbert"],
    excludedHeads: ["sparse", "colbert", "hybrid"],
  },
  "nomic-v2-moe-native": {
    queryPrompt: "search_query: {query}",
    documentPrompt: "search_document: {document}",
    pooling: "mean",
    paddingSide: "right",
    normalization: "l2",
    dimensions: [256, 768],
    objective: "native-lane-required",
    negativePolicy: "native-Contrastors-router-aware",
    nativeHeads: ["dense", "moe-router"],
    excludedHeads: [],
  },
  "gte-multilingual-base-full": {
    queryPrompt: "{query}",
    documentPrompt: "{document}",
    pooling: "cls",
    paddingSide: "right",
    normalization: "l2",
    dimensions: [768],
    objective: "info-nce",
    negativePolicy: "in-batch-and-optional-uniform-hard-negatives",
    nativeHeads: ["dense", "sparse"],
    excludedHeads: ["sparse"],
  },
};
const chatPolicies: Record<
  string,
  Pick<
    NonNullable<QualificationRecipeV2["rendering"]>,
    "eosPolicy" | "padPolicy" | "reasoningPolicy" | "historyThinking" | "toolPolicy"
  >
> = {
  "qwen3.6-27b": {
    eosPolicy: "tokenizer-native-im-end; verify stop IDs",
    padPolicy: "tokenizer-native-endoftext-distinct-from-eos",
    reasoningPolicy: "non-thinking",
    historyThinking: "strip",
    toolPolicy: "template-native-typed-tools",
  },
  "qwen3.6-35b-a3b": {
    eosPolicy: "tokenizer-native-im-end; verify stop IDs",
    padPolicy: "tokenizer-native-endoftext-distinct-from-eos",
    reasoningPolicy: "non-thinking",
    historyThinking: "strip",
    toolPolicy: "template-native-typed-tools",
  },
  "nemotron-cascade-2-30b-a3b": {
    eosPolicy: "im-end",
    padPolicy: "im-end",
    reasoningPolicy: "thinking-policy-required",
    historyThinking: "truncate-or-summarize-reviewed",
    toolPolicy: "tool-results-convert-to-user-with-report",
  },
  "nemotron-3-nano-30b-a3b": {
    eosPolicy: "verify-config-tokenizer-identity",
    padPolicy: "verify-config-tokenizer-identity",
    reasoningPolicy: "explicit",
    historyThinking: "review-required",
    toolPolicy: "review-required",
  },
  "olmo-3.1-32b-instruct": {
    eosPolicy: "last-assistant-endoftext",
    padPolicy: "pad-token-distinct-from-eos",
    reasoningPolicy: "none",
    historyThinking: "none",
    toolPolicy: "template-native-pending-roundtrip-fixture",
  },
  "olmo-3.1-32b-think": {
    eosPolicy: "last-assistant-endoftext",
    padPolicy: "pad-token-distinct-from-eos",
    reasoningPolicy: "explicit-reasoning-or-final-only",
    historyThinking: "preserve-policy-bound",
    toolPolicy: "unsupported-until-fixture",
  },
};
export const qualificationRecipes: readonly QualificationRecipeV2[] = baseQualificationRecipes.map((recipe) => {
  const identity: NonNullable<QualificationRecipeV2["identity"]> = {
    tokenizerRevision: recipe.revision,
    configRevision: recipe.revision,
    templateHash: recipe.track === "chat" ? { status: "required", sha256: null } : { status: "not-required" },
    codeRevision: recipe.architecture.remoteCode
      ? { status: "required", revision: null, sha256: null }
      : { status: "not-required" },
  };
  if (recipe.track === "embedding") {
    const embedding = embeddingSemantics[recipe.id];
    if (!embedding) throw new Error(`Missing embedding semantics for ${recipe.id}`);
    return { ...recipe, identity, blockerRecords: blockerRecords(recipe.blockers), embedding };
  }
  const policy = chatPolicies[recipe.id];
  if (!policy) throw new Error(`Missing chat render policy for ${recipe.id}`);
  return {
    ...recipe,
    identity,
    blockerRecords: blockerRecords(recipe.blockers),
    rendering: {
      maskStrategy: "verified-token-boundaries-v1",
      assistantBoundaryPolicy: "assistant-delimiter-content-and-template-eos-only",
      goldenFixtureIds: [],
      fixtureStatus: "blocked-pending-upstream-artifact-capture",
      ...policy,
    },
  };
});

export const requiredAuthorizationGates = [
  "experimentalExecutionApproved",
  "stagingNetworkApproved",
  "downloadsApproved",
  "remoteCodeApproved",
  "gpuApproved",
  "budgetApproved",
  "modelLicenseAccepted",
  "datasetRightsApproved",
  "architectureEvidenceApproved",
  "frameworkEvidenceApproved",
  "customKernelApproved",
] as const;
export type AuthorizationGates = Record<(typeof requiredAuthorizationGates)[number], boolean> & {
  uploadRequested: boolean;
  uploadApproved: boolean;
};

export function recipeIdentityHash(recipe: QualificationRecipeV2): string {
  return createHash("sha256").update(JSON.stringify(recipe)).digest("hex");
}
export function inspectQualificationRecipe(id: string): QualificationRecipeV2 {
  const recipe = qualificationRecipes.find((item) => item.id === id);
  if (!recipe) throw new Error(`Unknown qualification recipe: ${id}`);
  return recipe;
}
export function blockersForState(recipe: QualificationRecipeV2, state: Exclude<QualificationState, "configured">) {
  if (state === "smokeAuthorized")
    return recipe.blockerRecords
      .filter((blocker) => blocker.phase === "smokeAuthorization")
      .map((blocker) => blocker.code);
  if (state === "smokePassed")
    return recipe.blockerRecords.filter((blocker) => blocker.phase === "smokePass").map((blocker) => blocker.code);
  return [];
}
const operationForState: Record<Exclude<QualificationState, "configured">, QualificationOperationClass> = {
  smokeAuthorized: "mechanicsSmoke",
  smokePassed: "qualificationRun",
  qualified: "experimentalUse",
};
export interface QualificationPreflightInput {
  storePath: string;
  artifactPaths: Record<string, string>;
  operationClass: QualificationOperationClass;
  trustPolicy: QualificationTrustPolicyV1;
  expectedTrustPolicySha256: string;
  expectedBindings?: QualificationEvidenceV2["bindings"];
  now?: Date;
}
export async function preflightQualification(id: string, input?: QualificationPreflightInput) {
  const recipe = inspectQualificationRecipe(id);
  const blockers: string[] = [];
  if (!recipe.qualification.firstWaveExecutable) blockers.push("recipe is non-executable in first smoke wave");
  if (!input) {
    blockers.push("accepted recipe-bound smokeAuthorized evidence required");
  } else {
    try {
      const store = JSON.parse(await readFile(input.storePath, "utf8")) as QualificationStoreV2;
      const policyDigest = qualificationTrustPolicyDigest(input.trustPolicy);
      const current = store.recipes[id];
      if (
        store.storeVersion !== "2.0.0" ||
        store.trustPolicySha256 !== policyDigest ||
        policyDigest !== input.expectedTrustPolicySha256 ||
        !current ||
        current.sequence !== current.acceptedEvidence.length ||
        current.sequence < 1
      )
        throw new Error("persisted qualification state is invalid");
      let previousState: QualificationState = "configured";
      let predecessorDigest = recipeIdentityHash(recipe);
      for (const [index, evidence] of current.acceptedEvidence.entries()) {
        const artifactPath = input.artifactPaths[evidence.evidenceId];
        if (!artifactPath) throw new Error(`artifact path missing for ${evidence.evidenceId}`);
        await validateQualificationEvidenceValue(evidence, await readFile(artifactPath), {
          artifactPath,
          trustPolicy: input.trustPolicy,
          expectedTrustPolicySha256: input.expectedTrustPolicySha256,
          expectedPredecessorDigest: predecessorDigest,
          expectedPreviousState: previousState,
          expectedSequence: index + 1,
          enforceCurrentExpiry: index === current.acceptedEvidence.length - 1,
          ...(index === current.acceptedEvidence.length - 1 && input.expectedBindings
            ? { expectedBindings: input.expectedBindings }
            : {}),
          ...(input.now ? { now: input.now } : {}),
        });
        previousState = evidence.state;
        predecessorDigest = qualificationEvidenceDigest(evidence);
      }
      if (
        previousState !== current.state ||
        predecessorDigest !== current.currentDigest ||
        operationForState[current.state as Exclude<QualificationState, "configured">] !== input.operationClass
      )
        throw new Error("requested operation is not authorized by current qualification state");
    } catch (error) {
      blockers.push(
        `accepted recipe-bound smokeAuthorized evidence invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
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
    executableEnvironment: false,
    distributedStrategy: recipe.runtime.distributed,
    executableInFirstWave: recipe.qualification.firstWaveExecutable,
    blockers: recipe.blockers,
  };
}

export interface QualificationEvidenceV2 {
  evidenceVersion: "2.0.0";
  evidenceId: string;
  sequence: number;
  recipeId: string;
  recipeIdentityHash: string;
  architecture: string;
  revision: string;
  state: Exclude<QualificationState, "configured">;
  previousState: QualificationState;
  predecessorDigest: string;
  issuedAt: string;
  expiresAt: string;
  signerKeyId: string;
  trustPolicySha256: string;
  artifactSha256: string;
  bindings: {
    commandSha256: string;
    imageDigest: string;
    environmentLockSha256: string;
    tokenizerSha256: string;
    configSha256: string;
    templateOrCodeSha256: string;
    datasetSha256: string;
    targetInventorySha256: string;
    dependencyIdentitySha256: string;
  };
  assertions: Record<string, boolean>;
  authorization: {
    operationClass: QualificationOperationClass;
    gates: AuthorizationGates;
    dischargedBlockers: string[];
  };
  signatureBase64: string;
}
const transitions: Record<QualificationState, QualificationState[]> = {
  configured: ["smokeAuthorized"],
  smokeAuthorized: ["smokePassed"],
  smokePassed: ["qualified"],
  qualified: [],
};
const mandatoryAssertions: Record<Exclude<QualificationState, "configured">, readonly string[]> = {
  smokeAuthorized: [
    "policyGatesReviewed",
    "licenseAccepted",
    "architectureReviewed",
    "frameworkReviewed",
    "datasetRightsReviewed",
    "offlineExecutionNoUpload",
  ],
  smokePassed: ["forwardBackward", "finiteLoss", "finiteNonzeroGradients", "checkpointResume", "offlineReload"],
  qualified: ["repeatedCleanRun", "evaluation", "export", "artifactManifestVerified"],
};
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const canonicalEvidence = (evidence: QualificationEvidenceV2): string =>
  JSON.stringify({ ...evidence, signatureBase64: "" });
export const qualificationEvidenceDigest = (evidence: QualificationEvidenceV2): string =>
  sha256(JSON.stringify(evidence));

export interface QualificationStoreV2 {
  storeVersion: "2.0.0";
  trustPolicySha256: string;
  recipes: Record<
    string,
    {
      state: QualificationState;
      sequence: number;
      currentDigest: string;
      evidenceIds: string[];
      evidenceDigests: string[];
      acceptedEvidence: QualificationEvidenceV2[];
    }
  >;
}
export interface EvidenceValidationOptions {
  artifactPath: string;
  trustPolicy: QualificationTrustPolicyV1;
  expectedTrustPolicySha256: string;
  expectedPredecessorDigest: string;
  expectedPreviousState: QualificationState;
  expectedSequence: number;
  expectedBindings?: QualificationEvidenceV2["bindings"];
  now?: Date;
  enforceCurrentExpiry?: boolean;
}

export interface QualificationTrustPolicyV1 {
  policyVersion: "1.0.0";
  policyId: string;
  keys: Record<string, string>;
}
export const qualificationTrustPolicyDigest = (policy: QualificationTrustPolicyV1): string =>
  sha256(JSON.stringify(policy));

async function validateQualificationEvidenceValue(
  evidence: QualificationEvidenceV2,
  artifact: Uint8Array,
  options: EvidenceValidationOptions,
): Promise<QualificationEvidenceV2> {
  const recipe = inspectQualificationRecipe(evidence.recipeId);
  const policyDigest = qualificationTrustPolicyDigest(options.trustPolicy);
  if (policyDigest !== options.expectedTrustPolicySha256 || evidence.trustPolicySha256 !== policyDigest)
    throw new Error("Qualification evidence trust policy is not independently pinned");
  if (evidence.evidenceVersion !== "2.0.0" || !/^[A-Za-z0-9._-]{8,128}$/.test(evidence.evidenceId))
    throw new Error("Qualification evidence envelope is invalid");
  if (
    evidence.recipeIdentityHash !== recipeIdentityHash(recipe) ||
    evidence.revision !== recipe.revision ||
    evidence.architecture !== recipe.architecture.modelType
  )
    throw new Error("Qualification evidence identity/revision/architecture mismatch");
  if (
    evidence.previousState !== options.expectedPreviousState ||
    evidence.sequence !== options.expectedSequence ||
    evidence.predecessorDigest !== options.expectedPredecessorDigest ||
    !transitions[evidence.previousState]?.includes(evidence.state)
  )
    throw new Error("Qualification evidence transition is not monotonic");
  if (evidence.artifactSha256 !== sha256(artifact)) throw new Error("Qualification evidence artifact digest mismatch");
  const bindingValues = Object.values(evidence.bindings ?? {});
  if (bindingValues.length !== 9 || bindingValues.some((value) => !/^[a-f0-9]{64}$/.test(value)))
    throw new Error("Qualification evidence bindings are incomplete");
  if (options.expectedBindings && JSON.stringify(evidence.bindings) !== JSON.stringify(options.expectedBindings))
    throw new Error("Qualification evidence dependency/template identity is stale");
  const required = mandatoryAssertions[evidence.state];
  if (
    Object.keys(evidence.assertions ?? {}).some((key) => !required.includes(key)) ||
    required.some((key) => evidence.assertions?.[key] !== true)
  )
    throw new Error("Qualification evidence assertions are incomplete");
  if (!evidence.authorization) throw new Error("Signed operation authorization decisions are required");
  if (evidence.authorization.operationClass !== operationForState[evidence.state])
    throw new Error("Signed operation class does not match qualification state");
  if (
    JSON.stringify(evidence.authorization.dischargedBlockers) !==
    JSON.stringify(blockersForState(recipe, evidence.state))
  )
    throw new Error("Signed blocker discharge does not exactly match the operation phase");
  const gateKeys = [...requiredAuthorizationGates, "uploadRequested", "uploadApproved"];
  if (
    Object.keys(evidence.authorization.gates).sort().join(",") !== gateKeys.sort().join(",") ||
    requiredAuthorizationGates.some((gate) => evidence.authorization.gates[gate] !== true) ||
    evidence.authorization.gates.uploadRequested !== false ||
    evidence.authorization.gates.uploadApproved !== false
  )
    throw new Error("Signed operation authorization gates are invalid");
  const issued = Date.parse(evidence.issuedAt),
    expires = Date.parse(evidence.expiresAt),
    now = (options.now ?? new Date()).getTime();
  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    issued > now ||
    expires <= issued ||
    ((options.enforceCurrentExpiry ?? true) && expires <= now)
  )
    throw new Error("Qualification evidence is stale or has invalid timestamps");
  const publicKey = options.trustPolicy.keys[evidence.signerKeyId];
  if (!publicKey) throw new Error("Qualification evidence signer is not trusted");
  const valid = verifySignature(
    null,
    Buffer.from(canonicalEvidence(evidence)),
    createPublicKey(publicKey),
    Buffer.from(evidence.signatureBase64, "base64"),
  );
  if (!valid) throw new Error("Qualification evidence signature mismatch");
  return evidence;
}

export async function validateQualificationEvidence(
  path: string,
  options: EvidenceValidationOptions,
): Promise<QualificationEvidenceV2> {
  const evidence = JSON.parse(await readFile(path, "utf8")) as QualificationEvidenceV2;
  return validateQualificationEvidenceValue(evidence, await readFile(options.artifactPath), options);
}

export interface RecordQualificationEvidenceInput {
  evidencePath: string;
  artifactPath: string;
  storePath: string;
  trustPolicy: QualificationTrustPolicyV1;
  expectedTrustPolicySha256: string;
  expectedBindings?: QualificationEvidenceV2["bindings"];
  now?: Date;
}
export async function recordQualificationEvidence(
  input: RecordQualificationEvidenceInput,
): Promise<{ evidence: QualificationEvidenceV2; digest: string; store: QualificationStoreV2 }> {
  await mkdir(dirname(input.storePath), { recursive: true });
  const lockPath = `${input.storePath}.lock`;
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error("Qualification store update is already in progress; compare-and-swap rejected");
    throw error;
  }
  try {
    return await recordQualificationEvidenceUnlocked(input);
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

async function recordQualificationEvidenceUnlocked(
  input: RecordQualificationEvidenceInput,
): Promise<{ evidence: QualificationEvidenceV2; digest: string; store: QualificationStoreV2 }> {
  const trustPolicySha256 = qualificationTrustPolicyDigest(input.trustPolicy);
  if (trustPolicySha256 !== input.expectedTrustPolicySha256)
    throw new Error("Qualification trust policy digest is not independently pinned");
  let store: QualificationStoreV2 = { storeVersion: "2.0.0", trustPolicySha256, recipes: {} };
  try {
    store = JSON.parse(await readFile(input.storePath, "utf8")) as QualificationStoreV2;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (store.storeVersion !== "2.0.0" || store.trustPolicySha256 !== trustPolicySha256)
    throw new Error("Qualification store version/trust policy is incompatible");
  const raw = JSON.parse(await readFile(input.evidencePath, "utf8")) as QualificationEvidenceV2;
  const recipe = inspectQualificationRecipe(raw.recipeId);
  const current = store.recipes[raw.recipeId] ?? {
    state: "configured" as const,
    sequence: 0,
    currentDigest: recipeIdentityHash(recipe),
    evidenceIds: [],
    evidenceDigests: [],
    acceptedEvidence: [],
  };
  const evidence = await validateQualificationEvidence(input.evidencePath, {
    artifactPath: input.artifactPath,
    trustPolicy: input.trustPolicy,
    expectedTrustPolicySha256: input.expectedTrustPolicySha256,
    expectedPredecessorDigest: current.currentDigest,
    expectedPreviousState: current.state,
    expectedSequence: current.sequence + 1,
    ...(input.expectedBindings ? { expectedBindings: input.expectedBindings } : {}),
    ...(input.now ? { now: input.now } : {}),
  });
  const digest = qualificationEvidenceDigest(evidence);
  if (current.evidenceIds.includes(evidence.evidenceId) || current.evidenceDigests.includes(digest))
    throw new Error("Qualification evidence replay rejected");
  store.recipes[evidence.recipeId] = {
    state: evidence.state,
    sequence: evidence.sequence,
    currentDigest: digest,
    evidenceIds: [...current.evidenceIds, evidence.evidenceId],
    evidenceDigests: [...current.evidenceDigests, digest],
    acceptedEvidence: [...current.acceptedEvidence, evidence],
  };
  await mkdir(dirname(input.storePath), { recursive: true });
  const temporary = `${input.storePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, input.storePath);
  return { evidence, digest, store };
}
