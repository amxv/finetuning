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

const groups = {
  data: ["create", "import", "convert", "validate", "inspect", "split", "dedupe", "freeze", "export"],
  generate: ["queries", "documents", "pairs"],
  mine: ["negatives"],
  distill: ["vectors", "scores", "rankings", "plan", "run", "resume", "status"],
  models: ["list", "info", "license", "compat"],
  recipes: ["list", "show", "lock"],
  train: ["init", "validate", "estimate", "run", "resume", "status", "evaluate", "export", "inspect"],
  evaluate: ["run", "compare", "inspect"],
} as const;

function record(noun: string, verb: string): EmbedCommandReference {
  const command = `embed ${noun} ${verb}`;
  const data = noun === "data";
  const discovery = noun === "models" || noun === "recipes";
  const distill = noun === "distill";
  const syntax = data
    ? `finetuning ${command} [input|-] [--out <path|->] [--json] [--dry-run] [--force]`
    : discovery
      ? `finetuning ${command} [--id <id>] [--json] [--quiet]`
      : noun === "generate" || noun === "mine"
        ? `finetuning ${command} [--limit <n>] [--json] [--dry-run]`
        : distill
          ? `finetuning ${command} --config <path> [--input <path>] [--state <path>] [--json] [--dry-run]`
          : `finetuning ${command} --config <path> [--checkpoint <path>] [--artifact <path>] [--report <path>] [--json] [--quiet] [--dry-run]`;
  return {
    command,
    syntax,
    required: data
      ? "input or stdin when the operation consumes rows"
      : discovery
        ? "none; --id narrows results"
        : "versioned --config; operation-specific checkpoint/artifact/report where shown",
    configuration: data
      ? "mapping, provenance, split/dedupe flags"
      : discovery
        ? "registry lock"
        : "CLI > environment reference > config > default",
    io: data ? "input/stdin; --out/stdout only when declared" : "one JSON result on stdout; progress on stderr",
    mutation: ["create", "import", "convert", "split", "dedupe", "freeze", "export", "run", "resume", "lock"].includes(
      verb,
    )
      ? "writes explicit output/state; overwrite requires --force or resume"
      : "read-only unless selected execution is explicitly run",
    networkCost:
      distill && ["run", "resume", "vectors", "scores", "rankings"].includes(verb)
        ? "provider/network and separate budgets required unless offline fixture"
        : "offline; production download/GPU/remote capability remains gated",
    errors: "usage/config/schema, unavailable capability, policy/budget, checkpoint/artifact, provider/internal",
    version: "versioned records/config/spec/events/artifacts reject incompatible majors",
  };
}

export const embedCommandReference: readonly EmbedCommandReference[] = Object.entries(groups).flatMap(([noun, verbs]) =>
  verbs.map((verb) => record(noun, verb)),
);

export function embedCommandHelp(noun: string, verb: string): string {
  const item = embedCommandReference.find((entry) => entry.command === `embed ${noun} ${verb}`);
  if (!item) throw new Error(`Unknown command: embed ${noun} ${verb}`);
  return `Usage: ${item.syntax}`;
}
