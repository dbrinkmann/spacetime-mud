import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { connect, host, database, until } from "./connect.ts";
import { emptyRoom } from "../shared/world.ts";
const { c } = await connect();
try {
  const guild = String(Date.now());
  await new Promise<void>((resolve, reject) =>
    c
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .onError(reject)
      .subscribe(
        [
          "my_communities",
          "community_rooms",
          "community_object_scripts",
          "community_object_motion",
        ].map((t) => `SELECT * FROM ${t}`),
      ),
  );
  execFileSync(
    process.env.SPACETIME_CLI ?? "spacetimedb-cli",
    [
      "call",
      "--no-config",
      database,
      "provision_community",
      JSON.stringify(guild),
      '"Intelligence fixture"',
      JSON.stringify(c.identity!.toHexString()),
      '"1"',
      "--server",
      host,
    ],
    { stdio: "pipe", windowsHide: true },
  );
  await until(() => c.db.myCommunities.id.find(guild));
  const roomId = c.db.myCommunities.id.find(guild)!.welcomeRoom;
  await c.reducers.enterCommunity({ communityId: guild, name: "Tester" });

  async function create(
    name: string,
    source: string,
    actions: Array<{ id: string; label: string }> = [],
  ) {
    await c.reducers.createCommunityObject({ roomId, name, source, actions });
    await until(() =>
      [...c.db.communityObjectScripts.iter()].some((o) => o.name === name),
    );
    return [...c.db.communityObjectScripts.iter()].find(
      (o) => o.name === name,
    )!;
  }
  const source = `function on_start(ctx){ctx.subscribe("near",{frame:"self",box:{center:[0,0,0],size:[4,4],height:2},include:["tag:fixture"]});ctx.motion.resume();ctx.set("initialized",true);} function on_view_enter(ctx){ctx.set("entryAfterInit",ctx.get("initialized"));ctx.motion.pause();}`;
  const a = await create("Platform A", source),
    b = await create("Platform B", source);
  // Objects exist before their geometry, deliberately exercising deferred binding.
  await new Promise((r) => setTimeout(r, 1200));
  const scene = emptyRoom();
  scene.models.cube = {
    boxes: [{ position: [0, 0.5, 0], size: [0.5, 1, 0.5], color: "#8899aa" }],
  };
  scene.objects = [a, b].map((o, i) => ({
    id: "platform" + i,
    name: o.name,
    model: "cube",
    objectId: String(o.id),
    tags: ["fixture"],
    position: [i, 0, 0] as [number, number, number],
    yaw: 0,
    motion: {
      points: [
        [0, 0, 0],
        [0, 0, 5],
      ] as [number, number, number][],
      speed: 3 + i,
      mode: "once" as const,
    },
  }));
  await c.reducers.publishCommunityRoom({
    roomId,
    source: JSON.stringify(scene),
    baseRevision: 0,
  });
  await until(() =>
    [a, b].every((o) => {
      const r = c.db.communityObjectMotion.objectId.find(o.id);
      return r && JSON.parse(r.state).paused;
    }),
  );
  for (const [i, o] of [a, b].entries()) {
    const state = JSON.parse(
      c.db.communityObjectMotion.objectId.find(o.id)!.state,
    );
    assert.equal(state.speed, 3 + i);
    assert.equal(state.completed, false);
    assert.ok(state.distance < 0.1);
    assert.equal(
      JSON.parse(c.db.communityObjectScripts.id.find(o.id)!.state)
        .entryAfterInit,
      true,
    );
  }
  const states = [a, b].map(
    (o) => c.db.communityObjectMotion.objectId.find(o.id)!.state,
  );
  scene.floorColor = "#555555";
  await c.reducers.publishCommunityRoomAppearance({
    roomId,
    source: JSON.stringify(scene),
    baseRevision: 1,
  });
  assert.deepEqual(
    [a, b].map((o) => c.db.communityObjectMotion.objectId.find(o.id)!.state),
    states,
  );
  const reservationSource = `function on_start(ctx){ctx.setVisible(false);ctx.set("claimed",ctx.reserve("workspace",{center:[5,1,5],size:[2,2,2]},2));} function on_claim(ctx){ctx.set("claimed",ctx.reserve("workspace",{center:[5,1,5],size:[2,2,2]},2));} function on_release(ctx){ctx.release("workspace");} function on_fail(ctx){ctx.reserve("workspace",{center:[5,1,5],size:[2,2,2]},2);throw "fail";} function on_tick(ctx){ctx.set("ticked",true);} function on_short(ctx){ctx.after(.25,"tick");}`;
  const actions = ["claim", "release", "fail", "short"].map((id) => ({
    id,
    label: id,
  }));
  const x = await create("Workspace X", reservationSource, actions),
    y = await create("Workspace Y", reservationSource, actions);
  for (const [i, o] of [x, y].entries())
    scene.objects.push({
      id: "workspace" + i,
      name: o.name,
      model: "cube",
      objectId: String(o.id),
      tags: [],
      position: [5 + i, 0, 5],
      yaw: 0,
    } as any);
  await c.reducers.publishCommunityRoom({
    roomId,
    source: JSON.stringify(scene),
    baseRevision: 2,
  });
  async function act(o: typeof x, action: string) {
    await new Promise((r) => setTimeout(r, 800));
    await c.reducers.interactCommunityObject({ objectId: o.id, action });
  }
  const get = (o: typeof x) =>
    JSON.parse(c.db.communityObjectScripts.id.find(o.id)!.state);
  assert.equal([get(x).claimed, get(y).claimed].filter(Boolean).length, 1);
  await act(get(x).claimed ? x : y, "release");
  await act(x, "claim");
  assert.equal(get(x).claimed, true);
  await act(y, "claim");
  assert.equal(get(y).claimed, false);
  await act(x, "release");
  await act(y, "claim");
  assert.equal(get(y).claimed, true);
  await new Promise((r) => setTimeout(r, 2100));
  await act(x, "claim");
  assert.equal(get(x).claimed, true);
  await act(x, "release");
  await assert.rejects(act(x, "fail"));
  await act(y, "claim");
  assert.equal(get(y).claimed, true);
  await act(x, "short");
  await until(() => get(x).ticked === true, "subsecond timer");
  await assert.rejects(
    c.procedures.testCommunityObject({
      roomId,
      source: "",
      handler: "bad",
      state: "{}",
    }),
    /on_NAME/,
  );
  const ticker = await create(
    "Timer budget fixture",
    'function on_start(ctx){ctx.after(.25,"a");ctx.after(.25,"b");ctx.after(.25,"c");ctx.after(.25,"d");} function on_a(ctx){ctx.after(.25,"a");} function on_b(ctx){ctx.after(.25,"b");} function on_c(ctx){ctx.after(.25,"c");} function on_d(ctx){ctx.after(.25,"d");}',
  );
  await until(
    () =>
      c.db.communityObjectScripts.id
        .find(ticker.id)!
        .lastError.includes("Timer budget"),
    "bounded short timers",
  );
  console.log(
    "PASS general object lifecycle, initialization ordering, appearance preservation, atomic reservations, expiry/release/rollback, subsecond timer and handler validation",
  );
} finally {
  c.disconnect();
}
