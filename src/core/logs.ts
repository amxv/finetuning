import type { WorkflowStatus } from "./model.js";

export interface DeferredLogConversionBoundary {
  workflowId: "log-to-dataset-import";
  status: Extract<WorkflowStatus, "deferred">;
  includedInV1: false;
  reason: string;
  publicContractStatus: "not-defined";
  privacyStatus: "redaction-required-before-release";
  requiredBeforeRelease: readonly string[];
  cliCommand: "convert-logs";
}

export const deferredLogConversionBoundary: DeferredLogConversionBoundary = {
  workflowId: "log-to-dataset-import",
  status: "deferred",
  includedInV1: false,
  reason:
    "Real-log conversion is excluded from v1 until the package has a public log source contract, redaction hooks, privacy guidance, and redacted fixture coverage.",
  publicContractStatus: "not-defined",
  privacyStatus: "redaction-required-before-release",
  requiredBeforeRelease: [
    "accepted public log record shape",
    "assistant content extraction rules",
    "assistant tool-call extraction rules",
    "tool result extraction rules",
    "caller-supplied redaction hooks for messages, tool arguments, tool results, and metadata",
    "privacy-safe redacted fixture set with validation coverage",
    "provider/runtime-independent converter implementation",
  ],
  cliCommand: "convert-logs",
} as const;

export function createDeferredLogConversionError(): Error {
  return new Error(`${deferredLogConversionBoundary.cliCommand} is deferred: ${deferredLogConversionBoundary.reason}`);
}
