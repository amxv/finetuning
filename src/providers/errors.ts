import type { JsonObject } from "../core/index.js";

export interface ProviderErrorOptions {
  provider?: string;
  model?: string;
  cause?: unknown;
  details?: JsonObject;
}

export class ProviderError extends Error {
  readonly provider?: string;
  readonly model?: string;
  readonly details?: JsonObject;

  constructor(message: string, options: ProviderErrorOptions = {}) {
    super(message);
    this.name = new.target.name;

    if (options.provider) {
      this.provider = options.provider;
    }

    if (options.model) {
      this.model = options.model;
    }

    if (options.details) {
      this.details = options.details;
    }

    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

export class ProviderConfigurationError extends ProviderError {}

export class ProviderAuthenticationError extends ProviderError {}

export class ProviderRateLimitError extends ProviderError {}

export class ProviderResponseError extends ProviderError {}

export class ProviderToolCallError extends ProviderError {}

export class ProviderUnsupportedFeatureError extends ProviderError {}
