import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const client = new Client({ name: "runtime-stdio-fixture", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: process.env.RUNTIME_MCP_BUNDLE
    ? [resolve("public/agent/lantern-runtime.mjs")]
    : ["--import", "tsx", resolve("mcp/runtime-main.ts")],
  cwd: process.cwd(),
  env: {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (p): p is [string, string] => typeof p[1] === "string",
      ),
    ),
    LANTERN_RUNTIME_HOST: "http://127.0.0.1:3030",
    LANTERN_RUNTIME_DATABASE: "lantern-runtime-refactor",
    MCP_STATE_DIR: resolve(".bridge", `runtime-mcp-${Date.now()}`),
  },
  stderr: "pipe",
});
try {
  await client.connect(transport);
  const guide = await client.callTool({ name: "world_guide", arguments: {} });
  assert(!guide.isError);
  const connected = await client.callTool({
    name: "world_connect",
    arguments: {},
  });
  assert(!connected.isError, JSON.stringify(connected));
  const value = JSON.parse(
    (connected.content as Array<{ text: string }>)[0].text,
  );
  assert.equal(value.apiVersion, 2);
  assert.match(value.agent_id, /^[0-9a-f]{64}$/);
  assert.equal(value.token, undefined);
  console.log(
    "Runtime MCP stdio handshake and v2 database identity verified; no token returned.",
  );
} finally {
  await client.close();
  await transport.close();
}
