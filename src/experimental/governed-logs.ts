import { canonicalSha256, datasetSchemaVersion, withContentHash, type DatasetExampleV1 } from "../core/canonical.js";
import type { JsonObject } from "../core/model.js";
import { scanSensitive } from "../distillation/index.js";
export interface GovernanceV1 {
  version: "1.0.0";
  consent: { basis: string; recordedAt: string };
  rightsBasis: string;
  retention: { days: number; deleteDescendants: boolean };
  encryption: { atRest: true; keyReference: string };
  residency: { region: string; allowedRegions: string[] };
  sourceRevision: string;
  reasoningPolicy: "exclude" | "redact";
  redact: (text: string) => string;
}
export interface ProductionLogV1 {
  id: string;
  source: string;
  revision: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  metadata?: JsonObject;
  createdAt: string;
}
export function ingestGovernedLogs(logs: ProductionLogV1[], governance?: GovernanceV1) {
  validateGovernance(governance);
  const audit: Array<JsonObject> = [];
  const records = logs.map((log) => {
    if (log.revision !== governance!.sourceRevision) throw new Error("LOG_SOURCE_REVISION_MISMATCH");
    const messages = log.messages.map((message) => {
      const redacted = governance!.redact(message.content);
      if (scanSensitive(redacted).length) throw new Error("LOG_REDACTION_INCOMPLETE");
      return { role: message.role, content: [{ type: "text" as const, text: redacted }] };
    });
    const record = withContentHash({
      datasetSchemaVersion,
      id: canonicalSha256(`${log.source}:${log.id}:${log.revision}`),
      messages,
      provenance: {
        source: log.source,
        sourceId: log.id,
        metadata: {
          consentBasis: governance!.consent.basis,
          rightsBasis: governance!.rightsBasis,
          sourceRevision: log.revision,
          residency: governance!.residency.region,
          retentionDays: governance!.retention.days,
        },
      },
      parentIds: [`source:${log.source}:${log.id}`],
      transformations: [{ id: "governed-redaction", kind: "redaction", createdAt: log.createdAt }],
      createdAt: log.createdAt,
    } as DatasetExampleV1);
    audit.push({ type: "log_ingested", sourceId: log.id, recordId: record.id, at: log.createdAt });
    return record;
  });
  return { records, audit };
}
export function validateGovernance(value?: GovernanceV1): asserts value is GovernanceV1 {
  const missing: string[] = [];
  if (value?.version !== "1.0.0") missing.push("version");
  if (!value?.consent?.basis || !value.consent.recordedAt) missing.push("consent");
  if (!value?.rightsBasis) missing.push("rights basis");
  if (!value?.retention?.days) missing.push("retention");
  if (value?.encryption?.atRest !== true || !value.encryption.keyReference) missing.push("encryption");
  if (!value?.residency?.region || !value.residency.allowedRegions.includes(value.residency.region))
    missing.push("residency");
  if (!value?.sourceRevision) missing.push("source revision");
  if (!value?.reasoningPolicy) missing.push("reasoning policy");
  if (typeof value?.redact !== "function") missing.push("redaction hook");
  if (missing.length) throw new Error(`GOVERNED_LOGS_DISABLED: missing ${missing.join(", ")}`);
}
export interface LineageAsset {
  id: string;
  kind: "source" | "canonical" | "blob" | "manifest" | "index" | "distillation" | "training" | "evaluation";
  parentIds: string[];
  deleteRequired: boolean;
  hash?: string;
}
export async function planLineageDeletion(sourceId: string, assets: LineageAsset[], confirm = false) {
  if (!confirm) throw new Error("DELETION_CONFIRMATION_REQUIRED: planning is non-destructive by default");
  const deleted = new Set([sourceId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const asset of assets)
      if (asset.deleteRequired && !deleted.has(asset.id) && asset.parentIds.some((id) => deleted.has(id))) {
        deleted.add(asset.id);
        changed = true;
      }
  }
  const selected = assets.filter((a) => deleted.has(a.id)).sort((a, b) => a.id.localeCompare(b.id));
  return {
    version: "1.0.0",
    sourceId,
    tombstoneId: canonicalSha256({ sourceId, deleted: selected.map((a) => a.id) } as never),
    deleted: selected.map((a) => ({ id: a.id, kind: a.kind, priorHash: a.hash ?? null })),
    retained: assets
      .filter((a) => !deleted.has(a.id))
      .map((a) => a.id)
      .sort(),
  };
}
