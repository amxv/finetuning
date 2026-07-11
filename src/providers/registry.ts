import type { ModelProviderKind } from "./index.js";
import type { ProviderCapabilities } from "./contracts.js";
export const providerCapabilities: Record<"openai" | "anthropic", ProviderCapabilities> = {
  openai: { tools: true, structuredOutput: "native", abort: true, idempotency: true, usage: true },
  anthropic: { tools: true, structuredOutput: "repair", abort: true, idempotency: false, usage: true },
};
export function listProviders() {
  return Object.entries(providerCapabilities).map(([provider, capabilities]) => ({
    provider: provider as ModelProviderKind,
    capabilities,
  }));
}
export function inspectProvider(provider: ModelProviderKind): ProviderCapabilities {
  if (provider === "custom") throw new Error("Custom provider capabilities must be supplied explicitly.");
  return providerCapabilities[provider];
}
