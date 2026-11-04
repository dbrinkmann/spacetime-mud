import { test } from "node:test";
import assert from "node:assert/strict";
import { WorldSimulation } from "../spacetimedb/src/runtime/simulation";
import { WorldRuntime } from "../spacetimedb/src/runtime/engine";
import { cooperationEntities } from "../shared/runtime/cooperation";
import { evaluateRoomViews } from "../shared/runtime/spatial";
import type { Package } from "../shared/runtime/contracts";
test("views predict path crossings with enter/exit membership and no idle ticks", () => {
  const sim = new WorldSimulation(),
    empty = { type: "object" as const, properties: {} },
    nil = { type: "null" as const };
  const pkg: Package = {
    hash: "sensor",
    manifest: {
      id: "sensor",
      version: "1.0.0",
      apiVersion: 2,
      stateVersion: 1,
      config: empty,
      state: {
        type: "object",
        properties: { enter: { type: "number" }, exit: { type: "number" } },
      },
      initialState: {},
      writes: [],
      handlers: {
        "lifecycle:activated": { handler: "on_start", input: nil },
        "spatial:enter": {
          handler: "on_enter",
          input: {
            type: "object",
            properties: {
              view: { type: "string" },
              entity: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  kind: { type: "string" },
                },
              },
            },
          },
        },
        "spatial:exit": {
          handler: "on_exit",
          input: {
            type: "object",
            properties: {
              view: { type: "string" },
              entity: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  kind: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    source:
      'function on_start(ctx){ctx.subscribe("near",{frame:"room",box:{center:[0,0,0],size:[2,2],height:2},include:["tag:car"]});} function on_enter(ctx,p){ctx.state.set("enter",ctx.view(p.view).length);} function on_exit(ctx,p){ctx.state.set("exit",ctx.view(p.view).length);}',
  };
  sim.register(pkg);
  const [sensor, car] = cooperationEntities(
    "fixture",
    "home",
    "guild",
    "owner",
  );
  sensor.components.visibility = false;
  car.components.tags = ["car"];
  car.components.transform = { position: [-5, 0, 0], rotation: [0, 0, 0] };
  sim.create(sensor);
  sim.create(car);
  sim.attach(sensor.id, "sensor", "sensor", {});
  sim.advance(0);
  sim.store.putOperation({
    id: "travel",
    entity: car.id,
    slot: "unused",
    generation: 1,
    resource: "transform",
    from: { position: [-5, 0, 0], rotation: [0, 0, 0] },
    to: { position: [5, 0, 0], rotation: [0, 0, 0] },
    started: 0,
    duration: 10,
    progress: 0,
    paused: false,
    correlation: "test",
    depth: 0,
    path: [
      [-5, 0, 0],
      [5, 0, 0],
    ],
    mode: "once",
  });
  const evaluate = () => {
    const runtime = new WorldRuntime(sim.store, sim.time);
    return evaluateRoomViews(
      sim.store,
      "home",
      "room",
      sim.time,
      [],
      (entity, slot, generation, name, payload) =>
        runtime.enqueue(
          entity,
          "spatial",
          name,
          payload,
          { kind: "engine", id: "spatial" },
          slot,
          generation,
        ),
    );
  };
  const next = evaluate();
  const timeline = WorldSimulation.restore(sim.snapshot());
  const ran = timeline.run(7);
  assert.equal(ran.complete, true);
  assert.equal(timeline.store.slot(`${sensor.id}:sensor`)!.state.enter, 1);
  assert.equal(timeline.store.slot(`${sensor.id}:sensor`)!.state.exit, 0);
  assert.ok(Math.abs(next - 4) < 0.001);
  sim.advance(next);
  evaluate();
  sim.advance(0);
  assert.equal(sim.store.slot(`${sensor.id}:sensor`)!.state.enter, 1);
  sim.advance(2.1);
  evaluate();
  sim.advance(0);
  assert.equal(sim.store.slot(`${sensor.id}:sensor`)!.state.exit, 0);
  sim.store.removeOperation("travel");
  assert.equal(evaluate(), Infinity);
});
