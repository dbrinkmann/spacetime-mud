import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createRuntimeMcp } from "../mcp/runtime.ts";
test("an MCP agent validates and simulates a shared package without connecting to a live database", async () => {
  let connections = 0;
  const server = createRuntimeMcp(async () => {
    connections++;
    throw Error("No live connection for this fixture.");
  });
  const client = new Client({ name: "independent-builder", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    return {
      error: result.isError,
      value: JSON.parse((result.content as Array<{ text: string }>)[0].text),
    };
  };
  try {
    const guide = await call("world_guide");
    assert.equal(guide.value.apiVersion, 2);
    assert(
      !(
        await call("world_validate_package", {
          package: guide.value.packageExample,
        })
      ).error,
    );
    const pkg = {
      source:
        'function on_use(ctx){ctx.state.set("count",(ctx.state.get("count")||0)+ctx.config.get("increment"));}',
      license: "MIT",
      documentation: "Portable counter",
      manifest: {
        id: "example.counter",
        version: "1.0.0",
        apiVersion: 2,
        stateVersion: 1,
        config: {
          type: "object",
          properties: { increment: { type: "number", min: 1, max: 10 } },
          required: ["increment"],
        },
        state: { type: "object", properties: { count: { type: "number" } } },
        initialState: {},
        writes: [],
        handlers: {
          "action:use": { handler: "on_use", input: { type: "null" } },
        },
      },
    };
    const validated = await call("world_validate_package", { package: pkg });
    assert(!validated.error);
    assert.match(validated.value.hash, /^[0-9a-f]{64}$/);
    const simulated = await call("world_simulate", {
      packages: [pkg],
      entities: [
        { id: "first", components: {} },
        { id: "second", components: {} },
      ],
      bindings: [
        {
          entity: "first",
          slot: "count",
          packageId: "example.counter",
          config: { increment: 2 },
        },
        {
          entity: "second",
          slot: "count",
          packageId: "example.counter",
          config: { increment: 5 },
        },
      ],
      timeline: [
        { advance: 0, action: { entity: "first", name: "use", payload: null } },
        {
          advance: 0,
          action: { entity: "second", name: "use", payload: null },
        },
      ],
    });
    assert(!simulated.error, JSON.stringify(simulated.value));
    assert.equal(simulated.value.entities[0].slots[0].state.count, 2);
    assert.equal(simulated.value.entities[1].slots[0].state.count, 5);
    const invalid = await call("world_validate_package", {
      package: { ...pkg, source: "function wrong(){}" },
    });
    assert(invalid.error);
    assert.match(invalid.value.error, /handler/);
    assert.equal(connections, 0);
  } finally {
    await client.close();
    await server.close();
  }
});
