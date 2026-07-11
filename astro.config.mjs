import { defineConfig } from "astro/config";
import zueDocs from "zuedocs/astro";

export default defineConfig({
  output: "static",
  outDir: "docs-dist",
  integrations: [zueDocs()],
});
