import { readFile } from "node:fs/promises";
import type { ParsedArgs } from "./argv.js";
export const embedCliConfigVersion = "1.0.0" as const;
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export interface EmbedProjectConfig {
  configVersion: typeof embedCliConfigVersion;
  env?: Record<string, string>;
  defaults?: Record<string, Json>;
  commands?: Record<string, Record<string, Json>>;
}
const top = new Set(["configVersion", "env", "defaults", "commands"]);
export async function resolveEmbedConfig(
  command: string,
  args: ParsedArgs,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<{ resolved: Record<string, Json>; environmentReferences: Record<string, string> }> {
  const path = typeof args.flags.config === "string" ? args.flags.config : undefined;
  let config: EmbedProjectConfig = { configVersion: embedCliConfigVersion };
  if (path) config = parseEmbedProjectConfig(JSON.parse(await readFile(path, "utf8")));
  const resolved: Record<string, Json> = { ...(config.defaults ?? {}), ...(config.commands?.[command] ?? {}) },
    refs: Record<string, string> = {};
  for (const [key, name] of Object.entries(config.env ?? {})) {
    refs[key] = name;
    const value = environment[name];
    if (value === undefined)
      throw new Error(`EMBED_CONFIG_ENV_MISSING: environment reference ${name} is not set (at $.env.${key})`);
    resolved[key] = value;
  }
  for (const [key, value] of Object.entries(args.flags))
    if (!["config", "json", "quiet", "dry-run", "help"].includes(key)) resolved[key] = value;
  return { resolved, environmentReferences: refs };
}
export function parseEmbedProjectConfig(value: unknown): EmbedProjectConfig {
  if (!record(value)) throw new Error("EMBED_CONFIG_INVALID: config must be an object");
  for (const key of Object.keys(value))
    if (!top.has(key)) throw new Error(`EMBED_CONFIG_UNKNOWN_KEY: unknown key $.${key}`);
  if (value.configVersion !== embedCliConfigVersion)
    throw new Error(`EMBED_CONFIG_VERSION: configVersion must be ${embedCliConfigVersion}`);
  for (const key of ["env", "defaults", "commands"] as const)
    if (value[key] !== undefined && !record(value[key]))
      throw new Error(`EMBED_CONFIG_INVALID: $.${key} must be an object`);
  if (record(value.env))
    for (const [key, name] of Object.entries(value.env))
      if (typeof name !== "string" || !/^[A-Z_][A-Z0-9_]*$/.test(name))
        throw new Error(`EMBED_CONFIG_INVALID: $.env.${key} must name an environment variable`);
  return value as unknown as EmbedProjectConfig;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
