import { readFile } from "node:fs/promises";
import { parseExecutionJob } from "../execution/index.js";
import { planRunPodJob } from "../execution/runpod/index.js";
import { RunPodTransport } from "../execution/runpod/index.js";
import {
  RestRunPodLifecycleBackend,
  RunPodLifecycleController,
  verifyAndFetchArtifacts,
  ensureIndependentVolume,
} from "../execution/runpod/lifecycle.js";
import { atomicWrite } from "../node/storage.js";
import { parseArgs, readBooleanFlag, readOptionalStringFlag, readRequiredStringFlag } from "./argv.js";
const reads = new Set(["status", "orphans", "cost"]),
  mutations = new Set(["launch", "cancel", "stop", "terminate", "cleanup", "resume", "fetch"]);
export async function runRunPodCommand(raw: string[]): Promise<void> {
  const [verb, ...rest] = raw;
  if (!verb || verb === "--help" || verb === "-h") return help();
  const args = parseArgs(rest);
  if (verb === "serverless" || verb === "fleet") {
    const subcommand = args.positionals[0];
    const allowed =
      verb === "serverless"
        ? ["evaluate", "infer", "status", "cancel", "cleanup"]
        : ["plan", "status", "orphans", "cancel", "cleanup"];
    if (!subcommand || !allowed.includes(subcommand))
      throw new Error(`Usage: finetuning runpod ${verb} ${allowed.join("|")}`);
    if (readOptionalStringFlag(args, "operation") === "training" || readBooleanFlag(args, "checkpointed-training"))
      throw new Error("SERVERLESS_TRAINING_REJECTED: use one Pod per run for checkpointed or long-running training");
    return print(
      {
        version: "1.0.0",
        operation: `${verb} ${subcommand}`,
        status: "unavailable",
        liveEvidence: false,
        dryRun: readBooleanFlag(args, "dry-run"),
        evidenceDate: "2026-07-12",
        reason:
          verb === "serverless"
            ? "Dedicated endpoint, bounded worker, scale/cancel/cost and cleanup evidence not run."
            : "Fleet remains a fake isolation/dispatcher contract; one Pod per run is the reference.",
      },
      args,
    );
  }
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
    if (!readBooleanFlag(args, "dry-run")) {
      if (
        !readBooleanFlag(args, "allow-live") ||
        !readBooleanFlag(args, "i-accept-billing") ||
        !readBooleanFlag(args, "i-own-resources")
      )
        throw new Error("RUNPOD_LIVE_OPT_IN_REQUIRED");
      const auth = readRequiredStringFlag(args, "authorization-env");
      if (process.env[auth] !== "AUTHORIZED") throw new Error(`RUNPOD_LIVE_AUTHORIZATION_MISSING: ${auth}`);
      const ownership = readRequiredStringFlag(args, "ownership-marker"),
        backend = new RestRunPodLifecycleBackend(
          new RunPodTransport({
            apiKeyEnv: readRequiredStringFlag(args, "api-key-env"),
            baseUrl: "https://rest.runpod.io/v1",
            timeoutMs: 15000,
            maxResponseBytes: 1048576,
          }),
          true,
        );
      if (sub === "list")
        return print(
          {
            operation: "volume list",
            volumes: (await backend.listVolumes()).filter((v) => v.ownershipMarker === ownership),
          },
          args,
        );
      if (sub === "ensure")
        return print(
          await ensureIndependentVolume(backend, {
            name: readRequiredStringFlag(args, "name"),
            sizeGiB: Number(readRequiredStringFlag(args, "size-gib")),
            dataCenterId: readRequiredStringFlag(args, "data-center-id"),
            ownershipMarker: ownership,
          }),
          args,
        );
      if (!readBooleanFlag(args, "yes")) throw new Error("volume delete requires --yes");
      const id = readRequiredStringFlag(args, "id"),
        volume = (await backend.listVolumes()).find((v) => v.id === id);
      if (!volume || volume.ownershipMarker !== ownership) throw new Error("foreign volume deletion refused");
      await backend.deleteVolume(id);
      return print({ operation: "volume delete", id, deleted: true }, args);
    }
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
          serverless: {
            status: "unavailable",
            operationsRevalidated: ["run", "runsync", "status", "cancel", "purge-queue"],
            training: false,
            liveEvidence: false,
          },
          fleet: { status: "unavailable", reference: "one-pod-per-run", multiNode: false },
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
    if (!readBooleanFlag(args, "dry-run")) {
      if (
        !readBooleanFlag(args, "allow-live") ||
        !readBooleanFlag(args, "i-accept-billing") ||
        !readBooleanFlag(args, "i-own-resources")
      )
        throw new Error("RUNPOD_LIVE_OPT_IN_REQUIRED: require --allow-live --i-accept-billing --i-own-resources");
      const authorizationEnv = readRequiredStringFlag(args, "authorization-env");
      if (process.env[authorizationEnv] !== "AUTHORIZED")
        throw new Error(`RUNPOD_LIVE_AUTHORIZATION_MISSING: ${authorizationEnv}`);
      const state = readRequiredStringFlag(args, "state"),
        ownership = readRequiredStringFlag(args, "ownership-marker");
      const backend = new RestRunPodLifecycleBackend(
          new RunPodTransport({
            apiKeyEnv: readRequiredStringFlag(args, "api-key-env"),
            baseUrl: "https://rest.runpod.io/v1",
            timeoutMs: Number(readOptionalStringFlag(args, "timeout-ms") ?? 15000),
            maxResponseBytes: 1048576,
          }),
          true,
        ),
        controller = new RunPodLifecycleController(backend, state, ownership);
      if (verb === "launch") {
        const job = parseExecutionJob(JSON.parse(await readFile(readRequiredStringFlag(args, "job"), "utf8"))),
          plan = JSON.parse(await readFile(readRequiredStringFlag(args, "plan"), "utf8"));
        return print(await controller.launch(job, plan, false), args);
      }
      if (verb === "stop" || verb === "cancel") return print(await controller.stop(false), args);
      if (verb === "terminate") return print(await controller.terminate(readBooleanFlag(args, "yes"), false), args);
      if (verb === "resume") return print(await controller.status(), args);
      if (verb === "cleanup") {
        const root = readOptionalStringFlag(args, "volume-root");
        return print(
          await controller.cleanup({
            deleteRunPrefix: readBooleanFlag(args, "delete-run-prefix"),
            deleteVolume: readBooleanFlag(args, "delete-volume"),
            yes: readBooleanFlag(args, "yes"),
            dryRun: false,
            ...(root ? { root } : {}),
          }),
          args,
        );
      }
      if (verb === "fetch") {
        const artifacts = JSON.parse(await readFile(readRequiredStringFlag(args, "artifacts"), "utf8"));
        return print(
          await verifyAndFetchArtifacts(
            readRequiredStringFlag(args, "source"),
            readRequiredStringFlag(args, "destination"),
            artifacts,
            readRequiredStringFlag(args, "run-id"),
          ),
          args,
        );
      }
      throw new Error(`RUNPOD_LIVE_OPERATION_REQUIRES_SAVED_CONTROLLER_INPUT: ${verb}`);
    }
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
