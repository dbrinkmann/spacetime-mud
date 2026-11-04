import { movingPackage } from "./fixtures/runtime-mover";
import { test } from "node:test";
import assert from "node:assert/strict";
import { WorldSimulation } from "../spacetimedb/src/runtime/simulation";
import type { Package, Entity } from "../shared/runtime/contracts";
import type { DataSchema } from "../shared/runtime/values";
test("six reusable moving instances complete repeated hidden respawn cycles without losing subscriptions", () => {
  let sim = new WorldSimulation();
  const pkg = movingPackage();
  sim.register(pkg);
  for (let i = 0; i < 6; i++) {
    const y = i >= 4 ? 12 : 0,
      z = i % 2 ? 2 : -2,
      start = i % 2 ? 10 : -10;
    const e: Entity = {
      id: `mover${i}`,
      community: "guild",
      property: "street",
      room: "room",
      owner: "owner",
      generation: 1,
      revision: 1,
      enabled: true,
      publicState: {},
      components: {
        transform: { position: [start, y, z], rotation: [0, 0, 0] },
        visibility: false,
        tags: ["mover"],
      },
    };
    sim.create(e);
    sim.attach(e.id, "movement", "mover", { start, end: -start, y, z });
  }
  for (let i = 0; i < 180; i++) {
    const result = sim.run(1, 4096);
    assert.ok(result.complete);
    if (i === 80) sim = WorldSimulation.restore(sim.snapshot());
    for (let j = 0; j < 6; j++)
      assert.equal(
        sim.store.slot(`mover${j}:movement`)!.lastError,
        "",
        `mover ${j} at ${i}`,
      );
  }
  for (let i = 0; i < 6; i++) {
    assert.ok(
      (sim.store.slot(`mover${i}:movement`)!.state.cycles as number) >= 20,
      `mover ${i} must finish twenty cycles`,
    );
    assert.equal(sim.store.views(`mover${i}`).length, 1);
    assert.ok(sim.store.pending(`mover${i}`).length < 8);
  }
});
