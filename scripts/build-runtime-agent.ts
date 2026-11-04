import { build } from "esbuild";
import { mkdirSync, copyFileSync } from "node:fs";
mkdirSync("public/agent", { recursive: true });
await build({
  entryPoints: ["mcp/runtime-main.ts"],
  outfile: "public/agent/lantern-runtime.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});
copyFileSync("docs/runtime-authoring.md", "public/agent/RUNTIME.md");
console.log("Built provider-neutral runtime MCP client and guide.");
