const requiredTechnicalStatements = [
  "Real-log conversion is explicitly deferred",
  "does not",
  "redaction hooks",
  "privacy-safe",
];

export function assertDeferredLogTechnicalDocumentation(contents) {
  for (const expected of requiredTechnicalStatements) {
    if (!contents.includes(expected)) {
      throw new Error(`docs/architecture.md is missing deferred log-conversion documentation: ${expected}`);
    }
  }
}
