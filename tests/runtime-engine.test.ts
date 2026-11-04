import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../shared/runtime/memory-store.ts";
import { WorldRuntime } from "../spacetimedb/src/runtime/engine.ts";
import type { Entity, Package } from "../shared/runtime/contracts.ts";
const empty = { type: "object" as const, properties: {} };
const nil = { type: "null" as const };
test("shared variables declare readers and writers, coalesce changes, and keep private state out of inspection", () => {
  const store = new MemoryStore(),
    world = new WorldRuntime(store, 0);
  world.create(entity("machine"));
  const writer = packageOf(
    "writer",
    'function on_use(ctx){ctx.variables.set("level",1);ctx.variables.set("level",2);ctx.state.set("count",ctx.variables.get("level"));} function on_bad(ctx){ctx.variables.set("level",99);}',
    {
      "action:use": { handler: "on_use", input: nil },
      "action:bad": { handler: "on_bad", input: nil },
    },
    ["variables.level"],
  );
  writer.manifest.variables = { level: { type: "number", min: 0, max: 3 } };
  const reader = packageOf(
    "reader",
    'function on_change(ctx){ctx.state.set("count",(ctx.state.get("count")||0)+ctx.variables.get("level"));}',
    {
      "variable:level": {
        handler: "on_change",
        input: {
          type: "object",
          properties: { key: { type: "string" }, exists: { type: "boolean" } },
        },
      },
    },
  );
  reader.manifest.reads = ["variables.level"];
  world.register(writer);
  world.register(reader);
  world.attach("machine", "writer", "writer", {});
  world.attach("machine", "reader", "reader", {});
  world.drain("machine");
  world.action("machine", "use", null, "alice");
  world.drain("machine");
  assert.equal(store.entity("machine")!.variables!.level, 2);
  assert.equal(store.slot("machine:reader")!.state.count, 2);
  assert.equal(store.slot("machine:writer")!.state.count, 2);
  world.action("machine", "use", null, "alice");
  world.drain("machine");
  assert.equal(
    store.slot("machine:reader")!.state.count,
    2,
    "equal final value must not retrigger observers",
  );
  world.action("machine", "bad", null, "alice");
  world.drain("machine");
  assert.equal(store.entity("machine")!.variables!.level, 2);
  assert.equal(store.slot("machine:reader")!.enabled, true);
  assert.equal(
    (world.inspect(store.entity("machine")!, "machine") as any).variables,
    undefined,
  );
  assert.throws(
    () =>
      world.register({
        ...reader,
        hash: "unreadable",
        manifest: { ...reader.manifest, reads: [] },
      }),
    /read authority/,
  );
});
function entity(id: string, property = "home"): Entity {
  return {
    id,
    property,
    community: "guild",
    room: "room",
    owner: "owner",
    generation: 1,
    revision: 1,
    enabled: true,
    components: { visibility: true, light: { color: "#ffffff", intensity: 0 } },
    publicState: {},
  };
}
function packageOf(
  hash: string,
  source: string,
  handlers: Package["manifest"]["handlers"],
  writes: string[] = [],
): Package {
  return {
    hash,
    source,
    manifest: {
      id: hash,
      version: "1.0.0",
      apiVersion: 2,
      stateVersion: 1,
      config: empty,
      state: {
        type: "object",
        properties: {
          count: { type: "number" },
          record: {
            type: "object",
            properties: { items: { type: "array", items: { type: "number" } } },
          },
        },
      },
      initialState: {},
      handlers,
      writes,
    },
  };
}
test("revoked sender rejects queued messages without faulting the receiver", () => {
  const store = new MemoryStore(),
    world = new WorldRuntime(store, 0);
  world.create(entity("sender"));
  world.create(entity("receiver"));
  world.register(
    packageOf(
      "senderPkg",
      'function on_use(ctx){ctx.messages.send("receiver","ping",null);}',
      { "action:use": { handler: "on_use", input: nil } },
    ),
  );
  world.register(
    packageOf(
      "receiverPkg",
      'function on_ping(ctx){ctx.state.set("count",1);}',
      { "message:ping": { handler: "on_ping", input: nil } },
    ),
  );
  world.attach("sender", "s", "senderPkg", {});
  world.attach("receiver", "r", "receiverPkg", {});
  world.drain("sender");
  world.drain("receiver");
  world.action("sender", "use", null, "alice");
  world.drain("sender");
  const event = store.pending("receiver")[0].event;
  store.setRuntimeGrant("sender:s", false);
  world.drain("receiver");
  assert.equal(store.slot("receiver:r")!.enabled, true);
  assert.equal(store.slot("receiver:r")!.lastError, "");
  assert.equal(store.slot("receiver:r")!.state.count, undefined);
  assert.equal(store.receipt(`${event.id}:receiver:r`)!.outcome, "rejected");
});
test("malformed actions are refused before delivery and cannot disable a behavior", () => {
  const store = new MemoryStore(),
    world = new WorldRuntime(store, 0);
  world.create(entity("object"));
  world.register(
    packageOf("actionPkg", 'function on_use(ctx){ctx.state.set("count",1);}', {
      "action:use": { handler: "on_use", input: nil },
    }),
  );
  world.attach("object", "s", "actionPkg", {});
  assert.throws(
    () => world.action("object", "use", null, "alice"),
    /unavailable/,
  );
  world.drain("object");
  assert.throws(() => world.action("object", "use", {}, "alice"), /schema/);
  assert.equal(store.pending("object").length, 0);
  assert.equal(store.slot("object:s")!.enabled, true);
});
test("independent behaviors communicate asynchronously and persist across restart", () => {
  let store = new MemoryStore(),
    world = new WorldRuntime(store, 100);
  world.create(entity("switch"));
  world.create(entity("lamp"));
  world.register(
    packageOf(
      "switchPackage",
      'function on_use(ctx){ctx.messages.send("lamp","lamp.on",null);ctx.state.set("count",1);}',
      { "action:use": { handler: "on_use", input: nil } },
    ),
  );
  world.register(
    packageOf(
      "lampPackage",
      'function on_message(ctx){ctx.components.set("light",{color:"#ff9900",intensity:3});ctx.state.set("count",(ctx.state.get("count")||0)+1);}',
      { "message:lamp.on": { handler: "on_message", input: nil } },
      ["light"],
    ),
  );
  world.attach("switch", "control", "switchPackage", {});
  world.attach("lamp", "light", "lampPackage", {});
  world.drain("switch");
  world.drain("lamp");
  world.enqueue("switch", "action", "use", null, {
    kind: "player",
    id: "alice",
  });
  world.drain("switch");
  assert.equal((store.entity("lamp")!.components.light as any).intensity, 0);
  store = MemoryStore.restore(store.export());
  world = new WorldRuntime(store, 102);
  world.drain("lamp");
  assert.equal((store.entity("lamp")!.components.light as any).intensity, 3);
  assert.equal(store.slot("lamp:light")!.state.count, 1);
  world.drain("lamp");
  assert.equal(store.slot("lamp:light")!.state.count, 1);
});
test("invalid effects roll back variables and messages and do not fault neighboring slots", () => {
  const store = new MemoryStore(),
    world = new WorldRuntime(store, 100);
  world.create(entity("object"));
  world.register(
    packageOf(
      "bad",
      'function on_use(ctx){ctx.state.set("count",99);ctx.components.set("light",{color:"red",intensity:5});}',
      { "action:use": { handler: "on_use", input: nil } },
      ["light"],
    ),
  );
  world.register(
    packageOf("good", 'function on_use(ctx){ctx.state.set("count",7);}', {
      "action:use": { handler: "on_use", input: nil },
    }),
  );
  world.attach("object", "bad", "bad", {});
  world.attach("object", "good", "good", {});
  world.drain("object");
  world.enqueue("object", "action", "use", null, {
    kind: "player",
    id: "alice",
  });
  world.drain("object");
  assert.equal(store.slot("object:bad")!.state.count, undefined);
  assert.equal(store.slot("object:bad")!.enabled, false);
  assert.equal(store.slot("object:good")!.state.count, 7);
  assert.equal(store.slot("object:good")!.enabled, true);
});
test("structured state is explicit and returned copies cannot mutate committed storage", () => {
  const store = new MemoryStore(),
    world = new WorldRuntime(store, 0);
  world.create(entity("object"));
  world.register(
    packageOf(
      "state",
      'function on_create(ctx){ctx.state.set("record",{items:[1,2]});var r=ctx.state.get("record");r.items[0]=9;} function on_use(ctx){var r=ctx.state.get("record");r.items[0]=3;ctx.state.set("record",r);}',
      {
        "lifecycle:created": { handler: "on_create", input: nil },
        "action:use": { handler: "on_use", input: nil },
      },
    ),
  );
  world.attach("object", "state", "state", {});
  world.drain("object");
  assert.deepEqual(store.slot("object:state")!.state.record, { items: [1, 2] });
  world.enqueue("object", "action", "use", null, {
    kind: "player",
    id: "alice",
  });
  world.drain("object");
  assert.deepEqual(store.slot("object:state")!.state.record, { items: [3, 2] });
});
test("resources are exclusive and cross-property messages roll back", () => {
  const store = new MemoryStore(),
    world = new WorldRuntime(store, 0);
  world.create(entity("one"));
  world.create(entity("two", "other"));
  world.register(
    packageOf(
      "p",
      'function on_use(ctx){ctx.state.set("count",1);ctx.messages.send("two","request",null);}',
      { "action:use": { handler: "on_use", input: nil } },
      ["light"],
    ),
  );
  world.attach("one", "a", "p", {});
  assert.throws(() => world.attach("one", "b", "p", {}), /resource/);
  world.drain("one");
  world.enqueue("one", "action", "use", null, { kind: "player", id: "alice" });
  world.drain("one");
  assert.equal(store.slot("one:a")!.state.count, undefined);
  assert.equal(store.pending("two").length, 0);
});
test("timers use virtual deadlines and fire overdue work only once", () => {
  const store = new MemoryStore();
  let world = new WorldRuntime(store, 100);
  world.create(entity("object"));
  world.register(
    packageOf(
      "timer",
      'function on_start(ctx){ctx.timers.after(.25,"tick",null);} function on_tick(ctx){ctx.state.set("count",(ctx.state.get("count")||0)+1);}',
      {
        "lifecycle:activated": { handler: "on_start", input: nil },
        "timer:tick": { handler: "on_tick", input: nil },
      },
    ),
  );
  world.attach("object", "timer", "timer", {});
  world.drain("object");
  assert.equal(world.fireDueTimers(), 0);
  world = new WorldRuntime(store, 200);
  assert.equal(world.fireDueTimers(), 1);
  world.drain("object");
  assert.equal(world.fireDueTimers(), 0);
  assert.equal(store.slot("object:timer")!.state.count, 1);
});
test("suspend cancels timers and pending activation, resume does not replay created", () => {
  const store = new MemoryStore(),
    world = new WorldRuntime(store, 0);
  world.create(entity("object"));
  world.register(
    packageOf(
      "life",
      'function on_created(ctx){ctx.state.set("count",(ctx.state.get("count")||0)+1);} function on_active(ctx){ctx.timers.after(1,"tick",null);}',
      {
        "lifecycle:created": { handler: "on_created", input: nil },
        "lifecycle:activated": { handler: "on_active", input: nil },
      },
    ),
  );
  world.attach("object", "life", "life", {});
  world.step("object");
  world.suspend("object:life");
  world.drain("object");
  assert.equal(store.slot("object:life")!.enabled, false);
  assert.equal(store.timers("object:life").length, 0);
  world.resume("object:life");
  world.drain("object");
  assert.equal(store.slot("object:life")!.enabled, true);
  assert.equal(store.slot("object:life")!.state.count, 1);
  assert.equal(store.timers("object:life").length, 1);
  world.suspend("object:life");
  assert.equal(store.timers("object:life").length, 0);
});
test("upgrades migrate copies atomically and reject queued work from the old generation", () => {
  const store = new MemoryStore(),
    world = new WorldRuntime(store, 0);
  world.create(entity("object"));
  const old = packageOf(
    "revisionOne",
    'function on_use(ctx){ctx.state.set("count",1);}',
    { "action:use": { handler: "on_use", input: nil } },
  );
  old.manifest.id = "counter";
  world.register(old);
  world.attach("object", "counter", old.hash, {});
  world.drain("object");
  world.action("object", "use", null, "alice");
  world.drain("object");
  const next = packageOf(
    "revisionTwo",
    'function on_migrate(ctx){ctx.state.set("record",{items:[ctx.state.get("count")]});ctx.state.delete("count");} function on_use(ctx){ctx.state.set("record",{items:[99]});}',
    { "action:use": { handler: "on_use", input: nil } },
  );
  next.manifest = {
    ...next.manifest,
    id: "counter",
    version: "2.0.0",
    stateVersion: 2,
    state: {
      type: "object",
      properties: {
        record: {
          type: "object",
          properties: { items: { type: "array", items: { type: "number" } } },
        },
      },
    },
    migrations: { "1": "on_migrate" },
  };
  world.register(next);
  const before = store.slot("object:counter")!;
  const bad = {
    ...next,
    hash: "badMigration",
    source:
      'function on_use(ctx){} function on_migrate(ctx){ctx.state.set("record",{items:[3]});while(true){}}',
  };
  world.register(bad);
  assert.throws(() => world.upgrade(before.id, bad.hash, {}));
  assert.deepEqual(store.slot(before.id), before);
  const stale = world.action("object", "use", null, "alice");
  world.upgrade(before.id, next.hash, {});
  world.drain("object");
  assert.equal(store.receipt(`${stale}:${before.id}`)!.outcome, "stale");
  assert.deepEqual(store.slot(before.id)!.state, { record: { items: [1] } });
  assert.equal(store.slot(before.id)!.enabled, true);
});
