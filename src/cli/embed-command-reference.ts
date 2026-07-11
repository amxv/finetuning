export interface EmbedCommandReference {
  command: string;
  syntax: string;
  required: string;
  configuration: string;
  io: string;
  mutation: string;
  networkCost: string;
  errors: string;
  version: string;
}
type PartialReference = Omit<EmbedCommandReference, "command" | "syntax" | "errors" | "version">;
const base = {
  errors: "usage/config/schema, unavailable capability, checkpoint/artifact, internal",
  version: "versioned records/config/spec/events/artifacts reject incompatible majors",
};
const offline = "offline deterministic implementation; no provider calls, downloads, GPU, or remote mutation";
const readOnly = "read-only";
const json = "JSON result on stdout; diagnostics on stderr";
const ref = (command: string, tail: string, x: PartialReference): EmbedCommandReference => ({
  command,
  syntax: `finetuning ${command}${tail ? ` ${tail}` : ""}`,
  ...x,
  ...base,
});
const dataRead = (required: string): PartialReference => ({
  required,
  configuration: "optional task/column mapping and provenance flags",
  io: "input path or stdin; result on stdout",
  mutation: readOnly,
  networkCost: offline,
});
const dataWrite = (required: string, io = "input path or stdin; output path or stdout"): PartialReference => ({
  required,
  configuration: "optional task/column mapping and provenance flags",
  io,
  mutation: "writes only explicit output; existing output requires --force",
  networkCost: offline,
});
const registry: PartialReference = {
  required: "none; optional --id narrows the registry result",
  configuration: "committed model/recipe registries",
  io: json,
  mutation: readOnly,
  networkCost: offline,
};
const configured = (required: string, mutation = readOnly): PartialReference => ({
  required,
  configuration: "required versioned --config; CLI overrides environment references then config",
  io: json,
  mutation,
  networkCost: offline,
});

export const embedCommandReference: readonly EmbedCommandReference[] = [
  ref(
    "embed data create",
    "[--out <path|->] [--json] [--dry-run] [--force]",
    dataWrite("no input; --out only when writing a file", "empty dataset to --out; summary on stdout"),
  ),
  ref(
    "embed data import",
    "[input|-] [--out <path|->] [--task <task>] [--columns <map>] [--json] [--dry-run] [--force]",
    dataWrite("input or stdin; mapping required when source is not canonical"),
  ),
  ref(
    "embed data convert",
    "[input|-] [--out <path|->] [--task <task>] [--columns <map>] [--json] [--dry-run] [--force]",
    dataWrite("input or stdin; mapping required when source is not canonical"),
  ),
  ref("embed data validate", "[input|-] [--task <task>] [--columns <map>] [--json]", dataRead("input or stdin")),
  ref("embed data inspect", "[input|-] [--task <task>] [--columns <map>] [--json]", dataRead("input or stdin")),
  ref(
    "embed data split",
    "[input|-] --salt <value> [--out <path|->] [--json] [--dry-run] [--force]",
    dataWrite("input or stdin and --salt"),
  ),
  ref(
    "embed data dedupe",
    "[input|-] [--threshold <0..1>] [--out <path|->] [--json] [--dry-run] [--force]",
    dataWrite("input or stdin"),
  ),
  ref(
    "embed data freeze",
    "[input|-] --out <directory> [--json] [--dry-run] [--force]",
    dataWrite("input or stdin and --out directory", "frozen manifest/records directory"),
  ),
  ref("embed data export", "[input|-] [--out <path|->] [--json] [--dry-run] [--force]", dataWrite("input or stdin")),
  ...["queries", "documents", "pairs"].map((v) =>
    ref(`embed generate ${v}`, "[--limit <n>] [--json] [--dry-run]", {
      required: "none",
      configuration: "optional --limit controls the deterministic estimate",
      io: json,
      mutation: readOnly,
      networkCost: offline,
    }),
  ),
  ref("embed mine negatives", "[--json] [--dry-run]", {
    required: "none",
    configuration: "no config or limit is consumed",
    io: json,
    mutation: readOnly,
    networkCost: offline,
  }),
  ...["vectors", "scores", "rankings", "run"].map((v) =>
    ref(`embed distill ${v}`, "--config <path> --input <path> [--state <path>] [--json] [--dry-run]", {
      required: "--config; --input unless --dry-run",
      configuration: "versioned distillation config",
      io: json,
      mutation: "non-dry run writes state; refuses an existing state",
      networkCost: "current deterministic fake services only; reports network false",
    }),
  ),
  ref("embed distill plan", "--config <path> [--state <path>] [--json] [--dry-run]", {
    required: "--config",
    configuration: "versioned distillation config",
    io: json,
    mutation: readOnly,
    networkCost: "current deterministic planning only; reports network false",
  }),
  ref("embed distill resume", "--config <path> --input <path> [--state <path>] [--json] [--dry-run]", {
    required: "--config; --input unless --dry-run; existing state for non-dry resume",
    configuration: "versioned distillation config",
    io: json,
    mutation: "continues and rewrites the selected state",
    networkCost: "current deterministic fake services only; reports network false",
  }),
  ref("embed distill status", "[--state <path>] [--json]", {
    required: "existing state path or default embedding-distillation-state.json",
    configuration: "no config is read",
    io: json,
    mutation: readOnly,
    networkCost: offline,
  }),
  ...["list", "info", "license", "compat"].map((v) =>
    ref(`embed models ${v}`, "[--id <id>] [--json] [--quiet]", registry),
  ),
  ...["list", "show", "lock"].map((v) =>
    ref(`embed recipes ${v}`, "[--id <id>] [--json] [--quiet]", { ...registry, mutation: readOnly }),
  ),
  ...["init", "validate", "estimate", "evaluate"].map((v) =>
    ref(`embed train ${v}`, "--config <path> [--json] [--quiet] [--dry-run]", configured("--config")),
  ),
  ref(
    "embed train run",
    "--config <path> [--json] [--quiet] [--dry-run]",
    configured("--config", "non-dry run writes resolved spec, checkpoints, and artifacts in configured output"),
  ),
  ref(
    "embed train resume",
    "--config <path> [--checkpoint <path>] [--json] [--quiet] [--dry-run]",
    configured("--config and a checkpoint from CLI or config", "non-dry resume writes within configured output"),
  ),
  ref(
    "embed train status",
    "--config <path> [--checkpoint <path>] [--json] [--quiet] [--dry-run]",
    configured("--config; optional checkpoint classifies resume state"),
  ),
  ref(
    "embed train export",
    "--config <path> [--json] [--quiet] [--dry-run]",
    configured("--config", "non-dry export writes configured artifact output"),
  ),
  ref(
    "embed train inspect",
    "--config <path> [--artifact <path>] [--json] [--quiet] [--dry-run]",
    configured("--config and an artifact from CLI or config", "verifies artifact; runner path is read-only"),
  ),
  ref(
    "embed evaluate run",
    "--config <path> [--json] [--quiet] [--dry-run]",
    configured("--config", "non-dry run writes the configured evaluation report"),
  ),
  ref(
    "embed evaluate compare",
    "--config <path> --left <report> --right <report> [--json] [--quiet]",
    configured("--config, --left, and --right"),
  ),
  ref(
    "embed evaluate inspect",
    "--config <path> --report <path> [--json] [--quiet]",
    configured("--config and --report"),
  ),
];
export function embedCommandHelp(noun: string, verb: string): string {
  const item = embedCommandReference.find((x) => x.command === `embed ${noun} ${verb}`);
  if (!item) throw new Error(`Unknown command: embed ${noun} ${verb}`);
  return `Usage: ${item.syntax}`;
}
