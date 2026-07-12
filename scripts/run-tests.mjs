import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { toNativePath } from "./lib/portable-paths.mjs";

const testDirectory = toNativePath(new URL("../test/", import.meta.url));
const testFiles = (await readdir(testDirectory))
  .filter((file) => file.endsWith(".test.mjs"))
  .sort()
  .map((file) => join(testDirectory, file));

if (testFiles.length === 0) throw new Error("No test files found.");

const result = spawnSync(process.execPath, ["--test", ...testFiles], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
