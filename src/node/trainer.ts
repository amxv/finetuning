import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { createInterface } from "node:readline";
import { parseTrainingEvent, type TrainingEventV1 } from "../training/index.js";
export interface TrainerBridgeOptions {
  pythonExecutable: string;
  module: string;
  specPath: string;
  cwd: string;
  signal?: AbortSignal;
  onEvent?: (event: TrainingEventV1) => void;
}
export interface TrainerRunResult {
  exitCode: number;
  events: TrainingEventV1[];
  stderr: string;
}
export async function runPythonTrainer(options: TrainerBridgeOptions): Promise<TrainerRunResult> {
  for (const [name, value] of Object.entries({
    pythonExecutable: options.pythonExecutable,
    module: options.module,
    specPath: options.specPath,
    cwd: options.cwd,
  }))
    if (!value || value.includes("\0")) throw new Error(`Unsafe ${name}`);
  if (!isAbsolute(options.specPath) || !isAbsolute(options.cwd))
    throw new Error("Trainer specPath and cwd must be absolute paths");
  const child = spawn(options.pythonExecutable, ["-m", options.module, options.specPath], {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  const events: TrainingEventV1[] = [];
  let stderr = "",
    expected = 0;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => (stderr += String(chunk)));
  const abort = () => child.kill("SIGTERM");
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    for await (const line of createInterface({ input: child.stdout })) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        child.kill("SIGTERM");
        throw new Error(`Malformed training event JSON: ${line}`);
      }
      const event = parseTrainingEvent(parsed);
      if (event.sequence !== expected++) {
        child.kill("SIGTERM");
        throw new Error(`Out-of-order training event sequence ${event.sequence}`);
      }
      events.push(event);
      options.onEvent?.(event);
    }
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });
    return { exitCode, events, stderr };
  } finally {
    options.signal?.removeEventListener("abort", abort);
  }
}
