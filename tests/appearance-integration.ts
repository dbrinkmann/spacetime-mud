import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { connect, host, database, until } from "./connect.ts";
import { parseDefinition } from "../shared/geometry.ts";
const { c } = await connect();
try {
  const guild = String(Date.now());
  await new Promise<void>((resolve, reject) =>
    c
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .onError(reject)
      .subscribe([
        "SELECT * FROM my_communities",
        "SELECT * FROM community_rooms",
      ]),
  );
  execFileSync(
    process.env.SPACETIME_CLI ?? "spacetimedb-cli",
    [
      "call",
      "--no-config",
      database,
      "provision_community",
      JSON.stringify(guild),
      '"Appearance test"',
      JSON.stringify(c.identity!.toHexString()),
      '"1"',
      "--server",
      host,
    ],
    { stdio: "pipe", windowsHide: true },
  );
  await until(() => c.db.myCommunities.id.find(guild));
  const id = c.db.myCommunities.id.find(guild)!.welcomeRoom;
  await until(() => c.db.communityRooms.id.find(id));
  const original = c.db.communityRooms.id.find(id)!;
  const room = parseDefinition(original.source, "room");
  room.floorMaterial = "asphalt";
  await c.reducers.publishCommunityRoomAppearance({
    roomId: id,
    source: JSON.stringify(room),
    baseRevision: original.revision,
  });
  await until(
    () => c.db.communityRooms.id.find(id)?.revision === original.revision + 1,
  );
  assert.equal(
    parseDefinition(c.db.communityRooms.id.find(id)!.source, "room")
      .floorMaterial,
    "asphalt",
  );
  await assert.rejects(
    c.reducers.publishCommunityRoomAppearance({
      roomId: id,
      source: JSON.stringify(room),
      baseRevision: original.revision,
    }),
    /Room changed/,
  );
  room.spawn[0] += 1;
  await assert.rejects(
    c.reducers.publishCommunityRoomAppearance({
      roomId: id,
      source: JSON.stringify(room),
      baseRevision: original.revision + 1,
    }),
    /Appearance-only/,
  );
  assert.equal(
    c.db.communityRooms.id.find(id)!.revision,
    original.revision + 1,
  );
  console.log(
    "PASS server appearance publish: allowed floor finish, rejected stale revision and geometry without mutation",
  );
} finally {
  c.disconnect();
}
