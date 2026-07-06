#!/usr/bin/env node
import { cliCommands } from "./index.js";

const commandName = process.argv[2];

if (!commandName || commandName === "--help" || commandName === "-h") {
  console.log("Usage: finetuning <command> [options]");
  console.log("");
  console.log("Commands:");

  for (const command of cliCommands) {
    console.log(`  ${command.name.padEnd(18)} ${command.status.padEnd(12)} ${command.description}`);
  }

  process.exit(0);
}

const command = cliCommands.find((candidate) => candidate.name === commandName);

if (!command) {
  console.error(`Unknown command: ${commandName}`);
  process.exit(1);
}

console.error(
  `${command.name} is part of the public ${command.status} surface, but implementation is scheduled for a later extraction phase.`,
);
process.exit(command.status === "deferred" ? 2 : 1);
