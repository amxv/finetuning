import type { JsonValue } from "../core/model.js";
const sensitive = /(^|[-_])(api[-_]?key|authorization|token|secret|cookie|set[-_]?cookie)($|[-_])/i;
export function redactSecrets(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sensitive.test(key) ? "[REDACTED]" : redactSecrets(entry)]),
    );
  if (typeof value !== "string") return value;
  if (/^(bearer\s+|sk-|rp_)[\w.-]+$/i.test(value)) return "[REDACTED]";
  try {
    const url = new URL(value);
    if (["token", "signature", "sig", "x-amz-signature", "credential"].some((k) => url.searchParams.has(k)))
      return "[REDACTED_SIGNED_URL]";
  } catch {
    /* not a URL */
  }
  return value;
}
