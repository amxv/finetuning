import { access, readFile, rm } from "node:fs/promises";
import process from "node:process";
import { atomicWrite } from "../node/storage.js";
import { canonicalSerialize } from "../core/canonical.js";
import {
  dedupeEmbeddingRecords,
  freezeEmbeddingDataset,
  importEmbeddingJsonl,
  scanEmbeddingContamination,
  splitEmbeddingRecords,
  validateEmbeddingRecords,
  type EmbeddingRecordV1,
  type EmbeddingColumnMapping,
} from "../embeddings/index.js";
import { parseArgs, readBooleanFlag, readOptionalStringFlag } from "./argv.js";
import { embedCommandHelp } from "./embed-command-reference.js";

const verbs = new Set(["create", "import", "convert", "validate", "inspect", "split", "dedupe", "freeze", "export"]);
export async function runEmbedCommand(raw: string[]): Promise<void> {
  const [noun, verb, ...rest] = raw;
  if (noun !== "data" || !verb || !verbs.has(verb)) throw new Error("Unknown command: embed " + raw.join(" "));
  const a = parseArgs(rest);
  if (readBooleanFlag(a, "help")) {
    console.log(embedCommandHelp("data", verb));
    return;
  }
  const input = a.positionals[0] ?? readOptionalStringFlag(a, "input") ?? "-",
    output = readOptionalStringFlag(a, "out"),
    dry = readBooleanFlag(a, "dry-run"),
    force = readBooleanFlag(a, "force"),
    json = readBooleanFlag(a, "json");
  const mapping = await mappingFrom(a),
    source = {
      name: readOptionalStringFlag(a, "source") ?? "external",
      revision: readOptionalStringFlag(a, "source-revision") ?? "unknown",
      license: readOptionalStringFlag(a, "license") ?? "unknown",
      rights: readOptionalStringFlag(a, "rights") ?? "unknown",
    };
  if (verb === "create") {
    const result = { operation: verb, dryRun: dry, recordCount: 0 };
    if (!dry && output && output !== "-") await safeWrite(output, "", force);
    return print(result, json);
  }
  const records = await load(input, {
    mapping,
    source,
    splitGroupColumn: readOptionalStringFlag(a, "split-group-column"),
  });
  if (verb === "validate") {
    const report = await validateEmbeddingRecords(iter(records));
    print(report, json);
    if (!report.valid) process.exitCode = 1;
    return;
  }
  if (verb === "inspect")
    return print(
      {
        recordCount: records.length,
        kinds: counts(records.map((x) => x.kind)),
        splits: counts(records.map((x) => x.split)),
        groups: new Set(records.map((x) => x.splitGroup)).size,
      },
      json,
    );
  let result = records;
  if (verb === "split")
    result = splitEmbeddingRecords(
      records,
      readOptionalStringFlag(a, "salt") ??
        (() => {
          throw new Error("Missing required --salt <value>.");
        })(),
    );
  if (verb === "dedupe") {
    const memberships = await dedupeEmbeddingRecords(records, {
      minhashThreshold: Number(readOptionalStringFlag(a, "threshold") ?? 0.85),
    });
    if (dry)
      return print(
        {
          operation: verb,
          dryRun: true,
          recordCount: records.length,
          clusterCount: new Set(memberships.map((x) => x.clusterId)).size,
        },
        json,
      );
    return writeOutput(output, canonicalSerialize(memberships as never) + "\n", force, json, {
      recordCount: records.length,
    });
  }
  if (verb === "freeze") {
    if (!output) throw new Error("Missing required --out <value>.");
    const memberships = await dedupeEmbeddingRecords(records),
      evidence = scanEmbeddingContamination(
        records.filter((x) => x.split === "train"),
        records.filter((x) => x.split !== "train"),
      );
    if (dry)
      return print(
        { operation: verb, dryRun: true, recordCount: records.length, contamination: evidence.comparisons.length },
        json,
      );
    if (force) await rm(output, { recursive: true, force: true });
    else await ensureAbsent(output);
    return print(await freezeEmbeddingDataset(output, records, evidence, memberships), json);
  }
  const contents = result.map((x) => canonicalSerialize(x as never)).join("\n") + (result.length ? "\n" : "");
  if (dry) return print({ operation: verb, dryRun: true, recordCount: result.length, output: output ?? "-" }, json);
  return writeOutput(output, contents, force, json, { recordCount: result.length });
}
async function load(path: string, options: any): Promise<EmbeddingRecordV1[]> {
  const chunks = path === "-" ? process.stdin : one(await readFile(path));
  const out: EmbeddingRecordV1[] = [];
  for await (const x of importEmbeddingJsonl(chunks as AsyncIterable<Uint8Array | string>, options, path))
    out.push(x.record);
  return out;
}
async function mappingFrom(a: ReturnType<typeof parseArgs>): Promise<EmbeddingColumnMapping | undefined> {
  const task = readOptionalStringFlag(a, "task") as EmbeddingColumnMapping["task"] | undefined,
    mapPath = readOptionalStringFlag(a, "column-map");
  if (!task && !mapPath) return;
  if (mapPath) return JSON.parse(await readFile(mapPath, "utf8")) as EmbeddingColumnMapping;
  const columns: Record<string, string> = {};
  for (const item of (readOptionalStringFlag(a, "columns") ?? "").split(",").filter(Boolean)) {
    const [k, v] = item.split("=");
    if (!k || !v) throw new Error("--columns must be role=column pairs");
    columns[k] = v;
  }
  return { task: task!, columns };
}
async function writeOutput(
  path: string | undefined,
  contents: string,
  force: boolean,
  json: boolean,
  summary: Record<string, unknown>,
) {
  if (!path || path === "-") {
    process.stdout.write(contents);
    return;
  }
  await safeWrite(path, contents, force);
  print({ ...summary, output: path }, json);
}
async function safeWrite(path: string, s: string, force: boolean) {
  if (!force) await ensureAbsent(path);
  await atomicWrite(path, s);
}
async function ensureAbsent(path: string) {
  try {
    await access(path);
    throw new Error(`Output already exists: ${path}. Use --force to overwrite.`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
function print(x: unknown, json: boolean) {
  console.log(json ? JSON.stringify(x) : JSON.stringify(x, null, 2));
}
function counts(a: string[]) {
  return Object.fromEntries([...new Set(a)].sort().map((x) => [x, a.filter((y) => y === x).length]));
}
async function* one<T>(x: T) {
  yield x;
}
async function* iter<T>(x: T[]) {
  yield* x;
}
