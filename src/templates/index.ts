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
export const templateRegistry: readonly ChatTemplateDescriptorV1[] = [
  descriptor("qwen3.6-dense", "qwen3-dense", "Qwen/Qwen3.6-27B", "strip"),
  descriptor("qwen3.6-moe", "qwen3-moe", "Qwen/Qwen3.6-35B-A3B", "strip"),
  descriptor("nemotron-cascade-2", "nemotron-cascade", "nvidia/Nemotron-Cascade-2-30B-A3B", "preserve"),
  descriptor("nemotron-nano-3", "nemotron-nano", "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16", "preserve"),
  descriptor("olmo-3.1-instruct", "olmo-instruct", "allenai/Olmo-3.1-32B-Instruct", "none"),
  descriptor("olmo-3.1-think", "olmo-think", "allenai/Olmo-3.1-32B-Think", "preserve"),
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
