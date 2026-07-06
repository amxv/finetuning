import process from "node:process";
import type { JsonObject } from "../core/index.js";
import type { ModelProviderKind, ProviderClientOptions } from "./index.js";
import { ProviderConfigurationError } from "./errors.js";

export type ProviderEnvironment = Record<string, string | undefined>;

export interface ProviderRuntimeConfig {
  provider: ModelProviderKind;
  model: string;
  apiKeyEnv: string;
  baseUrl?: string;
  temperature?: number;
  maxOutputTokens?: number;
  headers?: Record<string, string>;
  metadata?: JsonObject;
}

export function defaultApiKeyEnvForProvider(provider: ModelProviderKind): string | undefined {
  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "custom":
      return undefined;
  }
}

export function assertSupportedModelProviderKind(value: string): asserts value is ModelProviderKind {
  if (value !== "openai" && value !== "anthropic" && value !== "custom") {
    throw new ProviderConfigurationError(`Unsupported provider: ${value}`);
  }
}

export function resolveProviderClientOptions(
  config: ProviderRuntimeConfig,
  env: ProviderEnvironment = process.env,
): ProviderClientOptions {
  assertSupportedModelProviderKind(config.provider);

  if (!config.model) {
    throw new ProviderConfigurationError(`Missing model for ${config.provider} provider`, {
      provider: config.provider,
    });
  }

  if (!config.apiKeyEnv) {
    throw new ProviderConfigurationError(`Missing apiKeyEnv for ${config.provider} provider`, {
      provider: config.provider,
      model: config.model,
    });
  }

  const apiKey = env[config.apiKeyEnv];
  if (!apiKey) {
    throw new ProviderConfigurationError(`Missing ${config.apiKeyEnv} for ${config.provider} provider`, {
      provider: config.provider,
      model: config.model,
      details: { apiKeyEnv: config.apiKeyEnv },
    });
  }

  return {
    model: config.model,
    apiKey,
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    ...(config.maxOutputTokens !== undefined ? { maxOutputTokens: config.maxOutputTokens } : {}),
    ...(config.headers ? { headers: config.headers } : {}),
    ...(config.metadata ? { metadata: config.metadata } : {}),
  };
}
