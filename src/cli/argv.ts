export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(rawArgs: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg) continue;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const flag = arg.slice(2);
    const next = rawArgs[index + 1];
    if (next && !next.startsWith("--")) {
      flags[flag] = next;
      index += 1;
    } else {
      flags[flag] = true;
    }
  }

  return { positionals, flags };
}

export function readOptionalStringFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}

export function readBooleanFlag(args: ParsedArgs, name: string): boolean {
  return args.flags[name] === true;
}

export function readRequiredStringFlag(args: ParsedArgs, name: string): string {
  const value = readOptionalStringFlag(args, name);
  if (!value) throw new Error(`Missing required --${name} <value>.`);
  return value;
}

export function readOptionalIntegerFlag(args: ParsedArgs, name: string): number | undefined {
  const value = readOptionalStringFlag(args, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`--${name} must be a non-negative integer.`);
  return parsed;
}
