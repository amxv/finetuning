import type { DatasetExampleV1 } from "../core/canonical.js";

export type CodecId = "canonical-messages-jsonl" | "openai-chat-jsonl" | "hf-conversational" | "hf-text";
export interface ConversionLoss {
  code: string;
  path: string;
  message: string;
  severity: "warning" | "error";
}
export interface ConversionResult<T> {
  value?: T;
  losses: ConversionLoss[];
  supported: boolean;
}
export interface DatasetCodec<T> {
  id: CodecId;
  detect(value: unknown): number;
  decode(value: T): ConversionResult<DatasetExampleV1>;
  encode(example: DatasetExampleV1): ConversionResult<T>;
}
