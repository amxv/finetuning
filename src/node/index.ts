/** Node-specific operational adapters. */
export type { DatasetWriter, FileSystemAdapter, PersistenceAdapter } from "../simulation/index.js";
export { redactSecrets } from "./redaction.js";
export { atomicWrite, ContentAddressedBlobStore, ScopedLock } from "./storage.js";
export { runPythonTrainer, type TrainerBridgeOptions, type TrainerRunResult } from "./trainer.js";
export { runPythonEmbeddingTrainer, type EmbeddingTrainerBridgeOptions } from "./embedding-trainer.js";
