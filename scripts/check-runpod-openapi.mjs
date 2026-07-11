import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const pinned = JSON.parse(
  await readFile(new URL("../contracts/runpod/openapi-2026-07-12.json", import.meta.url), "utf8"),
);
const response = await fetch("https://rest.runpod.io/v1/openapi.json");
if (!response.ok) throw new Error(`OpenAPI retrieval failed: ${response.status}`);
const text = await response.text();
const current = JSON.parse(text);
const digest = createHash("sha256").update(text).digest("hex");
const paths = (o) =>
  Object.fromEntries(
    Object.entries(o.paths ?? {}).map(([p, v]) => [
      p,
      Object.keys(v)
        .filter((k) => ["get", "post", "put", "patch", "delete"].includes(k))
        .sort(),
    ]),
  );
const report = {
  retrievedAt: new Date().toISOString(),
  source: response.url,
  sha256: digest,
  pinnedSha256: "1da83b045d6e4c9980d118a853dc16b788b8862280b3361b847f05ca2738cd84",
  changed: digest !== "1da83b045d6e4c9980d118a853dc16b788b8862280b3361b847f05ca2738cd84",
  pinnedPaths: paths(pinned),
  currentPaths: paths(current),
};
await mkdir(new URL("../tmp/gg/", import.meta.url), { recursive: true });
await writeFile(new URL("../tmp/gg/runpod-openapi-diff.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
