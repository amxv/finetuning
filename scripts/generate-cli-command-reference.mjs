import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { embedCommandReference } from "../dist/cli/embed-command-reference.js";

const target = resolve("src/content/docs/cli-command-reference.md");
const cell = (value) => value.replaceAll("|", "\\|");
const body = `---
title: Complete embedding CLI command reference
description: Exact syntax and effects for every registered embedding command.
order: 8
category: Reference
---

This page is generated from the same machine-readable authority used by CLI help. Do not edit it manually.

| Command | Exact syntax | Required inputs | Configuration | I/O | Mutation/overwrite | Network/cost | Error families | Contract/version |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${embedCommandReference.map((x) => `| \`${x.command}\` | \`${cell(x.syntax)}\` | ${cell(x.required)} | ${cell(x.configuration)} | ${cell(x.io)} | ${cell(x.mutation)} | ${cell(x.networkCost)} | ${cell(x.errors)} | ${cell(x.version)} |`).join("\n")}
`;
if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8")) !== body) throw new Error("Generated CLI command reference is stale");
} else await writeFile(target, body);
