import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveNpmInvocation } from "../scripts/lib/npm-command.mjs";
import { toNativePath } from "../scripts/lib/portable-paths.mjs";

test("file URLs convert to native POSIX and Windows paths", () => {
  assert.equal(toNativePath(new URL("file:///tmp/space%20path/file.js"), "linux"), "/tmp/space path/file.js");
  assert.equal(toNativePath(new URL("file:///C:/work/space%20path/file.js"), "win32"), "C:\\work\\space path\\file.js");
});

test("npm invocation prefers npm_execpath and has platform fallbacks", () => {
  assert.deepEqual(
    resolveNpmInvocation(["pack", "--json"], {
      platform: "win32",
      execPath: "C:\\node\\node.exe",
      npmExecPath: "C:\\node\\node_modules\\npm\\bin\\npm-cli.js",
    }),
    {
      command: "C:\\node\\node.exe",
      args: ["C:\\node\\node_modules\\npm\\bin\\npm-cli.js", "pack", "--json"],
    },
  );
  assert.deepEqual(resolveNpmInvocation(["install"], { platform: "win32", npmExecPath: undefined }), {
    command: "npm.cmd",
    args: ["install"],
  });
  assert.deepEqual(resolveNpmInvocation(["install"], { platform: "linux", npmExecPath: undefined }), {
    command: "npm",
    args: ["install"],
  });
});
