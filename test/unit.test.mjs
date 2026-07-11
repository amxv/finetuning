import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const scripts = [
  "verify-fixtures.mjs",
  "verify-cli.mjs",
  "verify-translation.mjs",
  "verify-provider-config.mjs",
  "verify-provider-adapters.mjs",
  "verify-persona-generation.mjs",
  "verify-simulation-runners.mjs",
  "verify-log-deferment.mjs",
];

for (const script of scripts) {
  test(script, async () => {
    const { stdout } = await execFileAsync(process.execPath, [`scripts/${script}`], { cwd: root });
    if (!stdout.includes("Verified")) throw new Error(`${script} did not report verification success.`);
  });
}
