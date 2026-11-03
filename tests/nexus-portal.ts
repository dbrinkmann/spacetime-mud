import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { connect, until, host, database } from "./connect.ts";
const cli = (...args: string[]) =>
  execFileSync(process.env.SPACETIME_CLI ?? "spacetimedb-cli", args, {
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true,
  });
const call = (name: string, ...args: string[]) =>
  cli("call", "--no-config", database, name, ...args, "--server", host);
const sql = (q: string) =>
  cli("sql", "--no-config", database, q, "--server", host);
const { c } = await connect();
try {
  const name = `Portal ${Date.now().toString(36)}`;
  try {
    call("create_player", JSON.stringify("World architect"));
  } catch (e) {
    if (!String(e).includes("already")) throw e;
  }
  call("home");
  await c.reducers.createPlayer({ name });
  await c.reducers.createZone({ name, description: "Portal target." });
  const target = c.db.visiblePlayers.identity.find(c.identity!)!.roomId;
  const zone = [...c.db.zone.iter()].find((z) => z.entrance === target)!;
  const actions = JSON.stringify([
    { id: "travel", label: "Enter test portal" },
  ]);
  call(
    "save_draft",
    "1",
    "0",
    JSON.stringify("scenery"),
    JSON.stringify(name),
    JSON.stringify("Portal test"),
    actions,
    JSON.stringify(`function on_travel(ctx){ctx.movePlayer("${target}");}`),
  );
  const v = sql(`SELECT id FROM version WHERE name = '${name}'`).match(
    /^\s*(\d+)\s*$/m,
  )![1];
  call("test_draft", v, JSON.stringify("on_travel"));
  call("publish_version", v);
  await c.reducers.home({});
  await until(() =>
    [...c.db.visibleObjects.iter()].some((o) => o.name === name),
  );
  const portal = [...c.db.visibleObjects.iter()].find((o) => o.name === name)!;
  await c.reducers.interact({
    objectId: portal.id,
    action: "travel",
    requestId: name,
  });
  assert.equal(c.db.visiblePlayers.identity.find(c.identity!)!.roomId, target);
  await assert.rejects(
    c.reducers.interact({
      objectId: portal.id,
      action: "travel",
      requestId: name + "-again",
    }),
    /not available/,
  );
  await c.reducers.createZone({
    name: name + " other",
    description: "Unrelated destination.",
  });
  const otherRoom = c.db.visiblePlayers.identity.find(c.identity!)!.roomId;
  const otherZone = [...c.db.zone.iter()].find(
    (z) => z.entrance === otherRoom,
  )!;
  await c.reducers.home({});
  await c.reducers.visitZone({ zoneId: zone.id });
  // Ordinary authored rooms still cannot teleport to another player's zone.
  await c.reducers.saveDraft({
    roomId: target,
    objectId: 0n,
    kind: "scenery",
    name: "Disallowed portal",
    description: "Boundary check",
    actions: [{ id: "travel", label: "Travel" }],
    source: `function on_travel(ctx){ctx.movePlayer("${otherRoom}");}`,
  });
  const bad = [...c.db.myVersions.iter()].find(
    (v) => v.name === "Disallowed portal",
  )!;
  await c.reducers.testDraft({ versionId: bad.id, event: "on_travel" });
  assert.equal(c.db.myVersions.id.find(bad.id)?.tested, false);
  await c.reducers.saveDraft({
    roomId: target,
    objectId: 0n,
    kind: "scenery",
    name: "Return portal",
    description: "Return to the hub.",
    actions: [{ id: "return", label: "Enter the Nexus" }],
    source: 'function on_return(ctx){ctx.movePlayer("1");}',
  });
  const back = [...c.db.myVersions.iter()].find(
    (v) => v.name === "Return portal",
  )!;
  await c.reducers.testDraft({ versionId: back.id, event: "on_return" });
  assert.equal(c.db.myVersions.id.find(back.id)?.tested, true);
  await c.reducers.publishVersion({ versionId: back.id });
  await new Promise((r) => setTimeout(r, 300));
  await c.reducers.interact({
    objectId: back.objectId,
    action: "return",
    requestId: name + "-return",
  });
  assert.equal(c.db.visiblePlayers.identity.find(c.identity!)!.roomId, 1n);
  call("delete_object", String(portal.id));
  await c.reducers.deleteZone({ zoneId: zone.id });
  await c.reducers.deleteZone({ zoneId: otherZone.id });
  console.log(
    "PASS Nexus portal reaches zone entrance, cannot be used remotely, ordinary scripts retain zone boundary.",
  );
} finally {
  c.disconnect();
}
