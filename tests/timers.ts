import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { connect, until } from "./connect.ts";
const { c } = await connect();
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
try {
  await c.reducers.createPlayer({ name: `Timers ${Date.now().toString(36)}` });
  await c.reducers.createZone({
    name: "Clockmaker test realm",
    description: "Timer contract checks.",
  });
  const roomId = c.db.visiblePlayers.identity.find(c.identity!)!.roomId;
  async function publish(name: string, source: string, objectId = 0n) {
    await c.reducers.saveDraft({
      roomId,
      objectId,
      kind: "scenery",
      name,
      description: "Timer test.",
      source,
      actions: [{ id: "start", label: "Start" }],
    });
    const v = [...c.db.myVersions.iter()].sort((a, b) =>
      Number(b.id - a.id),
    )[0];
    await c.reducers.testDraft({ versionId: v.id, event: "on_start" });
    assert(
      c.db.myVersions.id.find(v.id)?.tested,
      c.db.myVersions.id.find(v.id)?.report,
    );
    await c.reducers.publishVersion({ versionId: v.id });
    return v;
  }
  const start = async (id: bigint) => {
    await pause(280);
    await c.reducers.interact({
      objectId: id,
      action: "start",
      requestId: randomUUID(),
    });
  };
  let v = await publish(
    "Repeating clock",
    'function on_start(ctx){ctx.set("ticks",0);ctx.schedule("tick",1,"",1);}function on_tick(ctx){var n=ctx.get("ticks")+1;ctx.set("ticks",n);ctx.say("tick="+n);if(n===3){ctx.cancel("tick");}}',
  );
  await start(v.objectId);
  await until(
    () => [...c.db.visibleChat.iter()].some((c) => c.text === "tick=3"),
    "repeated ticks",
    7000,
  );
  await pause(1500);
  assert(
    ![...c.db.visibleChat.iter()].some((c) => c.text === "tick=4"),
    "repeat cancellation",
  );
  v = await publish(
    "Replacement clock",
    'function on_start(ctx){ctx.schedule("tick",1,"old");ctx.schedule("tick",2,"new");}function on_tick(ctx){ctx.say(ctx.payload());}',
  );
  await start(v.objectId);
  await until(
    () => [...c.db.visibleChat.iter()].some((c) => c.text === "new"),
    "replacement",
    5000,
  );
  assert(![...c.db.visibleChat.iter()].some((c) => c.text === "old"));
  v = await publish(
    "Deleted clock",
    'function on_start(ctx){ctx.schedule("tick",2);}function on_tick(ctx){ctx.say("deleted timer fired");}',
  );
  await start(v.objectId);
  await c.reducers.deleteObject({ objectId: v.objectId });
  await pause(2300);
  assert(
    ![...c.db.visibleChat.iter()].some((c) => c.text === "deleted timer fired"),
  );
  v = await publish(
    "Versioned clock",
    'function on_start(ctx){ctx.schedule("tick",2);}function on_tick(ctx){ctx.say("stale version fired");}',
  );
  await start(v.objectId);
  await publish(
    "Versioned clock",
    'function on_start(ctx){ctx.say("new version");}',
    v.objectId,
  );
  await pause(2300);
  assert(
    ![...c.db.visibleChat.iter()].some((c) => c.text === "stale version fired"),
  );
  v = await publish(
    "Broken timer",
    'function on_start(ctx){ctx.schedule("tick",1);}function on_tick(ctx){ctx.give("should not exist",1);ctx.say("should not be seen");while(true){}}',
  );
  await start(v.objectId);
  await until(
    () =>
      [...c.db.myTraces.iter()].some(
        (t) => t.objectId === v.objectId && t.result.includes("FAILED"),
      ),
    "failed timer trace",
    5000,
  );
  assert(
    ![...c.db.myInventory.iter()].some((i) => i.name === "should not exist"),
  );
  assert(
    ![...c.db.visibleChat.iter()].some((c) => c.text === "should not be seen"),
  );
  v = await publish(
    "Inventory preview",
    'function on_start(ctx){ctx.give("temporary",1);if(!ctx.has("temporary")){throw "Missing";}ctx.take("temporary",1);ctx.schedule("tick",1);}function on_tick(ctx){ctx.give("temporary",1);ctx.take("temporary",1);ctx.say("inventory timer succeeded");}',
  );
  await start(v.objectId);
  await until(
    () =>
      [...c.db.visibleChat.iter()].some(
        (c) => c.text === "inventory timer succeeded",
      ),
    "overlay inventory",
    5000,
  );
  assert(![...c.db.myInventory.iter()].some((i) => i.name === "temporary"));
  console.log(
    "PASS repeating/cancelled/replaced/deleted/versioned timers, failure rollback and logs, preview inventory semantics",
  );
  // A secret gated passage must not be sent before personal discovery.
  await c.reducers.buildRoom({
    direction: "north",
    name: "Secret observatory",
    description: "Hidden stars.",
  });
  v = await publish(
    "Hidden latch",
    'function on_start(ctx){ctx.remember("discovered",true);ctx.set("open",true);}',
  );
  await c.reducers.configurePassage({
    roomId,
    direction: "north",
    gateId: v.objectId,
    secret: true,
  });
  assert.equal(c.db.visibleRooms.id.find(roomId)?.exits.length, 0);
  await start(v.objectId);
  assert.equal(c.db.visibleRooms.id.find(roomId)?.exits.length, 1);
  await c.reducers.go({ direction: "north" });
  await c.reducers.home({});
  console.log("PASS secret passage discovery, gate configuration and travel");
} finally {
  c.disconnect();
}
