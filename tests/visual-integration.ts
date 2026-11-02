import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { connect, until } from "./connect.ts";
const clients: Awaited<ReturnType<typeof connect>>[] = [];
const client = async () => {
  const x = await connect();
  clients.push(x);
  return x;
};
const delay = () => new Promise((r) => setTimeout(r, 140));
try {
  const { c: a, token } = await client(),
    { c: b } = await client(),
    { c: bridge } = await client();
  const suffix = Date.now().toString(36);
  await a.reducers.createPlayer({ name: `Visual ${suffix}` });
  await b.reducers.createPlayer({ name: `Visitor ${suffix}` });
  await a.reducers.createZone({
    name: `Visual zone ${suffix}`,
    description: "A shared box-built room.",
  });
  const p = [...a.db.visiblePlayers.iter()].find((p) =>
    p.identity.equals(a.identity!),
  )!;
  const roomId = p.roomId,
    zone = [...a.db.zone.iter()].find((z) => z.entrance === roomId)!;
  const source = readFileSync("public/poc/examples/room.json", "utf8"),
    avatar = readFileSync("public/poc/examples/wizard.json", "utf8");
  await assert.rejects(
    b.reducers.saveVisualDraft({ roomId, kind: "scene", source }),
    /owner|collaborator/i,
  );
  await assert.rejects(
    a.reducers.saveVisualDraft({ roomId, kind: "scene", source: "{}" }),
  );
  await a.reducers.saveVisualDraft({ roomId, kind: "scene", source });
  let draft = [...a.db.myVisualDrafts.iter()][0];
  assert(draft);
  assert.equal([...b.db.myVisualDrafts.iter()].length, 0);
  await assert.rejects(
    b.reducers.publishVisual({ key: draft.key, revision: draft.revision }),
    /not your/i,
  );
  await a.reducers.publishVisual({ key: draft.key, revision: draft.revision });
  await b.reducers.visitZone({ zoneId: zone.id });
  await until(() => b.db.visibleScenes.roomId.find(roomId));
  assert.equal(
    JSON.parse(b.db.visibleScenes.roomId.find(roomId)!.source).name,
    "The Lantern & Thorn",
  );
  await a.reducers.saveVisualDraft({ roomId, kind: "avatar", source: avatar });
  draft = [...a.db.myVisualDrafts.iter()].find((d) => d.kind === "avatar")!;
  await a.reducers.publishVisual({ key: draft.key, revision: draft.revision });
  await until(() => b.db.visibleAvatars.identity.find(a.identity!));
  await a.reducers.moveWithinRoom({ x: 2.7, z: 3, seat: "", pose: "idle" });
  await until(() => b.db.visiblePresence.identity.find(a.identity!));
  assert.equal(
    JSON.parse(b.db.visiblePresence.identity.find(a.identity!)!.path).at(-1)[0],
    2.7,
  );
  await delay();
  await assert.rejects(
    a.reducers.moveWithinRoom({ x: 100, z: 0, seat: "", pose: "idle" }),
    /blocked|unreachable/i,
  );
  await a.reducers.moveWithinRoom({
    x: 0,
    z: 0,
    seat: "reading-chair",
    pose: "idle",
  });
  await assert.rejects(
    b.reducers.moveWithinRoom({
      x: 0,
      z: 0,
      seat: "reading-chair",
      pose: "idle",
    }),
    /occupied/i,
  );
  await a.reducers.home({});
  await until(() => !b.db.visiblePresence.identity.find(a.identity!));
  await b.reducers.moveWithinRoom({
    x: 0,
    z: 0,
    seat: "reading-chair",
    pose: "idle",
  });
  await a.reducers.visitZone({ zoneId: zone.id });
  await a.reducers.setCollaborator({
    zoneId: zone.id,
    name: `Visitor ${suffix}`,
    allowed: true,
  });
  await a.reducers.saveVisualDraft({ roomId, kind: "scene", source });
  const da = [...a.db.myVisualDrafts.iter()].find((d) => d.kind === "scene")!;
  await b.reducers.saveVisualDraft({ roomId, kind: "scene", source });
  const db = [...b.db.myVisualDrafts.iter()].find((d) => d.kind === "scene")!;
  await a.reducers.publishVisual({ key: da.key, revision: da.revision });
  await assert.rejects(
    b.reducers.publishVisual({ key: db.key, revision: db.revision }),
    /changed/i,
  );
  await until(() => [...b.db.visiblePresence.iter()].length === 0);
  await a.reducers.consent({ bridge: bridge.identity! });
  await a.reducers.requestAgent({ prompt: "Create a visual room draft" });
  await until(() =>
    [...bridge.db.agentJobs.iter()].some((j) => j.status === "pending"),
  );
  const job = [...bridge.db.agentJobs.iter()].find(
    (j) => j.status === "pending",
  )!;
  await bridge.reducers.claimJob({ id: job.id });
  await bridge.reducers.completeJob({
    id: job.id,
    kind: "scene",
    source,
    name: "Visual room",
    description: "Room geometry",
    message: "Draft ready",
    direction: "",
    biography: "",
    objectId: "",
    objectKind: "",
    actions: [],
  });
  await until(() =>
    [...a.db.myVisualDrafts.iter()].some((d) => d.kind === "scene"),
  );
  const before = a.identity!;
  a.disconnect();
  const reconnect = await connect(token);
  clients.push(reconnect);
  assert(reconnect.c.db.visibleAvatars.identity.find(before));
  console.log(
    "PASS shared scenes, private drafts, permissions, avatar persistence, server paths, seat contention/release, edit conflicts, publish reset, agent visual proposal.",
  );
} finally {
  clients.forEach((x) => x.c.disconnect());
}
