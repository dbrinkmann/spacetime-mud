import { test } from "node:test";
import assert from "node:assert/strict";
import { WorldSimulation } from "../spacetimedb/src/runtime/simulation.ts";
import {
  WORK_LIMITS,
  admitInvocation,
  settleInvocation,
} from "../shared/runtime/budgets.ts";
import type { Entity, Package } from "../shared/runtime/contracts.ts";
function entity(id: string): Entity {
  return {
    id,
    community: "guild",
    property: "home",
    room: "room",
    owner: "owner",
    generation: 1,
    revision: 1,
    enabled: true,
    components: {},
    publicState: {},
  };
}
function fixture() {
  const sim = new WorldSimulation();
  const pkg: Package = {
    hash: "counter",
    source:
      'function on_use(ctx){ctx.state.set("count",(ctx.state.get("count")||0)+1);}',
    manifest: {
      id: "counter",
      version: "1.0.0",
      apiVersion: 2,
      stateVersion: 1,
      config: { type: "object", properties: {} },
      state: { type: "object", properties: { count: { type: "number" } } },
      initialState: {},
      writes: [],
      handlers: {
        "action:use": { handler: "on_use", input: { type: "null" } },
      },
    },
  };
  sim.register(pkg);
  for (const id of ["busy", "neighbor"]) {
    sim.create(entity(id));
    sim.attach(id, "counter", pkg.hash, {});
  }
  sim.advance(0);
  sim.advance(1);
  return sim;
}
test("flooded recipients defer without faulting, preserve FIFO across restart, and leave neighbors running", () => {
  let sim = fixture();
  for (let i = 0; i < 30; i++) sim.action("busy", "use", null, "alice");
  sim.action("neighbor", "use", null, "bob");
  sim.advance(0);
  assert.equal(sim.store.slot("busy:counter")!.state.count, WORK_LIMITS.slot);
  assert.equal(sim.store.slot("neighbor:counter")!.state.count, 1);
  assert.equal(sim.store.pending("busy").length, 30 - WORK_LIMITS.slot);
  assert.equal(sim.store.slot("busy:counter")!.lastError, "");
  assert.equal(sim.store.pending("busy")[0].notBefore, 2);
  sim = WorldSimulation.restore(sim.snapshot());
  sim.advance(0.9);
  assert.equal(sim.store.slot("busy:counter")!.state.count, 16);
  sim.advance(0.1);
  assert.equal(sim.store.slot("busy:counter")!.state.count, 30);
  assert.equal(sim.store.pending("busy").length, 0);
});
test("entity/community admission is atomic and exhausted windows do not consume another scope's allowance", () => {
  const sim = fixture(),
    e = sim.store.entity("busy")!,
    slot = sim.store.slot("busy:counter")!;
  sim.store.putWorkMeter({
    key: "community:guild",
    window: 1,
    count: WORK_LIMITS.community,
  });
  const previous = sim.store.workMeter("slot:busy:counter");
  assert.equal(admitInvocation(sim.store, e, slot, 1), 2);
  assert.deepEqual(sim.store.workMeter("slot:busy:counter"), previous);
  assert.equal(
    admitInvocation(sim.store, { ...e, community: "other" }, slot, 1),
    null,
  );
  sim.store.putWorkMeter({
    key: "entity:busy",
    window: 2,
    count: WORK_LIMITS.entity,
  });
  assert.equal(admitInvocation(sim.store, e, slot, 2), 3);
  assert.equal(admitInvocation(sim.store, e, slot, 3), null);
});
test("failed executions retain their maximum work reservation while successful small handlers refund it", () => {
  const sim = fixture(),
    e = sim.store.entity("busy")!,
    slot = sim.store.slot("busy:counter")!;
  for (let i = 0; i < 4; i++)
    assert.equal(admitInvocation(sim.store, e, slot, 1), null);
  assert.equal(admitInvocation(sim.store, e, slot, 1), 2);
  assert.equal(
    sim.store.workMeter("steps:slot:busy:counter")!.count,
    WORK_LIMITS.slotSteps,
  );
  assert.equal(admitInvocation(sim.store, e, slot, 2), null);
  settleInvocation(sim.store, e, slot, 2, 123);
  assert.equal(sim.store.workMeter("steps:slot:busy:counter")!.count, 123);
});
