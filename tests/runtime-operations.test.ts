import { test } from "node:test";
import assert from "node:assert/strict";
import { WorldSimulation } from "../spacetimedb/src/runtime/simulation.ts";
import { WorldRuntime } from "../spacetimedb/src/runtime/engine.ts";
import {
  operationDeadline,
  sampleOperation,
} from "../shared/runtime/operations.ts";
import type { Package, Entity } from "../shared/runtime/contracts.ts";
function fixture() {
  const sim = new WorldSimulation();
  const e: Entity = {
    id: "machine",
    community: "guild",
    property: "home",
    room: "room",
    owner: "owner",
    generation: 1,
    revision: 1,
    enabled: true,
    components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0] } },
    publicState: {},
  };
  sim.create(e);
  const nil = { type: "null" as const },
    notice = {
      type: "object" as const,
      properties: {
        id: { type: "string" as const },
        resource: { type: "string" as const },
        outcome: { type: "string" as const },
      },
    };
  const pkg: Package = {
    hash: "motion",
    manifest: {
      id: "motion",
      version: "1.0.0",
      apiVersion: 2,
      stateVersion: 1,
      config: { type: "object", properties: {} },
      state: {
        type: "object",
        properties: {
          ends: { type: "number" },
          cancels: { type: "number" },
          handle: { type: "string" },
        },
      },
      initialState: {},
      writes: ["transform"],
      handlers: {
        "action:move": { handler: "on_move", input: nil },
        "action:pause": { handler: "on_pause", input: nil },
        "action:resume": { handler: "on_resume", input: nil },
        "action:cancel": { handler: "on_cancel", input: nil },
        "operation:completed": { handler: "on_end", input: notice },
        "operation:cancelled": { handler: "on_cancelled", input: notice },
      },
    },
    source:
      'function on_move(ctx){ctx.state.set("handle",ctx.operations.animate("transform",{position:[10,0,0],rotation:[0,90,0]},10));} function on_pause(ctx){ctx.operations.pause("transform");} function on_resume(ctx){ctx.operations.resume("transform");} function on_cancel(ctx){ctx.operations.cancel("transform");} function on_end(ctx){ctx.state.set("ends",(ctx.state.get("ends")||0)+1);} function on_cancelled(ctx){ctx.state.set("cancels",(ctx.state.get("cancels")||0)+1);}',
  };
  sim.register(pkg);
  sim.attach(e.id, "motion", pkg.hash, {});
  sim.advance(0);
  return sim;
}
test("timed operations share late-join sampling, pause/resume and durable exactly-once completion", () => {
  let sim = fixture();
  sim.action("machine", "move", null, "alice");
  sim.advance(0);
  const op = sim.store.operations("machine")[0];
  assert.equal(op.id, sim.store.slot("machine:motion")!.state.handle);
  assert.equal(operationDeadline(op), 10);
  sim.advance(3);
  assert.equal(sampleOperation(op, sim.time).position[0], 3);
  const current = new WorldRuntime(sim.store, sim.time).inspect(
    sim.store.entity("machine")!,
    "machine",
  ) as any;
  assert.equal(current.components.transform.position[0], 3);
  sim.action("machine", "pause", null, "alice");
  sim.advance(0);
  sim.advance(5);
  assert.equal(
    sampleOperation(sim.store.operations("machine")[0], sim.time).position[0],
    3,
  );
  sim = WorldSimulation.restore(sim.snapshot());
  sim.action("machine", "resume", null, "alice");
  sim.advance(0);
  assert.equal(operationDeadline(sim.store.operations("machine")[0]), 15);
  sim.advance(7);
  assert.equal(sim.store.operations("machine").length, 0);
  assert.equal(
    (sim.store.entity("machine")!.components.transform as any).position[0],
    10,
  );
  assert.equal(sim.store.slot("machine:motion")!.state.ends, 1);
  sim.advance(100);
  assert.equal(sim.store.slot("machine:motion")!.state.ends, 1);
});
test("replacement begins at the sampled position and cancellation cannot later complete", () => {
  const sim = fixture();
  sim.action("machine", "move", null, "alice");
  sim.advance(0);
  sim.advance(4);
  sim.action("machine", "move", null, "alice");
  sim.advance(0);
  assert.equal(sim.store.operations("machine")[0].from.position[0], 4);
  assert.equal(sim.store.slot("machine:motion")!.state.cancels, 1);
  sim.action("machine", "cancel", null, "alice");
  sim.advance(0);
  sim.advance(20);
  assert.equal(sim.store.operations("machine").length, 0);
  assert.equal(sim.store.slot("machine:motion")!.state.cancels, 2);
  assert.equal(sim.store.slot("machine:motion")!.state.ends, undefined);
});
test("suspension settles and cleans operations independently of cleanup handlers", () => {
  const sim = fixture();
  sim.action("machine", "move", null, "alice");
  sim.advance(0);
  sim.advance(4);
  new WorldRuntime(sim.store, sim.time).suspend("machine:motion");
  sim.advance(20);
  assert.equal(sim.store.operations("machine").length, 0);
  assert.equal(
    (sim.store.entity("machine")!.components.transform as any).position[0],
    4,
  );
  assert.equal(sim.store.slot("machine:motion")!.state.ends, undefined);
});
