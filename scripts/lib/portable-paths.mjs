import { fileURLToPath } from "node:url";

export function toNativePath(url, platform = process.platform) {
  return fileURLToPath(url, { windows: platform === "win32" });
}
