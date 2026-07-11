import type { JsonValue } from "../core/model.js";
const sensitive = /(^|[-_])(api[-_]?key|authorization|token|secret|cookie|set[-_]?cookie)($|[-_])/i;
export function redactSecrets(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sensitive.test(key) ? "[REDACTED]" : redactSecrets(entry)]),
    );
  return typeof value === "string" && /^(bearer|sk-)[\w.-]+$/i.test(value) ? "[REDACTED]" : value;
}
