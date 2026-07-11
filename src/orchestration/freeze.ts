import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalSerialize, canonicalSha256, type DatasetExampleV1 } from "../core/canonical.js";
import { atomicWrite } from "../node/storage.js";
import { datasetManifestVersion, type DatasetManifestV1 } from "./contracts.js";

export async function freezeDataset(
  directory: string,
  records: DatasetExampleV1[],
  createdAt = "1970-01-01T00:00:00.000Z",
): Promise<DatasetManifestV1> {
  await mkdir(directory, { recursive: true });
  const jsonl = records.map(canonicalSerialize).join("\n") + (records.length ? "\n" : "");
  const recordsHash = canonicalSha256(jsonl);
  const manifest: DatasetManifestV1 = {
    datasetManifestVersion,
    id: `dataset-${recordsHash.slice(0, 16)}`,
    recordsHash,
    recordCount: records.length,
    blobHashes: [],
    createdAt,
    lineageRoots: [...new Set(records.flatMap((record) => [record.id, ...(record.parentIds ?? [])]))].sort(),
  };
  await atomicWrite(join(directory, "records.jsonl"), jsonl);
  await atomicWrite(
    join(directory, "manifest.json"),
    `${canonicalSerialize(manifest as unknown as DatasetExampleV1)}\n`,
  );
  return manifest;
}
export async function verifyFrozenDataset(directory: string): Promise<DatasetManifestV1> {
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as DatasetManifestV1;
  const records = await readFile(join(directory, "records.jsonl"), "utf8");
  if (canonicalSha256(records) !== manifest.recordsHash) throw new Error("Frozen dataset records hash mismatch");
  return manifest;
}
export interface LineageDeletionStore {
  deleteDataset(id: string, options: { includeDescendants: boolean }): Promise<{ deletedIds: string[] }>;
}
