import { test } from "node:test";
import assert from "node:assert/strict";
import { WorldSimulation } from "../spacetimedb/src/runtime/simulation";
import { WorldRuntime } from "../spacetimedb/src/runtime/engine";
import { cooperationEntities } from "../shared/runtime/cooperation";
import { sha256, canonical } from "../shared/runtime/digest";
import { validateTemplate } from "../shared/runtime/templates";
import type { Package } from "../shared/runtime/contracts";
test("scripted template spawning initializes behaviors and supports transfer and removal", () => {
  const sim = new WorldSimulation();
  const empty = { type: "object" as const, properties: {} },
    nil = { type: "null" as const };
  const child: Package = {
    hash: "child",
    manifest: {
      id: "child",
      version: "1.0.0",
      apiVersion: 2,
      stateVersion: 1,
      config: empty,
      state: empty,
      initialState: {},
      writes: ["world.destroy", "world.transfer", "light"],
      handlers: {
        "lifecycle:activated": { handler: "on_start", input: nil },
        "action:leave": { handler: "on_leave", input: nil },
        "action:remove": { handler: "on_remove", input: nil },
      },
    },
    source:
      'function on_start(ctx){ctx.components.set("light",{color:"#ffffff",intensity:3});ctx.timers.after(1,"unused",null);} function on_leave(ctx){ctx.world.transfer("other",[1,0,1]);} function on_remove(ctx){ctx.world.destroy();}',
  };
  sim.register(child);
  const definition = {
    property: "home",
    components: { light: { color: "#000000", intensity: 0 } },
    bindings: [{ slot: "behavior", hash: "child", config: {} }],
  };
  const template = { ...definition, hash: sha256(canonical(definition)) };
  validateTemplate(template, (hash) => sim.store.package(hash));
  sim.store.putTemplate(template);
  const parent: Package = {
    hash: "parent",
    manifest: {
      ...child.manifest,
      id: "parent",
      writes: ["world.spawn"],
      state: { type: "object", properties: { child: { type: "string" } } },
      handlers: { "action:create": { handler: "on_create", input: nil } },
    },
    source: `function on_create(ctx){ctx.state.set("child",ctx.world.spawn("${template.hash}",[2,0,2]));}`,
  };
  sim.register(parent);
  const entities = cooperationEntities("fixture", "home", "guild", "owner");
  entities.forEach((e) => sim.create(e));
  sim.create({ ...entities[0], id: "otherFloor", room: "other" });
  sim.attach("fixture.switch", "factory", "parent", {});
  sim.advance(0);
  sim.action("fixture.switch", "create", null, "alice");
  sim.advance(0);
  const id = sim.store.slot("fixture.switch:factory")!.state.child as string;
  assert.equal((sim.store.entity(id)!.components.light as any).intensity, 3);
  assert.ok(sim.store.slot(`${id}:behavior`)!.enabled);
  sim.action(id, "leave", null, "alice");
  sim.advance(0);
  assert.equal(sim.store.entity(id)!.room, "other");
  assert.equal(sim.store.timers(`${id}:behavior`).length, 0);
  sim.action(id, "remove", null, "alice");
  sim.advance(0);
  assert.equal(sim.store.entity(id)!.enabled, false);
  assert.equal(sim.store.pending(id).length, 0);
  assert.equal(sim.store.operations(id).length, 0);
});
