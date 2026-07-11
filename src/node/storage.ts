import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { canonicalSha256 } from "../core/canonical.js";
import type { JsonValue } from "../core/model.js";

export async function atomicWrite(
  path: string,
  contents: string,
  fault?: (boundary: "after-temp-write" | "before-rename" | "after-rename") => void,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, contents, { flag: "wx" });
    fault?.("after-temp-write");
    fault?.("before-rename");
    await rename(temporary, path);
    fault?.("after-rename");
  } finally {
    await rm(temporary, { force: true });
  }
}
export class ContentAddressedBlobStore {
  constructor(readonly root: string) {}
  async put(value: JsonValue | string): Promise<string> {
    const contents = typeof value === "string" ? value : JSON.stringify(value);
    const hash = canonicalSha256(contents);
    const path = join(this.root, hash.slice(0, 2), hash);
    try {
      await atomicWrite(path, contents);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    return hash;
  }
  async get(hash: string): Promise<string> {
    const contents = await readFile(join(this.root, hash.slice(0, 2), hash), "utf8");
    if (canonicalSha256(contents) !== hash) throw new Error(`Blob hash mismatch: ${hash}`);
    return contents;
  }
  async delete(hash: string): Promise<void> {
    await rm(join(this.root, hash.slice(0, 2), hash), { force: true });
  }
}
export class ScopedLock {
  #handle: Awaited<ReturnType<typeof open>> | undefined;
  constructor(readonly path: string) {}
  async acquire(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    this.#handle = await open(this.path, "wx");
  }
  async release(): Promise<void> {
    await this.#handle?.close();
    this.#handle = undefined;
    await rm(this.path, { force: true });
  }
}
