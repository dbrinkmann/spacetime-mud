import { test } from "node:test";
import assert from "node:assert/strict";
import { WorldSimulation } from "../spacetimedb/src/runtime/simulation";
import { WorldRuntime } from "../spacetimedb/src/runtime/engine";
import { cooperationEntities } from "../shared/runtime/cooperation";
test("hidden objects arbitrate shared regions with transactional leases and lifecycle cleanup", () => {
  let sim = new WorldSimulation();
  sim.register({
    hash: "lease",
    manifest: {
      id: "lease",
      version: "1.0.0",
      apiVersion: 2,
      stateVersion: 1,
      config: { type: "object", properties: {} },
      state: { type: "object", properties: { claimed: { type: "boolean" } } },
      initialState: {},
      writes: [],
      handlers: {
        "action:claim": { handler: "on_claim", input: { type: "null" } },
        "action:release": { handler: "on_release", input: { type: "null" } },
      },
    },
    source:
      'function on_claim(ctx){ctx.state.set("claimed",ctx.reservations.claim("space",{center:[0,0,0],size:[2,2,2]},2));} function on_release(ctx){ctx.reservations.release("space");}',
  });
  const [a, b] = cooperationEntities("lease", "property", "community", "owner");
  for (const e of [a, b]) {
    e.components.visibility = false;
    sim.create(e);
    sim.attach(e.id, "lease", "lease", {});
  }
  sim.advance(0);
  for (const e of [a, b]) sim.action(e.id, "claim", null, "player");
  sim.advance(0);
  assert.equal(sim.store.slot(`${a.id}:lease`)!.state.claimed, true);
  assert.equal(sim.store.slot(`${b.id}:lease`)!.state.claimed, false);
  sim = WorldSimulation.restore(sim.snapshot());
  sim.advance(2.1);
  sim.action(b.id, "claim", null, "player");
  sim.advance(0);
  assert.equal(sim.store.slot(`${b.id}:lease`)!.state.claimed, true);
  new WorldRuntime(sim.store, sim.time).suspend(`${b.id}:lease`);
  assert.equal(sim.store.reservations("property", "room").length, 0);
  sim.action(a.id, "claim", null, "player");
  sim.advance(0);
  assert.equal(sim.store.slot(`${a.id}:lease`)!.state.claimed, true);
});
