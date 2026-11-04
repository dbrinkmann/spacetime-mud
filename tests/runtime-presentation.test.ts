import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cooperationEntities,
  cooperationPackages,
} from "../shared/runtime/cooperation";
import { WorldSimulation } from "../spacetimedb/src/runtime/simulation";
import { presentEntity } from "../shared/runtime/presentation";
import { validateComponent } from "../shared/runtime/components";
import { sampleOperation } from "../shared/runtime/operations";
test("authored switch drives an independently installed hinge and indicator; reconnect samples motion", () => {
  let sim = new WorldSimulation();
  const pkgs = cooperationPackages("examples");
  pkgs.forEach((p) => sim.register(p));
  cooperationEntities("fixture", "home", "guild", "owner").forEach((e) =>
    sim.create(e),
  );
  sim.attach("fixture.switch", "control", pkgs[0].hash, {
    target: "fixture.door",
  });
  sim.attach("fixture.door", "hinge", pkgs[1].hash, {
    indicator: "fixture.lamp",
  });
  sim.attach("fixture.lamp", "light", pkgs[2].hash, {});
  sim.advance(1);
  sim.action("fixture.switch", "toggle", null, "alice");
  sim.advance(0);
  assert.equal(
    (sim.store.entity("fixture.lamp")!.components.light as any).intensity,
    12,
  );
  sim = WorldSimulation.restore(sim.snapshot());
  sim.advance(0.4);
  assert.ok(
    Math.abs(
      sampleOperation(sim.store.operations("fixture.door")[0], sim.time)
        .rotation[1] - 45,
    ) < 1e-8,
  );
  sim.advance(0.5);
  assert.equal(
    (sim.store.entity("fixture.door")!.components.transform as any).rotation[1],
    90,
  );
  sim.action("fixture.switch", "toggle", null, "alice");
  sim.advance(1);
  assert.equal(
    (sim.store.entity("fixture.lamp")!.components.light as any).intensity,
    0,
  );
  assert.equal(sim.store.slot("fixture.door:hinge")!.lastError, "");
  const e = sim.store.entity("fixture.switch")!;
  e.variables = { secret: "private" };
  assert.equal(
    JSON.stringify(presentEntity(e, [], ["toggle"])).includes("secret"),
    false,
  );
});
test("visual schema retains material controls and rejects malformed geometry", () => {
  const box = {
    position: [0, 0, 0],
    size: [1, 1, 1],
    color: "#111111",
    material: "asphalt",
    roughness: 0.9,
    wear: 0.2,
  };
  assert.deepEqual(
    JSON.parse(JSON.stringify(validateComponent("visual", { boxes: [box] }))),
    { boxes: [box] },
  );
  assert.throws(() =>
    validateComponent("visual", { boxes: [{ ...box, size: [-1, 1, 1] }] }),
  );
  assert.throws(() =>
    validateComponent("visual", { boxes: [{ ...box, material: "unknown" }] }),
  );
});
