import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { connect, host, database, until } from "./connect.ts";
import { emptyRoom } from "../shared/world.ts";
import { propTrajectory } from "../shared/intelligent-objects.ts";
const { c, token } = await connect();
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
  const source =
    'function on_start(ctx){ctx.subscribe("ahead",{frame:"self",box:{center:[0,0,2],size:[1,2]},include:["tag:obstacle"]});} function on_view_enter(ctx,name,entity){ctx.set("entered",entity.id);ctx.motion.pause();} function on_view_exit(ctx,name){if(ctx.view(name).length===0){ctx.set("exited",true);ctx.motion.resume();}} function on_motion_end(ctx){ctx.set("finished",true);ctx.setVisible(false);}';
  await c.reducers.createCommunityObject({
    roomId,
    name: "Mover",
    source,
    actions: [],
  });
  await c.reducers.createCommunityObject({
    roomId,
    name: "Obstacle",
    source: "function on_clear(ctx){ctx.setVisible(false);}",
    actions: [{ id: "clear", label: "Clear" }],
  });
  await until(() => c.db.communityObjectScripts.count() === 2n);
  const mover = [...c.db.communityObjectScripts.iter()].find(
      (o) => o.name === "Mover",
    )!,
    obstacle = [...c.db.communityObjectScripts.iter()].find(
      (o) => o.name === "Obstacle",
    )!;
  const scene = emptyRoom();
  scene.models.cube = {
    boxes: [{ position: [0, 0.5, 0], size: [0.5, 1, 0.5], color: "#8899aa" }],
  };
  scene.objects = [
    {
      id: "mover",
      name: "Mover",
      model: "cube",
      position: [0, 0, 0],
      yaw: 0,
      objectId: String(mover.id),
      motion: {
        points: [
          [-5, 0, 0],
          [5, 0, 0],
        ],
        speed: 2,
        mode: "once",
      },
    },
    {
      id: "obstacle",
      name: "Obstacle",
      model: "cube",
      position: [0, 0, 0],
      yaw: 0,
      objectId: String(obstacle.id),
      tags: ["obstacle"],
    },
  ];
  await c.reducers.publishCommunityRoom({
    roomId,
    source: JSON.stringify(scene),
    baseRevision: 0,
  });
  await until(
    () => {
      const r = c.db.communityObjectMotion.objectId.find(mover.id);
      return r && JSON.parse(r.state).paused;
    },
    "motion paused",
    10000,
  );
  let state = JSON.parse(
    c.db.communityObjectMotion.objectId.find(mover.id)!.state,
  );
  assert.ok(
    Math.abs(
      propTrajectory(scene.objects[0], state, Date.now() / 1000).position[0] +
        3,
    ) < 0.02,
  );
  const late = await connect(token);
  try {
    await new Promise<void>((resolve, reject) =>
      late.c
        .subscriptionBuilder()
        .onApplied(() => resolve())
        .onError(reject)
        .subscribe("SELECT * FROM community_object_motion"),
    );
    assert.deepEqual(
      JSON.parse(
        late.c.db.communityObjectMotion.objectId.find(mover.id)!.state,
      ),
      state,
    );
  } finally {
    late.c.disconnect();
  }
  if (process.env.SKIP_BROWSER !== "1") {
    const browser = await chromium.launch({
      args: ["--enable-unsafe-swiftshader"],
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1000, height: 700 },
      });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(
        ({ host, database, token }) =>
          localStorage.setItem(`community-world:${host}:${database}`, token),
        { host, database, token },
      );
      await page.goto(
        (process.env.GAME_URL ?? "http://127.0.0.1:5179") + "/?community",
      );
      await page.waitForFunction(() => !!window.boxWorld);
      await page.waitForFunction(() => {
        const p = (
          window.boxWorld!.inspect() as {
            props: Array<{ id: string; position: number[] }>;
          }
        ).props.find((p) => p.id === "mover");
        return p && Math.abs(p.position[0] + 3) < 0.02;
      });
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  }
  await c.reducers.enterCommunity({ communityId: guild, name: "Tester" });
  await c.reducers.interactCommunityObject({
    objectId: obstacle.id,
    action: "clear",
  });
  await until(
    () =>
      JSON.parse(c.db.communityObjectScripts.id.find(mover.id)!.state).finished,
    "motion condition",
    10000,
  );
  state = JSON.parse(c.db.communityObjectMotion.objectId.find(mover.id)!.state);
  assert.equal(state.visible, false);
  assert.equal(state.completed, true);
  assert.equal(c.db.communityObjectScripts.id.find(mover.id)!.lastError, "");

  await c.reducers.createCommunityObject({
    roomId,
    name: "Sensor",
    source:
      'function on_start(ctx){ctx.subscribe("zone",{frame:"room",box:{center:[0,0,0],size:[2,2]},include:["player"]});} function on_view_enter(ctx,name,entity){ctx.set("entries",(ctx.get("entries")||0)+1);ctx.set("actor",ctx.actorName());} function on_view_exit(ctx,name,entity){ctx.set("exits",(ctx.get("exits")||0)+1);}',
    actions: [],
  });
  await until(() =>
    [...c.db.communityObjectScripts.iter()].some((o) => o.name === "Sensor"),
  );
  const sensor = [...c.db.communityObjectScripts.iter()].find(
    (o) => o.name === "Sensor",
  )!;
  scene.objects.push({
    id: "sensor",
    name: "Sensor",
    model: "cube",
    position: [3, 0, 0],
    yaw: 0,
    objectId: String(sensor.id),
  });
  await c.reducers.publishCommunityRoom({
    roomId,
    source: JSON.stringify(scene),
    baseRevision: 1,
  });
  await c.reducers.moveCommunityCharacter({
    communityId: guild,
    x: 0,
    z: -3,
    seat: "",
    pose: "idle",
  });
  await until(
    () =>
      JSON.parse(c.db.communityObjectScripts.id.find(sensor.id)!.state)
        .entries === 1,
    "player enters",
  );
  await until(
    () =>
      JSON.parse(c.db.communityObjectScripts.id.find(sensor.id)!.state)
        .exits === 1,
    "player exits",
  );
  assert.equal(
    JSON.parse(c.db.communityObjectScripts.id.find(sensor.id)!.state).actor,
    "Tester",
  );
  const current = c.db.communityObjectScripts.id.find(mover.id)!;
  await c.reducers.publishCommunityObject({
    objectId: mover.id,
    name: "Mover",
    source:
      source +
      ' function on_reset(ctx){ctx.motion.setSpeed(4);ctx.motion.restart();ctx.setVisible(true);ctx.set("finished",false);ctx.set("delay",ctx.randomInt(5,14));} function on_fail(ctx){ctx.motion.restart();ctx.setVisible(true);throw "deliberate failure";}',
    actions: [
      { id: "reset", label: "Reset" },
      { id: "fail", label: "Fail" },
    ],
    baseRevision: current.revision,
  });
  await c.reducers.interactCommunityObject({
    objectId: mover.id,
    action: "reset",
  });
  await until(() => {
    const r = JSON.parse(
      c.db.communityObjectMotion.objectId.find(mover.id)!.state,
    );
    return r.speed === 4 && !r.completed;
  }, "restart");
  await until(
    () =>
      JSON.parse(c.db.communityObjectMotion.objectId.find(mover.id)!.state)
        .completed,
    "second completion",
  );
  const result = JSON.parse(
    c.db.communityObjectScripts.id.find(mover.id)!.state,
  );
  assert.ok(result.delay >= 5 && result.delay <= 14);
  assert.equal(result.finished, true);
  const beforeFailure = c.db.communityObjectMotion.objectId.find(
    mover.id,
  )!.state;
  await assert.rejects(
    c.reducers.interactCommunityObject({ objectId: mover.id, action: "fail" }),
  );
  assert.equal(
    c.db.communityObjectMotion.objectId.find(mover.id)!.state,
    beforeFailure,
  );
  // Replace a path before it reaches the sensor; old predictions must not fire.
  const beforeSensor = c.db.communityObjectScripts.id.find(sensor.id)!.state;
  await c.reducers.moveCommunityCharacter({
    communityId: guild,
    x: 0,
    z: 3,
    seat: "",
    pose: "idle",
  });
  await c.reducers.moveCommunityCharacter({
    communityId: guild,
    x: 3,
    z: -3,
    seat: "",
    pose: "idle",
  });
  await new Promise((resolve) => setTimeout(resolve, 4000));
  assert.equal(
    c.db.communityObjectScripts.id.find(sensor.id)!.state,
    beforeSensor,
  );
  console.log(
    "PASS intelligent objects: exact approach boundary, pause, view exit, resume, once completion and visibility",
  );
} finally {
  c.disconnect();
}
