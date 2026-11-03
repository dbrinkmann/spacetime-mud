import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { connect, until, host, database } from "./connect.ts";
import { builderRoom } from "./builder-fixture.ts";
const clients = await Promise.all([connect(), connect(), connect()]);
const [admin, member, outside] = clients.map((x) => x.c);
const guild = String(Date.now());
const op = (name: string, ...a: unknown[]) =>
  execFileSync(
    process.env.SPACETIME_CLI ?? "spacetimedb-cli",
    [
      "call",
      "--no-config",
      database,
      name,
      ...a.map((x) => JSON.stringify(x)),
      "--server",
      host,
    ],
    { stdio: "pipe", windowsHide: true },
  );
const pause = () => new Promise((r) => setTimeout(r, 800));
try {
  await Promise.all(
    clients.map(
      ({ c }) =>
        new Promise<void>((resolve, reject) =>
          c
            .subscriptionBuilder()
            .onApplied(() => resolve())
            .onError(reject)
            .subscribe(
              [
                "my_communities",
                "community_rooms",
                "community_exits",
                "community_properties",
                "community_objects",
                "community_object_scripts",
                "community_object_history",
                "my_community_speech",
              ].map((t) => `SELECT * FROM ${t}`),
            ),
        ),
    ),
  );
  op(
    "provision_community",
    guild,
    "Script tests",
    admin.identity!.toHexString(),
    "1",
  );
  op(
    "set_community_member",
    guild,
    member.identity!.toHexString(),
    "2",
    false,
    true,
  );
  await until(() => admin.db.myCommunities.id.find(guild));
  const roomId = admin.db.myCommunities.id.find(guild)!.welcomeRoom;
  await admin.reducers.enterCommunity({ communityId: guild, name: "Admin" });
  await member.reducers.enterCommunity({ communityId: guild, name: "Member" });
  const source =
    'function on_start(ctx){if(ctx.get("n")===null)ctx.set("n",0);} function on_greet(ctx){ctx.set("n",ctx.get("n")+1);ctx.tell("private greeting");ctx.say("public greeting");ctx.after(5,"tick");} function on_tick(ctx){ctx.say("timer fired");} function on_fail(ctx){ctx.set("n",999);ctx.say("never delivered");while(true){}}';
  const args = {
    roomId,
    name: "Receptionist",
    source,
    actions: [
      { id: "greet", label: "Say hello" },
      { id: "fail", label: "Fail test" },
    ],
  };
  await assert.rejects(member.reducers.createCommunityObject(args));
  await admin.reducers.createCommunityObject(args);
  await until(() => admin.db.communityObjectScripts.count() === 1n);
  const objectId = [...admin.db.communityObjectScripts.iter()][0].id;
  assert.equal(member.db.communityObjectScripts.count(), 0n);
  assert.equal(outside.db.communityObjects.count(), 0n);
  const test = JSON.parse(
    await admin.procedures.testCommunityObject({
      roomId,
      source,
      handler: "on_greet",
      state: '{"n":2}',
    }),
  );
  assert.equal(test.state, '{"n":3}');
  assert.equal(admin.db.myCommunitySpeech.count(), 0n);
  const scene = builderRoom();
  scene.npcs![0].objectId = String(objectId);
  await admin.reducers.publishCommunityRoom({
    roomId,
    source: JSON.stringify(scene),
    baseRevision: 0,
  });
  await assert.rejects(
    admin.reducers.deleteCommunityObject({ objectId, baseRevision: 1 }),
    /references/,
  );
  await assert.rejects(
    outside.reducers.interactCommunityObject({ objectId, action: "greet" }),
  );
  await member.reducers.interactCommunityObject({ objectId, action: "greet" });
  await until(() => member.db.myCommunitySpeech.count() === 2n);
  await until(() => admin.db.myCommunitySpeech.count() === 1n);
  await until(
    () =>
      [...member.db.myCommunitySpeech.iter()].some(
        (m) => m.message === "timer fired",
      ),
    "timer",
  );
  await assert.rejects(
    member.reducers.interactCommunityObject({ objectId, action: "fail" }),
  );
  assert.equal([...admin.db.communityObjectScripts.iter()][0].state, '{"n":1}');
  assert.ok(
    ![...member.db.myCommunitySpeech.iter()].some(
      (m) => m.message === "never delivered",
    ),
  );
  await pause();
  await member.reducers.speakCommunity({
    communityId: guild,
    message: "hello players",
    emote: false,
  });
  await until(() =>
    [...admin.db.myCommunitySpeech.iter()].some(
      (m) => m.message === "hello players",
    ),
  );
  await admin.reducers.addPropertyRoom({
    fromRoomId: roomId,
    name: "Side room",
    label: "Side",
    backLabel: "Back",
  });
  await until(() =>
    [...admin.db.communityExits.iter()].some((e) => e.fromRoom === roomId),
  );
  const exit = [...admin.db.communityExits.iter()].find(
    (e) => e.fromRoom === roomId,
  )!;
  await member.reducers.travelCommunity({ exitId: exit.id });
  await until(() => member.db.myCommunitySpeech.count() === 0n);
  await assert.rejects(
    member.reducers.interactCommunityObject({ objectId, action: "greet" }),
    /room/,
  );
  const invalid = builderRoom();
  invalid.npcs![0].objectId = String(objectId);
  await assert.rejects(
    admin.reducers.publishCommunityRoom({
      roomId: exit.toRoom,
      source: JSON.stringify(invalid),
      baseRevision: 0,
    }),
    /room/,
  );
  await admin.reducers.speakCommunity({
    communityId: guild,
    message: "not overheard",
    emote: false,
  });
  assert.equal(member.db.myCommunitySpeech.count(), 0n);
  const back = [...admin.db.communityExits.iter()].find(
    (e) => e.fromRoom === exit.toRoom,
  )!;
  await member.reducers.travelCommunity({ exitId: back.id });
  assert.equal(member.db.myCommunitySpeech.count(), 0n);
  await admin.reducers.publishCommunityObject({
    objectId,
    baseRevision: 1,
    name: "Receptionist",
    source:
      'function on_start(ctx){ctx.after(5,"tick");} function on_tick(ctx){ctx.say("cancelled timer");}',
    actions: [],
  });
  await assert.rejects(
    admin.reducers.publishCommunityObject({
      objectId,
      baseRevision: 1,
      name: "Old",
      source: "",
      actions: [],
    }),
  );
  await admin.reducers.publishCommunityObject({
    objectId,
    baseRevision: 2,
    name: "Receptionist",
    source: "",
    actions: [],
  });
  await new Promise((r) => setTimeout(r, 5500));
  assert.ok(
    ![...member.db.myCommunitySpeech.iter()].some(
      (m) => m.message === "cancelled timer",
    ),
  );
  const room = admin.db.communityRooms.id.find(roomId)!;
  delete scene.npcs![0].objectId;
  await admin.reducers.publishCommunityRoom({
    roomId,
    source: JSON.stringify(scene),
    baseRevision: room.revision,
  });
  await admin.reducers.deleteCommunityObject({ objectId, baseRevision: 3 });
  await until(() => admin.db.communityObjects.count() === 0n);
  assert.equal(admin.db.communityObjectHistory.count(), 0n);
  console.log(
    "Community script integration passed: authorization, private/public speech, state, dry-run, timers, rollback, revisions, references and deletion.",
  );
} finally {
  clients.forEach((x) => x.c.disconnect());
}
