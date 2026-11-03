import { build } from "esbuild";
import { readFileSync, mkdirSync } from "node:fs";
mkdirSync("public/agent", { recursive: true });
await build({
  entryPoints: ["mcp/community.ts"],
  outfile: "public/agent/lantern-agent.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  define: {
    COMMUNITY_AUTHORING: JSON.stringify(
      readFileSync("public/agent/AUTHORING.md", "utf8"),
    ),
    COMMUNITY_ROOM_SCHEMA: JSON.stringify(
      readFileSync("public/poc/room.schema.json", "utf8"),
    ),
    COMMUNITY_CHARACTER_SCHEMA: JSON.stringify(
      readFileSync("public/poc/character.schema.json", "utf8"),
    ),
  },
});
console.log("Built downloadable community MCP client.");
