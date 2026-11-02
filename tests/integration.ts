import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { connect, until, host, database } from "./connect.ts";
const all: Awaited<ReturnType<typeof connect>>[] = [];
async function client() {
  const x = await connect();
  all.push(x);
  return x;
}
const pause = (ms = 280) => new Promise((r) => setTimeout(r, ms));
const suffix = Date.now().toString(36);
try {
  const { c: a, token } = await client(),
    { c: b } = await client(),
    { c: bridge } = await client();
  await a.reducers.createPlayer({ name: `Builder ${suffix}` });
  await b.reducers.createPlayer({ name: `Guest ${suffix}` });
  assert.equal(
    [...a.db.visibleRooms.iter()].length,
    1,
    "Unvisited rooms withheld",
  );
  assert.equal(
    [...a.db.myVersions.iter()].length,
    0,
    "Showcase scripts are private",
  );
  const showcase = [...a.db.zone.iter()].find(
    (z) => z.name === "Bellkeeper’s Crossing",
  )!;
  await Promise.all([
    a.reducers.visitZone({ zoneId: showcase.id }),
    b.reducers.visitZone({ zoneId: showcase.id }),
  ]);
  await until(() =>
    [...a.db.visibleObjects.iter()].some(
      (o) => o.name === "Worn Pressure Plate",
    ),
  );
  const plate = [...a.db.visibleObjects.iter()].find(
      (o) => o.name === "Worn Pressure Plate",
    )!,
    gate = [...a.db.visibleObjects.iter()].find(
      (o) => o.name === "The Iron Gate",
    )!;
  await assert.rejects(a.reducers.go({ direction: "north" }), /closed/i);
  await assert.rejects(
    a.reducers.buildRoom({
      direction: "south",
      name: "Forbidden",
      description: "No.",
    }),
    /owner|collaborator/i,
  );
  await a.reducers.interact({
    objectId: plate.id,
    action: "press",
    requestId: randomUUID(),
  });
  await until(
    () => [...b.db.visibleGates.iter()].some((g) => g.id === gate.id && g.open),
    "shared gate",
  );
  await Promise.all([
    a.reducers.go({ direction: "north" }),
    b.reducers.go({ direction: "north" }),
  ]);
  const chest = [...a.db.visibleObjects.iter()].find(
    (o) => o.name === "Traveler’s Chest",
  )!;
  assert(chest);
  await pause();
  const requestId = randomUUID();
  await Promise.all([
    a.reducers.interact({ objectId: chest.id, action: "open", requestId }),
    b.reducers.interact({
      objectId: chest.id,
      action: "open",
      requestId: randomUUID(),
    }),
  ]);
  await a.reducers.interact({ objectId: chest.id, action: "open", requestId });
  assert.equal([...a.db.myInventory.iter()][0]?.quantity, 1);
  assert.equal([...b.db.myInventory.iter()][0]?.quantity, 1);
  await pause();
  await a.reducers.interact({
    objectId: chest.id,
    action: "open",
    requestId: randomUUID(),
  });
  assert.equal(
    [...a.db.myInventory.iter()][0].quantity,
    1,
    "Personal reward cannot repeat",
  );
  await a.reducers.home({});
  await a.reducers.visitZone({ zoneId: showcase.id });
  await a.reducers.go({ direction: "east" });
  const bell = [...a.db.visibleObjects.iter()].find(
    (o) => o.name === "Bronze Bell",
  )!;
  await pause();
  await a.reducers.interact({
    objectId: bell.id,
    action: "ring",
    requestId: randomUUID(),
  });
  await until(
    () =>
      [...a.db.visibleObjects.iter()].some((o) => o.name === "The Bellkeeper"),
    "creature arrival",
  );
  await until(
    () =>
      ![...a.db.visibleObjects.iter()].some((o) => o.name === "The Bellkeeper"),
    "timer returns creature",
    15000,
  );
  await until(
    () => ![...b.db.visibleGates.iter()].find((g) => g.id === gate.id)?.open,
    "persistent gate timer",
    15000,
  );
  console.log(
    "PASS showcase: multiplayer gate, per-player chest, duplicate request, creature and durable timers",
  );
  await a.reducers.createZone({
    name: `Test Realm ${suffix}`,
    description: "A realm for integration checks.",
  });
  const p = a.db.visiblePlayers.identity.find(a.identity!)!,
    room = a.db.visibleRooms.id.find(p.roomId)!,
    zoneId = room.zoneId;
  await a.reducers.buildRoom({
    direction: "north",
    name: "Hidden study",
    description: "A secret notebook.",
  });
  await b.reducers.home({});
  await b.reducers.visitZone({ zoneId });
  assert(
    ![...b.db.visibleRooms.iter()].some((r) => r.name === "Hidden study"),
    "Unvisited description private",
  );
  const base = {
    roomId: room.id,
    objectId: 0n,
    kind: "container",
    name: "Test chest",
    description: "A private test.",
    actions: [{ id: "use", label: "Use" }],
    source:
      'function on_use(ctx){ if(!ctx.personal("reward")){ctx.give("Test gem",1);ctx.remember("reward",true);}ctx.schedule("quiet",2);ctx.say("started");} function on_quiet(ctx){ctx.say("timer complete");}',
  };
  await a.reducers.saveDraft(base);
  let v = [...a.db.myVersions.iter()].sort((x, y) => Number(y.id - x.id))[0];
  const objectId = v.objectId;
  assert(
    ![...b.db.visibleObjects.iter()].some((o) => o.id === objectId),
    "Draft invisible to visitor",
  );
  await assert.rejects(a.reducers.publishVersion({ versionId: v.id }), /Test/);
  await a.reducers.testDraft({ versionId: v.id, event: "on_use" });
  v = a.db.myVersions.id.find(v.id)!;
  assert(v.tested, v.report);
  assert(
    ![...a.db.myInventory.iter()].some((i) => i.name === "Test gem"),
    "Preview cannot award inventory",
  );
  await a.reducers.publishVersion({ versionId: v.id });
  await until(() => b.db.visibleObjects.id.find(objectId));
  await b.reducers.interact({
    objectId,
    action: "use",
    requestId: randomUUID(),
  });
  assert([...b.db.myInventory.iter()].some((i) => i.name === "Test gem"));
  const original = v;
  await a.reducers.saveDraft({
    ...base,
    objectId,
    source:
      'function on_use(ctx){ ctx.give("Bad reward",1);ctx.say("should rollback");while(true){} }',
  });
  v = [...a.db.myVersions.iter()].sort((x, y) => Number(y.id - x.id))[0];
  await a.reducers.testDraft({ versionId: v.id, event: "on_use" });
  assert.equal(a.db.myVersions.id.find(v.id)?.tested, false);
  await assert.rejects(a.reducers.publishVersion({ versionId: v.id }));
  await a.reducers.testDraft({ versionId: v.id, event: "on_missing" });
  assert.equal(a.db.myVersions.id.find(v.id)?.tested, false);
  await a.reducers.saveDraft({
    ...base,
    objectId,
    source:
      'function on_use(ctx){if(ctx.personal("armed")){ctx.give("Bad reward",1);ctx.say("should rollback");while(true){}}ctx.remember("armed",true);}',
  });
  v = [...a.db.myVersions.iter()].sort((x, y) => Number(y.id - x.id))[0];
  await a.reducers.testDraft({ versionId: v.id, event: "on_use" });
  await a.reducers.publishVersion({ versionId: v.id });
  await pause();
  await b.reducers.interact({
    objectId,
    action: "use",
    requestId: randomUUID(),
  });
  await pause();
  await assert.rejects(
    b.reducers.interact({ objectId, action: "use", requestId: randomUUID() }),
    /budget/,
  );
  assert(![...b.db.myInventory.iter()].some((i) => i.name === "Bad reward"));
  assert(
    ![...b.db.visibleChat.iter()].some((c) => c.text === "should rollback"),
  );
  await a.reducers.publishVersion({ versionId: original.id });
  assert(
    [...b.db.myInventory.iter()].some((i) => i.name === "Test gem"),
    "Rollback preserves inventory",
  );
  await a.reducers.setCollaborator({
    zoneId,
    name: `Guest ${suffix}`,
    allowed: true,
  });
  await until(() => b.db.myVersions.id.find(original.id));
  await a.reducers.setCollaborator({
    zoneId,
    name: `Guest ${suffix}`,
    allowed: false,
  });
  await until(() => !b.db.myVersions.id.find(original.id));
  await assert.rejects(
    b.reducers.publishVersion({ versionId: original.id }),
    /owner|collaborator/,
  );
  await pause();
  await b.reducers.interact({
    objectId,
    action: "use",
    requestId: randomUUID(),
  });
  a.disconnect();
  await until(
    () => [...b.db.visibleChat.iter()].some((c) => c.text === "timer complete"),
    "timer works with builder offline",
    6000,
  );
  const resumed = await connect(token);
  all.push(resumed);
  const c = resumed.c;
  assert.equal(
    c.db.visiblePlayers.identity.find(c.identity!)?.roomId,
    room.id,
    "Identity and room persist",
  );
  await c.reducers.consent({ bridge: bridge.identity! });
  await c.reducers.requestAgent({ prompt: "Create a singing stone" });
  await until(() =>
    [...bridge.db.agentJobs.iter()].some((j) => j.status === "pending"),
  );
  const j = [...bridge.db.agentJobs.iter()].find(
    (j) => j.status === "pending",
  )!;
  await assert.rejects(b.reducers.claimJob({ id: j.id }));
  await bridge.reducers.claimJob({ id: j.id });
  await bridge.reducers.completeJob({
    id: j.id,
    kind: "object",
    direction: "",
    name: "Agent stone",
    description: "A stone.",
    biography: "",
    message: "Drafted.",
    objectId: "",
    objectKind: "scenery",
    source: 'function on_touch(ctx){ctx.say("hello");}',
    actions: [{ id: "touch", label: "Touch" }],
  });
  await until(
    () => [...c.db.myVersions.iter()].some((v) => v.name === "Agent stone"),
    "Bridge can author draft",
  );
  assert(
    ![...b.db.visibleObjects.iter()].some((o) => o.name === "Agent stone"),
    "Agent draft not auto-published",
  );
  await c.reducers.revokeConsent({});
  await until(
    () => ![...bridge.db.myVersions.iter()].length,
    "revoked bridge loses source",
  );
  await c.reducers.deleteObject({ objectId });
  await until(() => !b.db.visibleObjects.id.find(objectId));
  console.log(
    "PASS drafts, preview isolation, rollback, budgets, inventory, permissions, privacy, bridge draft and consent, disconnect/reconnect",
  );
  console.log(`VERIFIED ${host}/${database}`);
} finally {
  for (const x of all) x.c.disconnect();
}
