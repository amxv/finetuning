import { fileURLToPath } from "node:url";
import { sep } from "node:path";

export function toNativePath(url, platform = process.platform) {
  return fileURLToPath(url, { windows: platform === "win32" });
}

export function toPortablePath(path, separator = sep) {
  return path.split(separator).join("/");
}
