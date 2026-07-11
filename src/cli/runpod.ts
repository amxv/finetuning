import { readFile } from "node:fs/promises";
import { parseExecutionJob } from "../execution/index.js";
import { planRunPodJob } from "../execution/runpod/index.js";
import { atomicWrite } from "../node/storage.js";
import { parseArgs, readBooleanFlag, readOptionalStringFlag, readRequiredStringFlag } from "./argv.js";
const reads = new Set(["status", "orphans", "cost"]),
  mutations = new Set(["launch", "cancel", "stop", "terminate", "cleanup", "resume", "fetch"]);
export async function runRunPodCommand(raw: string[]): Promise<void> {
  const [verb, ...rest] = raw;
  if (!verb || verb === "--help" || verb === "-h") return help();
  const args = parseArgs(rest);
  if (verb === "init") {
    const out = readRequiredStringFlag(args, "out");
    await atomicWrite(
      out,
      JSON.stringify(
        {
          version: "1.0.0",
          apiKeyEnv: "RUNPOD_API_KEY",
          mutationCapability: "unavailable-pending-live-qualification",
          ownershipPrefix: readOptionalStringFlag(args, "ownership-prefix") ?? "amxv",
        },
        null,
        2,
      ) + "\n",
    );
    return print({ initialized: out }, args);
  }
  if (verb === "volume") {
    const sub = args.positionals[0];
    if (!["list", "ensure", "delete"].includes(sub ?? ""))
      throw new Error("Usage: finetuning runpod volume list|ensure|delete");
    if (sub !== "list" && !readBooleanFlag(args, "dry-run"))
      throw new Error(
        "RUNPOD_MUTATION_UNAVAILABLE: use --dry-run; Phase 21 production mutation awaits live qualification",
      );
    return print(
      {
        operation: `volume ${sub}`,
        dryRun: sub !== "list",
        mutationCapability: "unavailable",
        warnings: ["Volume deletion requires separately confirmed exact data scope and --yes once qualified."],
      },
      args,
    );
  }
  if (verb === "plan") {
    if (!readBooleanFlag(args, "dry-run")) throw new Error("runpod plan requires --dry-run");
    const job = parseExecutionJob(JSON.parse(await readFile(readRequiredStringFlag(args, "job"), "utf8"))),
      evidence = JSON.parse(await readFile(readRequiredStringFlag(args, "evidence"), "utf8"));
    const plan = planRunPodJob(job, evidence);
    const out = readOptionalStringFlag(args, "out");
    if (out) await atomicWrite(out, JSON.stringify(plan, null, 2) + "\n");
    return print(plan, args);
  }
  if (verb === "doctor")
    return print(
      {
        version: "1.0.0",
        offlineFoundation: true,
        productionMutation: false,
        liveOptIn: process.env.RUNPOD_LIVE_TEST === "1",
        unavailable: [
          "hard-dollar-cap",
          "generic-exec-log-rest",
          "qualified-spot-semantics",
          "direct-secrets-resource",
        ],
        warnings: ["No live resource is created by doctor."],
        trainingHardening: {
          qlora: "offline-contract-only",
          distributedModes: { singleNode: ["single", "ddp", "fsdp"], productionQualified: [] },
          topology: "real visible-device and NCCL evidence not run",
          checkpoint: "complete compatible state only; world-size reshard unavailable",
          fallbacks: "ranked and confirmation-required; no silent model/precision/quantization/GPU/mode changes",
          spot: "unavailable; simulated eviction does not qualify support",
          productionRecipes: "unavailable",
        },
      },
      args,
    );
  if (verb === "connect")
    return print(
      {
        genericExecLogs: false,
        guidance: [
          "Use verified SSH/Jupyter/IDE port mappings from the Pod response.",
          "Read durable events under /workspace/runs/<run-id>/events.",
        ],
      },
      args,
    );
  if (verb === "cost")
    return print(
      {
        version: "1.0.0",
        operation: "cost",
        estimated: "requires saved plan evidence",
        observed: "requires elapsed watchdog state",
        billed: "requires read-only billing history and may lag",
        retainedResources: "reported separately",
        hardCap: false,
      },
      args,
    );
  if (reads.has(verb))
    return print({ operation: verb, readOnly: true, requiresState: true, productionMutation: false }, args);
  if (mutations.has(verb)) {
    if (!readBooleanFlag(args, "dry-run"))
      throw new Error("RUNPOD_MUTATION_UNAVAILABLE: use --dry-run; pinned live mutation evidence is not qualified");
    const destructive = ["terminate", "cleanup"].includes(verb);
    return print(
      {
        operation: verb,
        dryRun: true,
        destructive,
        requiresYes: destructive,
        exactScope: destructive
          ? [
              "owned Pod only by default",
              "network volume retained",
              "run prefix and volume deletion require separate confirmation",
            ]
          : [],
        warnings: ["maxUsd is not a provider hard cap.", "Storage billing may continue after stopped compute."],
        ...(verb === "resume"
          ? {
              recovery: "select newest complete hash-valid compatible checkpoint",
              lossWindow: "bounded and reported",
              worldSizeChange: "refused; reshard is unavailable",
              warmStart: "weights-only is not full resume",
            }
          : {}),
      },
      args,
    );
  }
  throw new Error(`Unknown command: runpod ${verb}`);
}
function print(value: unknown, args: ReturnType<typeof parseArgs>) {
  console.log(readBooleanFlag(args, "json") ? JSON.stringify(value) : JSON.stringify(value, null, 2));
}
function help() {
  console.log(
    "Usage: finetuning runpod init|doctor|plan|launch|status|connect|cancel|stop|terminate|cleanup|resume|fetch|orphans|cost|volume list|ensure|delete [--json] [--dry-run]",
  );
}
