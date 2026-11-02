import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { DbConnection } from "../client/module_bindings/index.ts";
const database = process.env.SPACETIME_DATABASE,
  host = process.env.SPACETIME_HOST ?? "https://maincloud.spacetimedb.com";
if (!database) throw Error("Set SPACETIME_DATABASE explicitly.");
mkdirSync(".bridge", { recursive: true });
const file = `.bridge/visual-demo-${database.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
const token = existsSync(file)
  ? JSON.parse(readFileSync(file, "utf8")).token
  : undefined;
const c = await new Promise<DbConnection>((resolve, reject) => {
  DbConnection.builder()
    .withUri(host)
    .withDatabaseName(database)
    .withToken(token)
    .onConnect((c, _id, t) => {
      writeFileSync(file, JSON.stringify({ token: t }), { mode: 0o600 });
      c.subscriptionBuilder()
        .onApplied(() => resolve(c))
        .onError((e) => reject(e.event))
        .subscribe(
          [
            "zone",
            "visible_players",
            "visible_rooms",
            "visible_objects",
            "my_versions",
            "my_visual_drafts",
            "visible_scenes",
          ].map((n) => `SELECT * FROM ${n}`),
        );
    })
    .onConnectError((_c, e) => reject(e))
    .build();
});
try {
  if (!c.db.visiblePlayers.identity.find(c.identity!))
    await c.reducers.createPlayer({ name: "Lantern Worldsmith" });
  let zone = [...c.db.zone.iter()].find(
    (z) => z.owner.equals(c.identity!) && z.name === "The Lantern & Thorn",
  );
  if (!zone) {
    await c.reducers.createZone({
      name: "The Lantern & Thorn",
      description:
        "A warm gathering place. Pull up a chair, say hello, and imagine what you could build here.",
    });
    zone = [...c.db.zone.iter()].find(
      (z) => z.owner.equals(c.identity!) && z.name === "The Lantern & Thorn",
    )!;
  } else {
    await c.reducers.home({});
    await c.reducers.visitZone({ zoneId: zone.id });
  }
  const roomId = zone.entrance;
  const old = [...c.db.visibleObjects.iter()].find(
    (o) => o.roomId === roomId && o.name === "The Hearth",
  );
  await c.reducers.saveDraft({
    roomId,
    objectId: old?.id ?? 0n,
    kind: "scenery",
    name: "The Hearth",
    description: "A cheerful fire in a box-built hearth.",
    actions: [{ id: "warm", label: "Warm your hands" }],
    source:
      'function on_warm(ctx){ctx.say(ctx.playerName()+" warms their hands beside the hearth.");}',
  });
  const version = [...c.db.myVersions.iter()]
    .filter((v) => v.name === "The Hearth")
    .sort((a, b) => Number(b.id - a.id))[0];
  await c.reducers.testDraft({ versionId: version.id, event: "on_warm" });
  await c.reducers.publishVersion({ versionId: version.id });
  const scene = JSON.parse(
    readFileSync("public/poc/examples/room.json", "utf8"),
  );
  scene.objects.find(
    (o: { model: string }) => o.model === "fireplace",
  ).objectId = String(version.objectId);
  await c.reducers.saveVisualDraft({
    roomId,
    kind: "scene",
    source: JSON.stringify(scene),
  });
  const draft = [...c.db.myVisualDrafts.iter()].find(
    (d) => d.roomId === roomId && d.kind === "scene",
  )!;
  await c.reducers.publishVisual({ key: draft.key, revision: draft.revision });
  console.log(
    `Published authored demo: The Lantern & Thorn (zone ${zone.id}, room ${roomId}) on ${host}/${database}. Owner token remains in ignored .bridge storage.`,
  );
} finally {
  c.disconnect();
}
