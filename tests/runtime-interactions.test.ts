import { test } from "node:test";
import assert from "node:assert/strict";
import { WorldSimulation } from "../spacetimedb/src/runtime/simulation";
import { WorldRuntime } from "../spacetimedb/src/runtime/engine";
import { cooperationEntities } from "../shared/runtime/cooperation";
import type { Package } from "../shared/runtime/contracts";
import { guidePackage } from "../shared/runtime/guide-example";
import { resolveTarget } from "../shared/runtime/targeting";

test("target requests carry player context and validate current kind, room, visibility and range", () => {
  const sim = new WorldSimulation();
  sim.register(guidePackage);
  for (const e of cooperationEntities("target", "home", "guild", "owner"))
    sim.create(e);
  sim.attach("target.switch", "guide", "guide", {});
  sim.advance(0);
  sim.store.putPlayer({
    id: "alice",
    name: "Alice",
    property: "home",
    room: "room",
    walk: { start: [0, 0, 0], points: [], speed: 1, started: 0 },
  });
  sim.action("target.switch", "inspect", null, "alice");
  sim.advance(0);
  assert.equal(sim.store.slot("target.switch:guide")!.lastError, "");
  const request = sim.store
    .interactions("target.switch")
    .find((r) => r.target)!;
  assert.equal(request.player, "alice");
  assert.equal(request.target!.range, 12);
  assert.deepEqual(resolveTarget(sim.store, request, "target.lamp", 0), {
    target: "target.lamp",
  });
  assert.deepEqual(resolveTarget(sim.store, request, "player:alice", 0), {
    target: "player:alice",
  });
  assert.throws(
    () =>
      resolveTarget(
        sim.store,
        { ...request, target: { kinds: ["object"], range: 12 } },
        "player:alice",
        0,
      ),
    /allowed target/,
  );
  const lamp = sim.store.entity("target.lamp")!;
  lamp.components.visibility = false;
  sim.store.putEntity(lamp);
  assert.throws(
    () => resolveTarget(sim.store, request, "target.lamp", 0),
    /allowed target/,
  );
  assert.throws(
    () =>
      resolveTarget(
        sim.store,
        { ...request, target: { kinds: ["object"], range: 0.1 } },
        "target.switch",
        0,
      ),
    /allowed target/,
  );
});
test("simulation includes player trajectories, sampled inspection and persistent spatial membership", () => {
  let sim = new WorldSimulation();
  sim.register(guidePackage);
  const entity = cooperationEntities("pedestrian", "home", "guild", "owner")[1];
  sim.create(entity);
  sim.attach(entity.id, "guide", "guide", {});
  sim.store.putPlayer({
    id: "alice",
    property: "home",
    room: "room",
    walk: { start: [-6, 0, 1], points: [[2, 0, 1]], started: 0, speed: 1 },
  });
  sim.run(3);
  assert.equal(sim.store.slot(`${entity.id}:guide`)!.state.arrivals, 1);
  const inspected = new WorldRuntime(sim.store, sim.time).inspect(
    entity,
    "player:alice",
  ) as any;
  assert.deepEqual(inspected.position, [-3, 0, 1]);
  sim = WorldSimulation.restore(sim.snapshot());
  sim.run(5);
  assert.deepEqual(sim.store.views(entity.id)[0].members, []);
});

test("any entity can speak, offer choices and remember players separately across restart", () => {
  let sim = new WorldSimulation();
  sim.register(guidePackage);
  sim.create(cooperationEntities("guide", "home", "guild", "owner")[1]);
  sim.attach("guide.switch", "guide", "guide", {});
  sim.advance(0);
  sim.action("guide.switch", "talk", null, "alice");
  sim.advance(0);
  assert.equal(sim.store.playerState("guide.switch:guide", "alice").visits, 1);
  const dialog = sim.store
    .interactions("guide.switch")
    .find((r) => r.kind === "dialog")!;
  assert.equal(dialog.player, "alice");
  assert.deepEqual(dialog.choices, ["Directions", "Goodbye"]);
  sim = WorldSimulation.restore(sim.snapshot());
  sim.advance(1);
  sim.action("guide.switch", "talk", null, "bob");
  sim.advance(0);
  sim.action("guide.switch", "talk", null, "alice");
  sim.advance(0);
  assert.equal(sim.store.playerState("guide.switch:guide", "alice").visits, 2);
  assert.equal(sim.store.playerState("guide.switch:guide", "bob").visits, 1);
  new WorldRuntime(sim.store, sim.time).enqueue(
    "guide.switch",
    "dialog",
    "help",
    { choice: "Directions" },
    { kind: "player", id: "alice" },
    dialog.slot,
    dialog.generation,
  );
  sim.advance(0);
  assert.ok(
    sim.store
      .interactions("guide.switch")
      .some((r) => r.text === "The switch opens the door." && !r.player),
  );
  sim.action("guide.switch", "introduce", null, "alice");
  sim.advance(0);
  assert.equal(
    sim.store
      .interactions("guide.switch")
      .find((r) => r.kind === "dialog" && r.player === "alice")?.maxLength,
    60,
  );
});
test("random draws are deterministic on replay and differ between invocations", () => {
  const sim = new WorldSimulation();
  const pkg: Package = {
    ...guidePackage,
    hash: "random",
    manifest: {
      ...guidePackage.manifest,
      state: { type: "object", properties: { draw: { type: "number" } } },
      handlers: {
        "action:draw": { handler: "on_draw", input: { type: "null" } },
      },
    },
    source: 'function on_draw(ctx){ctx.state.set("draw",ctx.random());}',
  };
  sim.register(pkg);
  sim.create(cooperationEntities("rng", "home", "guild", "owner")[1]);
  sim.attach("rng.switch", "random", "random", {});
  sim.advance(0);
  sim.action("rng.switch", "draw", null, "alice");
  const replay = WorldSimulation.restore(sim.snapshot());
  sim.advance(0);
  replay.advance(0);
  const first = sim.store.slot("rng.switch:random")!.state.draw as number;
  assert.equal(first, replay.store.slot("rng.switch:random")!.state.draw);
  assert.ok(first >= 0 && first < 1);
  sim.action("rng.switch", "draw", null, "alice");
  sim.advance(0);
  assert.notEqual(first, sim.store.slot("rng.switch:random")!.state.draw);
});
