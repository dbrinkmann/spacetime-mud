import assert from "node:assert/strict";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const guild = process.env.RUNTIME_SOAK_COMMUNITY,
  site = process.env.LANTERN_RUNTIME_SITE;
if (!guild || !/^\d+$/.test(guild) || !site)
  throw Error("Existing isolated soak community and candidate site required.");
const directory = resolve(`.bridge/parity${guild}`);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve("dist-runtime-v2/agent/lantern-runtime.mjs")],
  cwd: directory,
  env: {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (x): x is [string, string] => typeof x[1] === "string",
      ),
    ),
    LANTERN_RUNTIME_HOST: "https://maincloud.spacetimedb.com",
    LANTERN_RUNTIME_DATABASE: "dbrinkmann-lantern-runtime-v2",
    LANTERN_RUNTIME_SITE: site,
    MCP_STATE_DIR: resolve(directory, "identity"),
  },
  stderr: "pipe",
});
const client = new Client({ name: "release-preview-check", version: "1.0.0" });
try {
  await client.connect(transport);
  for (const [room, yaw] of [
    ["station", 0],
    ["station", 180],
    ["street", 20],
  ] as const) {
    const result = await client.callTool(
      {
        name: "world_preview",
        arguments: {
          community: guild,
          property: `common:${guild}`,
          room,
          focus: [0, 1, 0],
          zoom: 0.65,
          yaw,
        },
      },
      undefined,
      { timeout: 120000 },
    );
    assert(!result.isError, JSON.stringify(result));
    const image = (result.content as any[]).find((c) => c.type === "image");
    assert(image);
    writeFileSync(
      resolve(directory, `candidate-${room}-${yaw}.png`),
      Buffer.from(image.data, "base64"),
    );
    console.log(JSON.stringify({ room, yaw, preview: "passed", site }));
  }
} finally {
  await client.close();
  await transport.close();
}
