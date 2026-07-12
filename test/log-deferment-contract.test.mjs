import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { assertDeferredLogTechnicalDocumentation } from "../scripts/lib/log-deferment-docs.mjs";

test("README prose is not part of the deferred-log product gate", async () => {
  const verifier = await readFile(new URL("../scripts/verify-log-deferment.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(verifier, /README\.md/);
});

test("canonical technical documentation keeps every deferred-log prerequisite", async () => {
  const architecture = await readFile(new URL("../docs/architecture.md", import.meta.url), "utf8");
  assert.doesNotThrow(() => assertDeferredLogTechnicalDocumentation(architecture));

  for (const required of [
    "Real-log conversion is explicitly deferred",
    "does not",
    "redaction hooks",
    "privacy-safe",
  ]) {
    assert.throws(
      () => assertDeferredLogTechnicalDocumentation(architecture.replaceAll(required, "removed")),
      /missing/,
    );
  }
});
