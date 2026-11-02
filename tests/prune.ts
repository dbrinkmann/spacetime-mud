import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { connect, until, host, database } from "./connect.ts";
const { c } = await connect();
const { c: upperOwner } = await connect();
const operatorCall = (name: string, ...args: string[]) =>
  execFileSync(
    process.env.SPACETIME_CLI ?? "spacetimedb-cli",
    ["call", "--no-config", database, name, ...args, "--server", host],
    { encoding: "utf8", stdio: "pipe", windowsHide: true },
  );
const prune = (id: bigint) =>
  execFileSync(
    process.env.SPACETIME_CLI ?? "spacetimedb-cli",
    [
      "call",
      "--no-config",
      database,
      "prune_unauthored_zone",
      String(id),
      "--server",
      host,
    ],
    { encoding: "utf8", stdio: "pipe", windowsHide: true },
  );
try {
  await c.reducers.createPlayer({ name: `Prune ${Date.now().toString(36)}` });
  await c.reducers.createZone({
    name: "Legacy cleanup test",
    description: "Disposable legacy zone.",
  });
  let room = c.db.visiblePlayers.identity.find(c.identity!)!.roomId;
  let zone = [...c.db.zone.iter()].find((z) => z.entrance === room)!;
  await assert.rejects(
    c.reducers.pruneUnauthoredZone({ zoneId: zone.id }),
    /operator/,
  );
  assert.throws(() => prune(1n), /protected/);
  prune(zone.id);
  await until(() => !c.db.zone.id.find(zone.id));
  await until(
    () => c.db.visiblePlayers.identity.find(c.identity!)?.roomId === 1n,
  );
  await c.reducers.createZone({
    name: "Authored protection test",
    description: "Preserve 3D work.",
  });
  room = c.db.visiblePlayers.identity.find(c.identity!)!.roomId;
  zone = [...c.db.zone.iter()].find((z) => z.entrance === room)!;
  await c.reducers.saveVisualDraft({
    roomId: room,
    kind: "scene",
    source: readFileSync("public/poc/examples/room.json", "utf8"),
  });
  assert.throws(() => prune(zone.id), /3D work/);
  const d = [...c.db.myVisualDrafts.iter()][0];
  await c.reducers.publishVisual({ key: d.key, revision: d.revision });
  assert.throws(() => prune(zone.id), /3D work/);
  assert(c.db.zone.id.find(zone.id));
  await c.reducers.deleteZone({ zoneId: zone.id });
  await upperOwner.reducers.createPlayer({
    name: `Upper ${Date.now().toString(36)}`,
  });
  await c.reducers.createZone({ name: "Lower test", description: "Inn." });
  const lowerRoom = c.db.visiblePlayers.identity.find(c.identity!)!.roomId;
  const lowerZone = [...c.db.zone.iter()].find(
    (z) => z.entrance === lowerRoom,
  )!;
  await upperOwner.reducers.createZone({
    name: "Upper test",
    description: "Study.",
  });
  const upperRoom = upperOwner.db.visiblePlayers.identity.find(
    upperOwner.identity!,
  )!.roomId;
  const upperZone = [...upperOwner.db.zone.iter()].find(
    (z) => z.entrance === upperRoom,
  )!;
  const source = readFileSync("public/poc/examples/room.json", "utf8");
  for (const [conn, roomId] of [
    [c, lowerRoom],
    [upperOwner, upperRoom],
  ] as const) {
    await conn.reducers.saveVisualDraft({ roomId, kind: "scene", source });
    const draft = [...conn.db.myVisualDrafts.iter()][0];
    await conn.reducers.publishVisual({
      key: draft.key,
      revision: draft.revision,
    });
  }
  await c.reducers.saveDraft({
    roomId: lowerRoom,
    objectId: 0n,
    kind: "scenery",
    name: "Hearth test",
    description: "Preserve me.",
    source: 'function on_touch(ctx){ctx.say("Warm.");}',
    actions: [{ id: "touch", label: "Touch" }],
  });
  const object = [...c.db.visibleObjects.iter()].find(
    (o) => o.name === "Hearth test",
  )!;
  await assert.rejects(
    c.reducers.stackZones({
      lowerZoneId: lowerZone.id,
      upperZoneId: upperZone.id,
      name: "Combined",
    }),
    /operator/,
  );
  const lowerSceneBefore = c.db.visibleScenes.roomId.find(lowerRoom)!.source;
  const upperSceneBefore =
    upperOwner.db.visibleScenes.roomId.find(upperRoom)!.source;
  operatorCall(
    "stack_zones",
    String(lowerZone.id),
    String(upperZone.id),
    JSON.stringify("Combined"),
  );
  await until(
    () =>
      upperOwner.db.zone.id.find(upperZone.id)?.entrance === lowerRoom &&
      c.db.visibleRooms.id.find(lowerRoom)?.zoneId === upperZone.id,
  );
  assert(!c.db.zone.id.find(lowerZone.id));
  assert(
    upperOwner.db.zone.id
      .find(upperZone.id)!
      .owner.equals(upperOwner.identity!),
  );
  await until(
    () =>
      upperOwner.db.visibleObjects.id.find(object.id)?.zoneId === upperZone.id,
  );
  assert.equal(
    c.db.visibleScenes.roomId.find(lowerRoom)?.source,
    lowerSceneBefore,
  );
  assert.equal(
    upperOwner.db.visibleScenes.roomId.find(upperRoom)?.source,
    upperSceneBefore,
  );
  assert.equal(
    JSON.parse(c.db.visibleScenes.roomId.find(lowerRoom)!.source).name,
    JSON.parse(source).name,
  );
  assert.equal(upperOwner.db.visibleRooms.id.find(upperRoom)!.floor, 1);
  await c.reducers.go({ direction: "up" });
  assert.equal(
    c.db.visiblePlayers.identity.find(c.identity!)!.roomId,
    upperRoom,
  );
  await c.reducers.go({ direction: "down" });
  assert.equal(
    c.db.visiblePlayers.identity.find(c.identity!)!.roomId,
    lowerRoom,
  );
  assert.throws(
    () => operatorCall("remove_test_zone", String(upperZone.id)),
    /Not an Agent/,
  );
  await upperOwner.reducers.deleteZone({ zoneId: upperZone.id });
  await c.reducers.createZone({
    name: "Agent Atelier disposable",
    description: "Test cleanup.",
  });
  const testRoom = c.db.visiblePlayers.identity.find(c.identity!)!.roomId;
  const testZone = [...c.db.zone.iter()].find((z) => z.entrance === testRoom)!;
  await assert.rejects(
    c.reducers.removeTestZone({ zoneId: testZone.id }),
    /operator/,
  );
  operatorCall("remove_test_zone", String(testZone.id));
  await until(() => !c.db.zone.id.find(testZone.id));
  console.log(
    "PASS operator prune: denies players, protects Nexus, preserves draft/published 3D work, removes empty legacy zone and relocates player.",
  );
} finally {
  c.disconnect();
  upperOwner.disconnect();
}
