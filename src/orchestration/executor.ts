import { join } from "node:path";
import { canonicalSha256 } from "../core/canonical.js";
import type { JsonObject, JsonValue } from "../core/model.js";
import { ContentAddressedBlobStore, ScopedLock, atomicWrite } from "../node/storage.js";
import { redactSecrets } from "../node/redaction.js";
import { eventProtocolVersion, type StageDefinition, type StructuredEventV1 } from "./contracts.js";
import { createStageCacheKey } from "./identity.js";

export class LocalDagExecutor {
  readonly blobs: ContentAddressedBlobStore;
  constructor(readonly root: string) {
    this.blobs = new ContentAddressedBlobStore(join(root, "blobs"));
  }
  plan(stages: StageDefinition[]): StageDefinition[] {
    const byId = new Map(stages.map((stage) => [stage.id, stage]));
    const ordered: StageDefinition[] = [],
      visiting = new Set<string>(),
      visited = new Set<string>();
    const visit = (stage: StageDefinition) => {
      if (visiting.has(stage.id)) throw new Error(`DAG cycle at ${stage.id}`);
      if (visited.has(stage.id)) return;
      visiting.add(stage.id);
      for (const dependency of stage.dependencies ?? []) {
        const target = byId.get(dependency);
        if (!target) throw new Error(`Missing dependency ${dependency}`);
        visit(target);
      }
      visiting.delete(stage.id);
      visited.add(stage.id);
      ordered.push(stage);
    };
    stages.forEach(visit);
    return ordered;
  }
  async run(runId: string, stages: StageDefinition[]): Promise<Map<string, string>> {
    const lock = new ScopedLock(join(this.root, "locks", `${runId}.lock`));
    await lock.acquire();
    try {
      const outputs = new Map<string, string>();
      for (const stage of this.plan(stages)) {
        const inputs = [
          ...(stage.inputManifestHashes ?? []),
          ...(stage.dependencies ?? []).map((id) => outputs.get(id)!).filter(Boolean),
        ];
        const key = createStageCacheKey(inputs, stage.config ?? {}, stage.implementationVersion);
        const cachePath = join(this.root, "cache", key);
        try {
          const cached = await import("node:fs/promises").then(({ readFile }) => readFile(cachePath, "utf8"));
          outputs.set(stage.id, cached.trim());
          await this.emit(runId, stage.id, "cache_hit", { cacheKey: key });
          continue;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        const result = await stage.execute({
          runId,
          stageId: stage.id,
          emit: (type, data) => this.emit(runId, stage.id, type, data),
        });
        const outputHash = await this.blobs.put(result);
        await atomicWrite(cachePath, `${outputHash}\n`);
        outputs.set(stage.id, outputHash);
        await this.emit(runId, stage.id, "stage_succeeded", { outputHash });
      }
      return outputs;
    } finally {
      await lock.release();
    }
  }
  private async emit(runId: string, stageId: string, type: string, data?: JsonObject): Promise<void> {
    const event: StructuredEventV1 = {
      eventProtocolVersion,
      timestamp: new Date().toISOString(),
      runId,
      stageId,
      type,
      ...(data ? { data: redactSecrets(data) as JsonObject } : {}),
    };
    await atomicWrite(
      join(this.root, "events", `${canonicalSha256(event as unknown as JsonValue)}.json`),
      `${JSON.stringify(event)}\n`,
    );
  }
}
