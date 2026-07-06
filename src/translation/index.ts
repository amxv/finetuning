import {
  assertValidOpenAIFineTuningRow,
  serializeOpenAIJsonlRows,
  validateOpenAIJsonl,
  type JsonObject,
  type OpenAIChatFineTuningMessage,
  type OpenAIChatFineTuningRow,
} from "../core/index.js";
import type { ModelProviderKind } from "../providers/index.js";

export type TranslationWorkflowStatus = "experimental";
export type TranslationRequestPath = "local-pseudo" | "provider-adapter";
export type TranslationProviderKind = ModelProviderKind | "local-pseudo";

export interface TranslationRules {
  systemContent: "translate";
  userContent: "translate";
  assistantContent: "translate";
  assistantToolCalls: "preserve";
  toolResultContent: "preserve";
  toolDefinitions: "preserve";
  metadata: "preserve-with-target-locale";
}

export interface TranslationTextRequest {
  text: string;
  sourceLocale?: string;
  targetLocale: string;
  path: string;
}

export interface TranslationTextAdapter {
  provider: TranslationProviderKind;
  requestPath: TranslationRequestPath;
  translateText(request: TranslationTextRequest): Promise<string>;
}

export interface TranslateOpenAIRowOptions {
  targetLocale: string;
  sourceLocale?: string;
  adapter?: TranslationTextAdapter;
}

export interface TranslateOpenAIJsonlOptions extends TranslateOpenAIRowOptions {}

export interface TranslationResult {
  row: OpenAIChatFineTuningRow;
  rules: TranslationRules;
  provider: TranslationProviderKind;
  requestPath: TranslationRequestPath;
}

export const experimentalTranslationRules: TranslationRules = {
  systemContent: "translate",
  userContent: "translate",
  assistantContent: "translate",
  assistantToolCalls: "preserve",
  toolResultContent: "preserve",
  toolDefinitions: "preserve",
  metadata: "preserve-with-target-locale",
};

export function assertValidLocaleCode(locale: string, fieldName = "targetLocale"): void {
  if (typeof locale !== "string" || locale.length === 0) {
    throw new Error(`${fieldName} must be a non-empty BCP 47 locale code such as es-ES or fr.`);
  }

  try {
    Intl.getCanonicalLocales(locale);
  } catch {
    throw new Error(`${fieldName} must be a valid BCP 47 locale code such as es-ES or fr.`);
  }
}

export function createPseudoTranslationAdapter(): TranslationTextAdapter {
  return {
    provider: "local-pseudo",
    requestPath: "local-pseudo",
    async translateText(request): Promise<string> {
      return `[${request.targetLocale}] ${request.text}`;
    },
  };
}

export async function translateOpenAIFineTuningRow(
  row: OpenAIChatFineTuningRow,
  options: TranslateOpenAIRowOptions,
): Promise<TranslationResult> {
  assertValidLocaleCode(options.targetLocale, "targetLocale");
  if (options.sourceLocale) {
    assertValidLocaleCode(options.sourceLocale, "sourceLocale");
  }

  assertValidOpenAIFineTuningRow(row);

  const adapter = options.adapter ?? createPseudoTranslationAdapter();
  const translatedMessages: OpenAIChatFineTuningMessage[] = [];

  for (const [index, message] of row.messages.entries()) {
    translatedMessages.push(await translateMessage(message, index, options, adapter));
  }

  const sourceLocale = options.sourceLocale ?? readMetadataLocale(row.metadata);
  const metadata: JsonObject = {
    ...(row.metadata ?? {}),
    targetLocale: options.targetLocale,
    translationStatus: "experimental",
    translationProvider: adapter.provider,
    translationRequestPath: adapter.requestPath,
  };

  if (sourceLocale) {
    metadata.sourceLocale = sourceLocale;
  }

  const translatedRow: OpenAIChatFineTuningRow = {
    messages: translatedMessages,
    ...(row.tools ? { tools: row.tools } : {}),
    metadata,
  };

  assertValidOpenAIFineTuningRow(translatedRow);

  return {
    row: translatedRow,
    rules: experimentalTranslationRules,
    provider: adapter.provider,
    requestPath: adapter.requestPath,
  };
}

export async function translateOpenAIJsonl(
  contents: string,
  options: TranslateOpenAIJsonlOptions,
): Promise<{
  jsonl: string;
  rows: OpenAIChatFineTuningRow[];
  rules: TranslationRules;
  provider: TranslationProviderKind;
  requestPath: TranslationRequestPath;
}> {
  const validation = validateOpenAIJsonl(contents);
  if (!validation.valid) {
    const details = validation.errors.map((error) => `line ${error.line} ${error.path}: ${error.message}`).join("; ");
    throw new Error(`Cannot translate invalid OpenAI JSONL: ${details}`);
  }

  const rows = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OpenAIChatFineTuningRow);

  const adapter = options.adapter ?? createPseudoTranslationAdapter();
  const translatedRows: OpenAIChatFineTuningRow[] = [];

  for (const row of rows) {
    const result = await translateOpenAIFineTuningRow(row, { ...options, adapter });
    translatedRows.push(result.row);
  }

  return {
    jsonl: serializeOpenAIJsonlRows(translatedRows),
    rows: translatedRows,
    rules: experimentalTranslationRules,
    provider: adapter.provider,
    requestPath: adapter.requestPath,
  };
}

async function translateMessage(
  message: OpenAIChatFineTuningMessage,
  index: number,
  options: TranslateOpenAIRowOptions,
  adapter: TranslationTextAdapter,
): Promise<OpenAIChatFineTuningMessage> {
  if (message.role === "system" || message.role === "user") {
    return {
      role: message.role,
      content: await adapter.translateText(buildTextRequest(message.content, options, `messages[${index}].content`)),
    };
  }

  if (message.role === "assistant") {
    return {
      role: "assistant",
      content:
        message.content === null
          ? null
          : await adapter.translateText(buildTextRequest(message.content, options, `messages[${index}].content`)),
      ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
    };
  }

  return message;
}

function buildTextRequest(
  text: string,
  options: TranslateOpenAIRowOptions,
  path: string,
): TranslationTextRequest {
  const request: TranslationTextRequest = {
    text,
    targetLocale: options.targetLocale,
    path,
  };

  if (options.sourceLocale) {
    request.sourceLocale = options.sourceLocale;
  }

  return request;
}

function readMetadataLocale(metadata: JsonObject | undefined): string | undefined {
  return typeof metadata?.locale === "string" ? metadata.locale : undefined;
}
