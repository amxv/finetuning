import { readFile } from "node:fs/promises";
import { atomicWrite } from "../node/storage.js";
import { stageStateVersion, type StageAttemptV1, type StageRecordStateV1 } from "./contracts.js";

export class AttemptLedger {
  constructor(readonly path: string) {}
  async read(runId: string, stageId: string, recordId: string): Promise<StageRecordStateV1> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as StageRecordStateV1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return { stageStateVersion, runId, stageId, recordId, attempts: [] };
    }
  }
  async start(runId: string, stageId: string, recordId: string, now: Date, leaseMs: number): Promise<StageAttemptV1> {
    const state = await this.read(runId, stageId, recordId);
    const attempt: StageAttemptV1 = {
      attempt: state.attempts.length + 1,
      status: "running",
      startedAt: now.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
    };
    state.attempts.push(attempt);
    await atomicWrite(this.path, `${JSON.stringify(state)}\n`);
    return attempt;
  }
  async finish(
    runId: string,
    stageId: string,
    recordId: string,
    attemptNumber: number,
    status: "succeeded" | "failed_retryable" | "failed_terminal",
    now: Date,
    outputHash?: string,
  ): Promise<void> {
    const state = await this.read(runId, stageId, recordId);
    const attempt = state.attempts.find((item) => item.attempt === attemptNumber);
    if (!attempt) throw new Error(`Unknown attempt ${attemptNumber}`);
    attempt.status = status;
    attempt.finishedAt = now.toISOString();
    delete attempt.leaseExpiresAt;
    if (outputHash) attempt.outputHash = outputHash;
    await atomicWrite(this.path, `${JSON.stringify(state)}\n`);
  }
  async recoverAbandoned(runId: string, stageId: string, recordId: string, now: Date): Promise<number> {
    const state = await this.read(runId, stageId, recordId);
    let recovered = 0;
    for (const attempt of state.attempts)
      if (attempt.status === "running" && attempt.leaseExpiresAt && attempt.leaseExpiresAt <= now.toISOString()) {
        attempt.status = "failed_retryable";
        attempt.finishedAt = now.toISOString();
        attempt.error = "lease expired";
        delete attempt.leaseExpiresAt;
        recovered += 1;
      }
    if (recovered) await atomicWrite(this.path, `${JSON.stringify(state)}\n`);
    return recovered;
  }
}
