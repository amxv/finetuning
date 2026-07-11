import { canonicalSha256 } from "../core/canonical.js";
import type { JsonValue } from "../core/model.js";

export function createStageCacheKey(
  inputManifestHashes: string[],
  config: JsonValue,
  implementationVersion: string,
): string {
  return canonicalSha256({ implementationVersion, inputManifestHashes: [...inputManifestHashes].sort(), config });
}
