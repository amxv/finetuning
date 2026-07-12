import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { createInterface } from "node:readline";
import {
  assertEmbeddingContractMajor,
  embeddingTrainingEventVersion,
  type EmbeddingTrainingEventV1,
} from "../embeddings/training.js";
import { terminateChild } from "./terminate-child.js";
export interface EmbeddingTrainerBridgeOptions {
  pythonExecutable: string;
  module?: string;
  specPath: string;
  cwd: string;
  signal?: AbortSignal;
  onEvent?: (event: EmbeddingTrainingEventV1) => void;
}
export async function runPythonEmbeddingTrainer(options: EmbeddingTrainerBridgeOptions) {
  if (!isAbsolute(options.specPath) || !isAbsolute(options.cwd))
    throw new Error("Embedding trainer paths must be absolute");
  if (options.signal?.aborted) throw new DOMException("Embedding training cancelled before start", "AbortError");
  const child = spawn(
      options.pythonExecutable,
      ["-m", options.module ?? "amxv_finetuning_trainer.embedding_training", options.specPath],
      {
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      },
    ),
    events: EmbeddingTrainingEventV1[] = [];
  const closed = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  let stderr = "",
    expected = 0;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (x) => (stderr += String(x)));
  let termination: Promise<void> | undefined;
  const terminate = () => (termination ??= terminateChild(child, closed));
  const abort = () => void terminate();
  options.signal?.addEventListener("abort", abort, { once: true });
  const reader = createInterface({ input: child.stdout });
  try {
    for await (const line of reader) {
      let event: EmbeddingTrainingEventV1;
      try {
        event = JSON.parse(line) as EmbeddingTrainingEventV1;
      } catch {
        throw new Error(`Malformed embedding training event JSON: ${line}`);
      }
      assertEmbeddingContractMajor(
        event.embeddingTrainingEventVersion,
        embeddingTrainingEventVersion,
        "EmbeddingTrainingEventV1",
      );
      if (event.sequence !== expected++) throw new Error(`Out-of-order embedding event ${event.sequence}`);
      events.push(event);
      options.onEvent?.(event);
    }
    const exitCode = await closed;
    if (termination) await termination;
    if (options.signal?.aborted && events.length > 0 && events.at(-1)?.data?.reason !== "cancelled") {
      events.push({
        embeddingTrainingEventVersion,
        sequence: expected,
        timestamp: new Date().toISOString(),
        runId: events[0]!.runId,
        type: "failed",
        data: { reason: "cancelled" },
      });
    }
    return { exitCode: options.signal?.aborted ? 130 : exitCode, events, stderr };
  } catch (error) {
    reader.close();
    await terminate();
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abort);
  }
}
