import type { CanonicalRoleV1 } from "../core/canonical.js";
export const templateApiVersion = "1.0.0" as const;
export type Resolution = { status: "pinned"; value: string } | { status: "unresolved"; reason: string };
export interface ChatTemplateDescriptorV1 {
  id: string;
  family: "qwen3-dense" | "qwen3-moe" | "nemotron-cascade" | "nemotron-nano" | "olmo-instruct" | "olmo-think";
  modelId: string;
  modelRevision: Resolution;
  tokenizerId: string;
  tokenizerRevision: Resolution;
  expectedTemplateHash: Resolution;
  supportedRoles: CanonicalRoleV1[];
  tools: boolean;
  reasoningPolicy: "strip" | "preserve" | "none";
  bos: "exactly-one" | "tokenizer";
  eos: "assistant-turn";
  generationPrompt: boolean;
  liveAudit: "not-run" | "passed" | "failed";
}
export interface ModelRecipeV1 {
  id: string;
  production: boolean;
  templateId: string;
  modelId: string;
  architectureFamily: string;
  modelRevision: Resolution;
  tokenizerRevision: Resolution;
  licenseSnapshot: Resolution;
  testedDependencies: Record<string, string>;
  loraTargetDiscovery: string;
  quantization: ("bf16" | "8bit" | "4bit")[];
  minimumHardware: string;
  task: "sft";
  limitations: string[];
}
const unresolved = (reason: string): Resolution => ({ status: "unresolved", reason });
const descriptor = (
  id: string,
  family: ChatTemplateDescriptorV1["family"],
  modelId: string,
  reasoningPolicy: ChatTemplateDescriptorV1["reasoningPolicy"],
  tools = true,
): ChatTemplateDescriptorV1 => ({
  id,
  family,
  modelId,
  modelRevision: unresolved("approved research artifact unavailable"),
  tokenizerId: modelId,
  tokenizerRevision: unresolved("approved research artifact unavailable"),
  expectedTemplateHash: unresolved("requires pinned tokenizer audit"),
  supportedRoles: ["system", "user", "assistant", "tool"],
  tools,
  reasoningPolicy,
  bos: "tokenizer",
  eos: "assistant-turn",
  generationPrompt: true,
  liveAudit: "not-run",
});
const pins: Record<string, string> = {
  "qwen3.6-dense": "6a9e13bd6fc8f0983b9b99948120bc37f49c13e9",
  "qwen3.6-moe": "995ad96eacd98c81ed38be0c5b274b04031597b0",
  "nemotron-cascade-2": "6327cdbcf907e1c7cec9cb29fb6e6cebdf8feaf7",
  "nemotron-nano-3": "cbd3fa9f933d55ef16a84236559f4ee2a0526848",
  "olmo-3.1-instruct": "ac0587e4a7744a551c059d8cd17ba220bc940dae",
  "olmo-3.1-think": "832c3f543499af8fe68b88359501de9cb7840544",
};
const configuredDescriptor = (...args: Parameters<typeof descriptor>): ChatTemplateDescriptorV1 => {
  const value = descriptor(...args);
  const revision = pins[value.id];
  return revision
    ? {
        ...value,
        modelRevision: { status: "pinned", value: revision },
        tokenizerRevision: { status: "pinned", value: revision },
      }
    : value;
};
export const templateRegistry: readonly ChatTemplateDescriptorV1[] = [
  configuredDescriptor("qwen3.6-dense", "qwen3-dense", "Qwen/Qwen3.6-27B", "strip"),
  configuredDescriptor("qwen3.6-moe", "qwen3-moe", "Qwen/Qwen3.6-35B-A3B", "strip"),
  configuredDescriptor("nemotron-cascade-2", "nemotron-cascade", "nvidia/Nemotron-Cascade-2-30B-A3B", "preserve"),
  configuredDescriptor("nemotron-nano-3", "nemotron-nano", "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16", "preserve"),
  configuredDescriptor("olmo-3.1-instruct", "olmo-instruct", "allenai/Olmo-3.1-32B-Instruct", "none"),
  configuredDescriptor("olmo-3.1-think", "olmo-think", "allenai/Olmo-3.1-32B-Think", "preserve"),
  descriptor("qwen3.5-pilot", "qwen3-dense", "Qwen/Qwen3.5-9B", "strip"),
];
const recipe = (
  id: string,
  modelId: string,
  templateId: string,
  architectureFamily: string,
  production = true,
): ModelRecipeV1 => ({
  id,
  production,
  templateId,
  modelId,
  architectureFamily,
  modelRevision: unresolved("exact revision not available"),
  tokenizerRevision: unresolved("exact revision not available"),
  licenseSnapshot: unresolved("license snapshot/hash not available"),
  testedDependencies: { transformers: "unresolved", trl: "unresolved", peft: "unresolved", accelerate: "unresolved" },
  loraTargetDiscovery: "discover linear modules; require save/reload parity",
  quantization: ["bf16", "8bit", "4bit"],
  minimumHardware: "unresolved; preflight required",
  task: "sft",
  limitations: ["Live tokenizer and hardware audit not run"],
});
export const recipeRegistry: readonly ModelRecipeV1[] = [
  recipe("qwen3.6-27b", "Qwen/Qwen3.6-27B", "qwen3.6-dense", "qwen3-dense"),
  recipe("qwen3.6-35b-a3b", "Qwen/Qwen3.6-35B-A3B", "qwen3.6-moe", "qwen3-moe"),
  recipe("nemotron-cascade-2-30b-a3b", "nvidia/Nemotron-Cascade-2-30B-A3B", "nemotron-cascade-2", "nemotron-cascade"),
  recipe("nemotron-3-nano-30b-a3b", "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16", "nemotron-nano-3", "nemotron-nano"),
  recipe("olmo-3.1-32b-instruct", "allenai/Olmo-3.1-32B-Instruct", "olmo-3.1-instruct", "olmo-instruct"),
  recipe("olmo-3.1-32b-think", "allenai/Olmo-3.1-32B-Think", "olmo-3.1-think", "olmo-think"),
  recipe("qwen3.5-9b-pilot", "Qwen/Qwen3.5-9B", "qwen3.5-pilot", "qwen3-dense", false),
];
export function inspectTemplate(id: string) {
  const value = templateRegistry.find((x) => x.id === id);
  if (!value) throw new Error(`Unknown template: ${id}`);
  return value;
}
export function inspectRecipe(id: string) {
  const value = recipeRegistry.find((x) => x.id === id);
  if (!value) throw new Error(`Unknown recipe: ${id}`);
  return value;
}
export function preflightRecipe(id: string): ModelRecipeV1 {
  const value = inspectRecipe(id);
  const unresolvedFields = [value.modelRevision, value.tokenizerRevision, value.licenseSnapshot].filter(
    (x) => x.status === "unresolved",
  );
  if (unresolvedFields.length)
    throw new Error(`Recipe ${id} is not executable: unresolved model/tokenizer/license pins`);
  return value;
}
