export function resolveNpmInvocation(args, options = {}) {
  const platform = options.platform ?? process.platform;
  const execPath = options.execPath ?? process.execPath;
  const npmExecPath = Object.hasOwn(options, "npmExecPath") ? options.npmExecPath : process.env.npm_execpath;
  if (npmExecPath) {
    return { command: execPath, args: [npmExecPath, ...args] };
  }

  return { command: platform === "win32" ? "npm.cmd" : "npm", args };
}

export function runNpm(execFile, args, options) {
  const invocation = resolveNpmInvocation(args);
  return execFile(invocation.command, invocation.args, options);
}
