import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { connect, until, host, database } from "./connect.ts";
const { c } = await connect();
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
  console.log(
    "PASS operator prune: denies players, protects Nexus, preserves draft/published 3D work, removes empty legacy zone and relocates player.",
  );
} finally {
  c.disconnect();
}
