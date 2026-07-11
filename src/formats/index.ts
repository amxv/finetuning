/** Stable dataset-format namespace. Codecs are introduced in Phase 2. */
export type { OpenAIChatFineTuningMessage, OpenAIChatFineTuningRow } from "../core/openai.js";
export { serializeOpenAIJsonlRows, validateOpenAIJsonl } from "../core/dataset.js";
export type { CodecId, ConversionLoss, ConversionResult, DatasetCodec } from "./contracts.js";
export {
  canonicalMessagesCodec,
  codecRegistry,
  detectCodec,
  hfConversationalCodec,
  hfTextCodec,
  openAIChatCodec,
} from "./codecs.js";
export { JsonlParseError, parseJsonl, serializeJsonl, type JsonlRecord } from "./streaming.js";
