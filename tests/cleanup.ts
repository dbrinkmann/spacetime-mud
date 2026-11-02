import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { connect, until } from "./connect.ts";
const owner = await connect(),
  visitor = await connect(),
  agent = await connect();
let reconnected: Awaited<ReturnType<typeof connect>> | undefined;
try {
  const suffix = Date.now().toString(36);
  await owner.c.reducers.createPlayer({ name: `Cleanup ${suffix}` });
  await visitor.c.reducers.createPlayer({ name: `Guest ${suffix}` });
  await owner.c.reducers.createZone({
    name: `Cleanup ${suffix}`,
    description: "Disposable cleanup test.",
  });
  const entrance = owner.c.db.visiblePlayers.identity.find(
    owner.c.identity!,
  )!.roomId;
  const zone = [...owner.c.db.zone.iter()].find(
    (z) => z.entrance === entrance,
  )!;
  await owner.c.reducers.consent({ bridge: agent.c.identity! });
  const build = (operation: string, roomId: bigint, payload: unknown = {}) =>
    agent.c.reducers.agentBuild({
      operation,
      roomId,
      payload: JSON.stringify(payload),
    });
  await build("create_room", entrance, {
    direction: "north",
    name: "Old room",
    description: "Disposable room.",
  });
  await until(() =>
    owner.c.db.visibleRooms.id
      .find(entrance)
      ?.exits.some((e) => e.direction === "north"),
  );
  const child = owner.c.db.visibleRooms.id
    .find(entrance)!
    .exits.find((e) => e.direction === "north")!.destination;
  await assert.rejects(
    owner.c.reducers.deleteRoom({ roomId: entrance }),
    /entrance/,
  );
  await assert.rejects(
    owner.c.reducers.deleteZone({ zoneId: 1n }),
    /protected/,
  );
  await visitor.c.reducers.visitZone({ zoneId: zone.id });
  await assert.rejects(
    visitor.c.reducers.deleteRoom({ roomId: child }),
    /owner/,
  );
  await owner.c.reducers.setCollaborator({
    zoneId: zone.id,
    name: `Guest ${suffix}`,
    allowed: true,
  });
  await assert.rejects(
    visitor.c.reducers.deleteZone({ zoneId: zone.id }),
    /owner/,
  );
  await assert.rejects(
    visitor.c.reducers.deleteRoom({ roomId: child }),
    /owner/,
  );
  await owner.c.reducers.go({ direction: "north" });
  await visitor.c.reducers.go({ direction: "north" });
  await owner.c.reducers.saveDraft({
    roomId: child,
    objectId: 0n,
    kind: "scenery",
    name: "Old clock",
    description: "Cleanup clock.",
    actions: [{ id: "start", label: "Start" }],
    source:
      'function on_start(ctx){ctx.set("alive",true);ctx.give("Old token",1);ctx.schedule("tick",60,"",60);}function on_tick(ctx){ctx.say("Old clock tick");}',
  });
  const version = [...owner.c.db.myVersions.iter()].find(
    (v) => v.name === "Old clock",
  )!;
  await owner.c.reducers.testDraft({
    versionId: version.id,
    event: "on_start",
  });
  await owner.c.reducers.publishVersion({ versionId: version.id });
  await owner.c.reducers.interact({
    objectId: version.objectId,
    action: "start",
    requestId: suffix,
  });
  assert.equal(owner.c.db.myInventory.count(), 1n);
  const source = readFileSync("public/poc/examples/room.json", "utf8");
  await owner.c.reducers.saveVisualDraft({
    roomId: child,
    kind: "scene",
    source,
  });
  let d = [...owner.c.db.myVisualDrafts.iter()].find(
    (d) => d.kind === "scene",
  )!;
  await owner.c.reducers.publishVisual({ key: d.key, revision: d.revision });
  await owner.c.reducers.saveVisualDraft({
    roomId: child,
    kind: "scene",
    source,
  });
  await owner.c.reducers.saveVisualDraft({
    roomId: child,
    kind: "avatar",
    source: readFileSync("public/poc/examples/wizard.json", "utf8"),
  });
  await owner.c.reducers.moveWithinRoom({
    x: 2.7,
    z: 3,
    seat: "",
    pose: "idle",
  });
  visitor.c.disconnect();
  await build("delete_room", child);
  await until(
    () =>
      owner.c.db.visiblePlayers.identity.find(owner.c.identity!)?.roomId ===
      entrance,
  );
  await until(
    () =>
      !owner.c.db.visibleRooms.id.find(child) &&
      owner.c.db.myInventory.count() === 0n &&
      owner.c.db.myVersions.count() === 0n,
  );
  assert(!owner.c.db.visibleRooms.id.find(child));
  assert(
    !owner.c.db.visibleRooms.id
      .find(entrance)!
      .exits.some((e) => e.destination === child),
  );
  assert(!owner.c.db.visibleScenes.roomId.find(child));
  assert(!owner.c.db.visibleObjects.id.find(version.objectId));
  assert.equal(owner.c.db.myVersions.count(), 0n);
  assert.equal(owner.c.db.myInventory.count(), 0n);
  assert.equal(owner.c.db.myTraces.count(), 0n);
  assert.equal(owner.c.db.visiblePresence.count(), 0n);
  assert(
    [...owner.c.db.myVisualDrafts.iter()].every(
      (d) => d.kind === "avatar" && d.roomId === entrance,
    ),
  );
  reconnected = await connect(visitor.token);
  assert.equal(
    reconnected.c.db.visiblePlayers.identity.find(reconnected.c.identity!)
      ?.roomId,
    entrance,
  );
  // Avatar drafts survive room deletion and remain publishable.
  d = [...owner.c.db.myVisualDrafts.iter()][0];
  await build("publish_visual", entrance, { key: d.key, revision: d.revision });
  await build("create_room", entrance, {
    direction: "east",
    name: "Another old room",
    description: "Zone cascade.",
  });
  await build("delete_zone", entrance, { zoneId: String(zone.id) });
  await until(() => !reconnected!.c.db.zone.id.find(zone.id));
  await until(
    () =>
      owner.c.db.visiblePlayers.identity.find(owner.c.identity!)?.roomId ===
        1n &&
      reconnected!.c.db.visiblePlayers.identity.find(reconnected!.c.identity!)
        ?.roomId === 1n,
  );
  await until(() => reconnected!.c.db.myMembers.count() === 0n);
  assert.equal(
    owner.c.db.visiblePlayers.identity.find(owner.c.identity!)?.roomId,
    1n,
  );
  assert.equal(
    reconnected.c.db.visiblePlayers.identity.find(reconnected.c.identity!)
      ?.roomId,
    1n,
  );
  assert(
    ![...owner.c.db.visibleRooms.iter()].some((r) => r.zoneId === zone.id),
  );
  assert.equal(reconnected.c.db.myMembers.count(), 0n);
  await assert.rejects(
    build("delete_zone", 1n, { zoneId: String(zone.id) }),
    /not found/,
  );
  await owner.c.reducers.revokeConsent({});
  await assert.rejects(build("delete_room", 1n), /Pair/);
  console.log(
    "PASS room/zone cleanup: owner-only, protected Nexus/entrance, passages, object versions/inventory/traces, visual drafts, online/offline relocation, avatar preservation, membership cleanup, revoked agent.",
  );
} finally {
  owner.c.disconnect();
  visitor.c.disconnect();
  agent.c.disconnect();
  reconnected?.c.disconnect();
}
