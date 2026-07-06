import type { JsonObject } from "./model.js";
import type { OpenAIChatFineTuningRow } from "./openai.js";
import { validateOpenAIFineTuningRow, type ValidationIssue } from "./validation.js";

export interface DatasetSummary {
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  messageCount: number;
  toolCallCount: number;
  toolResultCount: number;
  rowsWithTools: number;
  averageMessagesPerRow: number;
  languageCounts: Record<string, number>;
}

export interface DatasetValidationIssue extends ValidationIssue {
  line: number;
}

export interface DatasetValidationResult {
  valid: boolean;
  errors: DatasetValidationIssue[];
  summary: DatasetSummary;
}

export function serializeOpenAIJsonlRows(rows: OpenAIChatFineTuningRow[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : "");
}

export function validateOpenAIJsonl(contents: string): DatasetValidationResult {
  const errors: DatasetValidationIssue[] = [];
  const summary = createEmptySummary();
  const lines = contents.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch (error) {
      summary.rowCount += 1;
      summary.invalidRowCount += 1;
      errors.push({
        line: lineNumber,
        path: "$",
        message: `line must be valid JSON: ${error instanceof Error ? error.message : "parse failed"}`,
      });
      continue;
    }

    const row = parsed as OpenAIChatFineTuningRow;
    const result = safelyValidateRow(row);
    summary.rowCount += 1;

    if (result.valid) {
      summary.validRowCount += 1;
    } else {
      summary.invalidRowCount += 1;
      errors.push(
        ...result.errors.map((issue) => ({
          line: lineNumber,
          path: issue.path,
          message: issue.message,
        })),
      );
    }

    summary.messageCount += result.summary.messageCount;
    summary.toolCallCount += result.summary.toolCallCount;
    summary.toolResultCount += result.summary.toolResultCount;

    if (result.summary.toolCallCount > 0) {
      summary.rowsWithTools += 1;
    }

    const locale = readRowLocale(parsed);
    if (locale) {
      summary.languageCounts[locale] = (summary.languageCounts[locale] ?? 0) + 1;
    }
  }

  summary.averageMessagesPerRow = summary.rowCount === 0 ? 0 : summary.messageCount / summary.rowCount;

  return {
    valid: errors.length === 0,
    errors,
    summary,
  };
}

export function summarizeOpenAIJsonlRows(rows: OpenAIChatFineTuningRow[]): DatasetSummary {
  return validateOpenAIJsonl(serializeOpenAIJsonlRows(rows)).summary;
}

function safelyValidateRow(row: OpenAIChatFineTuningRow) {
  try {
    return validateOpenAIFineTuningRow(row);
  } catch (error) {
    return {
      valid: false,
      errors: [
        {
          path: "$",
          message: error instanceof Error ? error.message : "row validation failed",
        },
      ],
      summary: {
        messageCount: Array.isArray(row.messages) ? row.messages.length : 0,
        toolCallCount: 0,
        toolResultCount: 0,
      },
    };
  }
}

function createEmptySummary(): DatasetSummary {
  return {
    rowCount: 0,
    validRowCount: 0,
    invalidRowCount: 0,
    messageCount: 0,
    toolCallCount: 0,
    toolResultCount: 0,
    rowsWithTools: 0,
    averageMessagesPerRow: 0,
    languageCounts: {},
  };
}

function readRowLocale(row: unknown): string | undefined {
  if (!isRecord(row) || !isRecord(row.metadata)) {
    return undefined;
  }

  const metadata = row.metadata as JsonObject;
  return typeof metadata.locale === "string" ? metadata.locale : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
