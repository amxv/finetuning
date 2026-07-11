import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = new URL("../python/", import.meta.url);
const directory = await mkdtemp(join(tmpdir(), "finetuning-python-audit-"));
try {
  await exec("uv", ["build", ".", "--out-dir", directory], { cwd: root });
  const artifacts = (await readdir(directory)).sort();
  assert(artifacts.some((name) => name.endsWith(".whl")), "wheel was not built");
  assert(artifacts.some((name) => name.endsWith(".tar.gz")), "sdist was not built");
  const wheel = join(directory, artifacts.find((name) => name.endsWith(".whl")));
  const { stdout } = await exec("python3", ["-m", "zipfile", "-l", wheel]);
  assert.match(stdout, /amxv_finetuning_trainer\/cli\.py/);
  assert.doesNotMatch(stdout, /(__pycache__|\.pyc|torch|cuda|transformers)/i);
  const sdist = join(directory, artifacts.find((name) => name.endsWith(".tar.gz")));
  const { stdout: sourceFiles } = await exec("tar", ["-tzf", sdist]);
  assert.doesNotMatch(sourceFiles, /(__pycache__|\.pyc|\.env|\.pem|\.key|safetensors|\/build\/)/i);
  const venv = join(directory, "venv");
  await exec("uv", ["venv", venv]);
  const python = process.platform === "win32" ? join(venv, "Scripts", "python.exe") : join(venv, "bin", "python");
  await exec("uv", ["pip", "install", "--python", python, "--no-deps", wheel]);
  await exec(python, ["-c", "import amxv_finetuning_trainer; from amxv_finetuning_trainer.cli import main"]);
  const { stdout: help } = await exec(python, ["-m", "amxv_finetuning_trainer.cli", "--help"]);
  assert.match(help, /prepare.*run.*resume.*status.*evaluate.*export.*verify/s);
  const pyproject = await readFile(new URL("pyproject.toml", root), "utf8");
  assert.match(pyproject, /dependencies = \[\]/, "base wheel must remain dependency-free");
} finally {
  await rm(directory, { recursive: true, force: true });
  await rm(new URL("amxv_finetuning_trainer.egg-info/", root), { recursive: true, force: true });
  await rm(new URL("build/", root), { recursive: true, force: true });
}
