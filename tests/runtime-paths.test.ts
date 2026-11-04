import { test } from "node:test";
import assert from "node:assert/strict";
import { WorldSimulation } from "../spacetimedb/src/runtime/simulation";
import { WorldRuntime } from "../spacetimedb/src/runtime/engine";
import { cooperationEntities } from "../shared/runtime/cooperation";
import {
  sampleOperation,
  operationDeadline,
  operationProgress,
} from "../shared/runtime/operations";
import { prepareOperations } from "../spacetimedb/src/runtime/operations";
import type { Package } from "../shared/runtime/contracts";
test("named-part paths support once, loop, pingpong, pause/resume and completion", () => {
  const sim = new WorldSimulation();
  const pkg: Package = {
    hash: "path",
    manifest: {
      id: "path",
      version: "1.0.0",
      apiVersion: 2,
      stateVersion: 1,
      config: { type: "object", properties: {} },
      state: { type: "object", properties: { completed: { type: "boolean" } } },
      initialState: {},
      writes: ["transform.leaf"],
      handlers: {
        "action:start": { handler: "on_start", input: { type: "string" } },
        "action:pause": { handler: "on_pause", input: { type: "null" } },
        "action:resume": { handler: "on_resume", input: { type: "null" } },
        "action:restart": { handler: "on_restart", input: { type: "null" } },
        "operation:completed": {
          handler: "on_end",
          input: {
            type: "object",
            properties: {
              id: { type: "string" },
              resource: { type: "string" },
              outcome: { type: "string" },
            },
          },
        },
      },
    },
    source:
      'function on_restart(ctx){ctx.operations.restart("transform.leaf");}' +
      'function on_start(ctx,mode){ctx.operations.follow("transform.leaf",[[0,0,0],[10,0,0],[10,0,10]],5,mode);} function on_pause(ctx){ctx.operations.pause("transform.leaf");} function on_resume(ctx){ctx.operations.resume("transform.leaf");} function on_end(ctx){ctx.state.set("completed",true);}',
  };
  sim.register(pkg);
  const entity = cooperationEntities("fixture", "home", "guild", "owner")[2];
  entity.components["transform.leaf"] = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  };
  sim.create(entity);
  sim.attach(entity.id, "path", "path", {});
  sim.advance(1);
  sim.action(entity.id, "start", "pingpong", "alice");
  sim.advance(0);
  let op = sim.store.operations(entity.id)[0];
  assert.equal(operationDeadline(op), Infinity);
  assert.deepEqual(sampleOperation(op, 3).position, [10, 0, 0]);
  assert.deepEqual(sampleOperation(op, 6).position, [10, 0, 5]);
  const loop = { ...op, mode: "loop" as const };
  assert.deepEqual(sampleOperation(loop, 6).position, [5, 0, 0]);
  const slot = sim.store.slot(`${entity.id}:path`)!;
  const event = {
    correlation: "test",
    depth: 0,
  } as import("../shared/runtime/contracts").Event;
  const accelerated = prepareOperations(
    entity,
    slot,
    event,
    [
      {
        type: "operation",
        command: "speed",
        resource: "transform.leaf",
        multiplier: 2,
      },
    ],
    [loop],
    2,
  ).operations[0];
  assert.deepEqual(
    sampleOperation(accelerated, 2).position,
    sampleOperation(loop, 2).position,
  );
  assert.equal(operationProgress(accelerated, 3), 0.75);
  const restarted = prepareOperations(
    entity,
    slot,
    event,
    [
      { type: "operation", command: "pause", resource: "transform.leaf" },
      { type: "operation", command: "restart", resource: "transform.leaf" },
    ],
    [accelerated],
    3,
  ).operations[0];
  assert.equal(restarted.paused, true);
  assert.deepEqual(sampleOperation(restarted, 100).position, [0, 0, 0]);
  sim.advance(1);
  sim.action(entity.id, "pause", null, "alice");
  sim.advance(0);
  op = sim.store.operations(entity.id)[0];
  assert.deepEqual(sampleOperation(op, 100).position, [5, 0, 0]);
  sim.action(entity.id, "resume", null, "alice");
  sim.advance(0);
  sim.action(entity.id, "start", "once", "alice");
  sim.advance(0);
  sim.advance(4);
  assert.equal(sim.store.operations(entity.id).length, 0);
  assert.equal(sim.store.slot(`${entity.id}:path`)!.state.completed, true);
  sim.action(entity.id, "restart", null, "alice");
  sim.advance(0);
  assert.deepEqual(
    sampleOperation(sim.store.operations(entity.id)[0], sim.time).position,
    [0, 0, 0],
  );
  assert.deepEqual(
    sim.store.entity(entity.id)!.components.transform,
    entity.components.transform,
  );
});
