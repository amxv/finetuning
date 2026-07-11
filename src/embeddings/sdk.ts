import { canonicalSha256 } from "../core/canonical.js";
import type { EmbeddingRecordV1 } from "../experimental/embeddings-phase11.js";
import { splitEmbeddingRecords, validateEmbeddingRecords, type EmbeddingValidationReport } from "./data.js";

export type EmbeddingErrorCode =
  | "EMBED_CONFIG_INVALID"
  | "EMBED_RECORD_INVALID"
  | "EMBED_PATH_INVALID"
  | "EMBED_UNAVAILABLE"
  | "EMBED_OVERWRITE_REFUSED"
  | "EMBED_CHECKPOINT_INCOMPLETE";
export class EmbeddingSdkError extends Error {
  readonly kind = "embedding-sdk-error";
  constructor(
    readonly code: EmbeddingErrorCode,
    message: string,
    readonly details: { recordId?: string; path?: string; remediation: string } = {
      remediation: "Review the command help and correct the input.",
    },
  ) {
    super(message);
    this.name = "EmbeddingSdkError";
  }
  toJSON() {
    return { kind: this.kind, code: this.code, message: this.message, ...this.details };
  }
}
export interface EmbeddingServiceDependencies {
  now?: () => string;
  emit?: (event: EmbeddingSdkEvent) => void | Promise<void>;
}
export interface EmbeddingSdkEvent {
  type: "progress" | "warning";
  operation: string;
  message: string;
  completed?: number;
}
export class EmbeddingDatasetBuilder {
  #records: EmbeddingRecordV1[] = [];
  add(record: EmbeddingRecordV1) {
    this.#records.push(structuredClone(record));
    return this;
  }
  addAll(records: Iterable<EmbeddingRecordV1>) {
    for (const record of records) this.add(record);
    return this;
  }
  async addStream(records: AsyncIterable<EmbeddingRecordV1>) {
    for await (const record of records) this.add(record);
    return this;
  }
  records() {
    return this.#records.map((record) => structuredClone(record));
  }
  async validate() {
    return validateEmbeddingRecords(stream(this.#records));
  }
}
export class EmbeddingRecordValidator {
  constructor(private readonly dependencies: EmbeddingServiceDependencies = {}) {}
  async validate(records: AsyncIterable<EmbeddingRecordV1>): Promise<EmbeddingValidationReport> {
    const report = await validateEmbeddingRecords(records);
    await this.dependencies.emit?.({
      type: "progress",
      operation: "validate",
      message: `Validated ${report.recordCount} records`,
      completed: report.recordCount,
    });
    return report;
  }
}
export class EmbeddingSplitPlanner {
  plan(
    records: readonly EmbeddingRecordV1[],
    options: { salt: string; ratios?: { train: number; validation: number; test: number } },
  ) {
    const output = splitEmbeddingRecords([...records], options.salt, options.ratios);
    return {
      records: output,
      planHash: canonicalSha256(output as never),
      counts: Object.fromEntries(
        ["train", "validation", "test"].map((split) => [split, output.filter((x) => x.split === split).length]),
      ),
    };
  }
}
export class TypedRegistry<T extends { id: string }> {
  #values = new Map<string, T>();
  constructor(values: Iterable<T> = []) {
    for (const value of values) this.register(value);
  }
  register(value: T) {
    if (this.#values.has(value.id))
      throw new EmbeddingSdkError("EMBED_CONFIG_INVALID", `Duplicate registry ID: ${value.id}`, {
        path: "$.id",
        remediation: "Choose a unique stable registry ID.",
      });
    this.#values.set(value.id, value);
    return this;
  }
  get(id: string) {
    const value = this.#values.get(id);
    if (!value)
      throw new EmbeddingSdkError("EMBED_UNAVAILABLE", `Registry entry is unavailable: ${id}`, {
        path: "$.id",
        remediation: "List the registry and select an available entry.",
      });
    return value;
  }
  list() {
    return [...this.#values.values()];
  }
}
async function* stream<T>(values: Iterable<T>) {
  yield* values;
}
