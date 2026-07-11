import { serializeOpenAIJsonlRows, validateOpenAIJsonl } from "../core/dataset.js";
import type { DatasetExampleV1 } from "../core/canonical.js";
import type { JsonObject } from "../core/model.js";
import type { OpenAIChatFineTuningMessage, OpenAIChatFineTuningRow } from "../core/openai.js";
import { assertValidOpenAIFineTuningRow } from "../core/validation.js";
import { ProviderResponseError } from "../providers/errors.js";
import type { ModelClient, ModelProviderKind } from "../providers/index.js";

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
  model?: string;
  translateText(request: TranslationTextRequest): Promise<string>;
}

export interface ProviderTranslationAdapterOptions {
  temperature?: number;
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

export async function translateDatasetExample(
  example: DatasetExampleV1,
  options: TranslateOpenAIRowOptions,
): Promise<DatasetExampleV1> {
  assertValidLocaleCode(options.targetLocale);
  const adapter = options.adapter ?? createPseudoTranslationAdapter();
  const messages = await Promise.all(
    example.messages.map(async (message, index) => ({
      ...message,
      content: await Promise.all(
        message.content.map(async (part, partIndex) =>
          part.type === "text" && message.role !== "tool"
            ? {
                ...part,
                text: await adapter.translateText({
                  text: part.text,
                  ...(options.sourceLocale ? { sourceLocale: options.sourceLocale } : {}),
                  targetLocale: options.targetLocale,
                  path: `messages[${index}].content[${partIndex}].text`,
                }),
              }
            : part,
        ),
      ),
    })),
  );
  return {
    ...example,
    messages,
    metadata: {
      ...(example.metadata ?? {}),
      ...(options.sourceLocale ? { sourceLocale: options.sourceLocale } : {}),
      targetLocale: options.targetLocale,
      translationProvider: adapter.provider,
      translationRequestPath: adapter.requestPath,
    },
  };
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

export function createProviderTranslationAdapter(
  modelClient: ModelClient,
  provider: Exclude<ModelProviderKind, "custom">,
  model: string,
  options: ProviderTranslationAdapterOptions = {},
): TranslationTextAdapter {
  if (!model) {
    throw new ProviderResponseError(`Missing translation model for ${provider} translation provider`, {
      provider,
    });
  }

  return {
    provider,
    requestPath: "provider-adapter",
    model,
    async translateText(request): Promise<string> {
      const response = await modelClient.invoke({
        provider,
        model,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        messages: [
          {
            role: "system",
            content:
              "Translate exactly one text field. Return only the translated text. Do not return JSON, markdown, quotes, labels, explanations, or commentary. Preserve placeholders, code-like strings, identifiers, and formatting where possible.",
          },
          {
            role: "user",
            content: buildProviderTranslationPrompt(request),
          },
        ],
        metadata: {
          requestPath: "provider-adapter",
          translationFieldPath: request.path,
          targetLocale: request.targetLocale,
          ...(request.sourceLocale ? { sourceLocale: request.sourceLocale } : {}),
        },
      });

      if (response.kind !== "text") {
        throw new ProviderResponseError(`${provider} translation returned tool calls instead of text`, {
          provider,
          model,
          details: { path: request.path },
        });
      }

      return validateProviderTranslatedText(response.content, request, provider, model);
    },
  };
}

export function createOpenAITranslationAdapter(
  modelClient: ModelClient,
  model: string,
  options?: ProviderTranslationAdapterOptions,
): TranslationTextAdapter {
  return createProviderTranslationAdapter(modelClient, "openai", model, options);
}

export function createAnthropicTranslationAdapter(
  modelClient: ModelClient,
  model: string,
  options?: ProviderTranslationAdapterOptions,
): TranslationTextAdapter {
  return createProviderTranslationAdapter(modelClient, "anthropic", model, options);
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
    ...(adapter.model ? { translationModel: adapter.model } : {}),
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
  assertTranslationPreservedSchemaFields(row, translatedRow);

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
      content: await translateTextField(message.content, options, adapter, `messages[${index}].content`),
    };
  }

  if (message.role === "assistant") {
    return {
      role: "assistant",
      content:
        message.content === null
          ? null
          : await translateTextField(message.content, options, adapter, `messages[${index}].content`),
      ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
    };
  }

  return message;
}

async function translateTextField(
  text: string,
  options: TranslateOpenAIRowOptions,
  adapter: TranslationTextAdapter,
  path: string,
): Promise<string> {
  const translated = await adapter.translateText(buildTextRequest(text, options, path));
  if (text.length > 0 && translated.length === 0) {
    throw new Error(`Translation for ${path} must be non-empty when source content is non-empty.`);
  }

  return translated;
}

function buildTextRequest(text: string, options: TranslateOpenAIRowOptions, path: string): TranslationTextRequest {
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

function buildProviderTranslationPrompt(request: TranslationTextRequest): string {
  const sourceLocale = request.sourceLocale ?? "the source locale";
  return [
    `Source locale: ${sourceLocale}`,
    `Target locale: ${request.targetLocale}`,
    `Field path: ${request.path}`,
    "",
    "Translate this text field and return only translated text:",
    request.text,
  ].join("\n");
}

function validateProviderTranslatedText(
  content: string,
  request: TranslationTextRequest,
  provider: Exclude<ModelProviderKind, "custom">,
  model: string,
): string {
  const translated = content.trim();

  if (request.text.length > 0 && translated.length === 0) {
    throw new ProviderResponseError(`${provider} translation returned empty text for ${request.path}`, {
      provider,
      model,
      details: { path: request.path },
    });
  }

  if (translated.startsWith("```") || translated.endsWith("```")) {
    throw new ProviderResponseError(`${provider} translation returned markdown for ${request.path}`, {
      provider,
      model,
      details: { path: request.path },
    });
  }

  if (isWrappedInQuotes(translated)) {
    throw new ProviderResponseError(`${provider} translation returned quoted text for ${request.path}`, {
      provider,
      model,
      details: { path: request.path },
    });
  }

  if (looksLikeJsonWrapper(translated)) {
    throw new ProviderResponseError(`${provider} translation returned JSON instead of plain text for ${request.path}`, {
      provider,
      model,
      details: { path: request.path },
    });
  }

  return translated;
}

function isWrappedInQuotes(value: string): boolean {
  return (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  );
}

function looksLikeJsonWrapper(value: string): boolean {
  if (!((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]")))) {
    return false;
  }

  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function assertTranslationPreservedSchemaFields(
  original: OpenAIChatFineTuningRow,
  translated: OpenAIChatFineTuningRow,
): void {
  assertJsonEqual(translated.tools, original.tools, "tools");

  for (const [index, originalMessage] of original.messages.entries()) {
    const translatedMessage = translated.messages[index];
    if (!translatedMessage) {
      throw new Error(`Translated row is missing messages[${index}].`);
    }

    if (originalMessage.role === "assistant") {
      const translatedAssistant = translatedMessage.role === "assistant" ? translatedMessage : undefined;
      assertJsonEqual(translatedAssistant?.tool_calls, originalMessage.tool_calls, `messages[${index}].tool_calls`);
    }

    if (originalMessage.role === "tool") {
      assertJsonEqual(translatedMessage, originalMessage, `messages[${index}]`);
    }
  }
}

function assertJsonEqual(actual: unknown, expected: unknown, label: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label} changed during translation.`);
  }
}
