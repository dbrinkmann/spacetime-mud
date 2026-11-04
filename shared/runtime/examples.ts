import { validateManifest } from "./contracts";
/** A portable example consumed by the MCP guide and contract tests. */
export const counterExample = {
  manifest: validateManifest({
    id: "examples.counter",
    version: "1.0.0",
    apiVersion: 2,
    stateVersion: 1,
    config: {
      type: "object",
      properties: { increment: { type: "number", min: 1, max: 10 } },
      required: ["increment"],
    },
    state: {
      type: "object",
      properties: { count: { type: "number" } },
      required: ["count"],
    },
    initialState: { count: 0 },
    handlers: { "action:use": { handler: "on_use", input: { type: "null" } } },
    writes: ["public.count"],
  }),
  source:
    'function on_use(ctx) { var count = ctx.state.get("count") + ctx.config.get("increment"); ctx.state.set("count", count); ctx.public.set("count", count); }',
  license: "MIT",
  documentation:
    "A configurable persistent counter. Attach with {increment:1}; invoke action use with null payload. Exports its count as a public property.",
};
