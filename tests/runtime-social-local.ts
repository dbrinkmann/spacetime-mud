import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { DbConnection } from "../world-client/module_bindings";
import { neutralCharacter } from "../shared/world";
import { guidePackage } from "../shared/runtime/guide-example";
import { packageBundle, createRuntimeMcp } from "../mcp/runtime";
import { canonical, sha256 } from "../shared/runtime/digest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { walkerPosition } from "../shared/runtime/walking";
import type { RoomPresentation } from "../shared/runtime/presentation";
const host = process.env.LANTERN_RUNTIME_HOST ?? "http://127.0.0.1:3030",
  database = process.env.LANTERN_RUNTIME_DATABASE ?? "lantern-runtime-refactor";
if (
  !["lantern-runtime-refactor", "dbrinkmann-lantern-runtime-v2"].includes(
    database,
  )
)
  throw Error("Use an isolated replacement database.");
const cli =
  process.env.SPACETIME_CLI ??
  "D:\\dev\\personal\\scratch\\tools\\spacetimedb\\spacetimedb-cli.exe";
const clients: DbConnection[] = [];
function call(name: string, ...args: unknown[]) {
  execFileSync(
    cli,
    [
      "call",
      database,
      name,
      ...args.map((a) => JSON.stringify(a)),
      "--server",
      host,
      "--no-config",
    ],
    { stdio: "pipe" },
  );
}
async function connect(token?: string) {
  return new Promise<{ c: DbConnection; token: string }>((resolve, reject) => {
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .withToken(token)
      .onConnect((c, _id, token) => {
        clients.push(c);
        resolve({ c, token });
      })
      .onConnectError((_c, e) => reject(e))
      .build();
  });
}
async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean) {
  for (let i = 0; i < 100; i++) {
    const value = await read();
    if (ok(value)) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Timed out waiting for world state");
}
try {
  const admin = await connect(),
    member = await connect(),
    guild = Date.now().toString(),
    property = `common:${guild}`;
  call(
    "provision_community",
    guild,
    "Social integration",
    admin.c.identity!.toHexString(),
    "1",
  );
  call(
    "set_community_member",
    guild,
    member.c.identity!.toHexString(),
    "2",
    false,
    true,
  );
  await member.c.reducers.joinWorld({ community: guild });
  let notifications = 0;
  member.c.db.liveRoomStamp.onInsert(() => notifications++);
  member.c.db.liveRoomStamp.onUpdate(() => notifications++);
  member.c.db.liveRoomStamp.onDelete(() => notifications++);
  await new Promise<void>((resolve, reject) =>
    member.c
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .onError((ctx) => reject(Error(String(ctx.event))))
      .subscribe("SELECT * FROM live_room_stamp"),
  );
  const preview = (c = admin.c, p = property, r = "welcome") =>
    c.procedures
      .previewRoom({ property: p, room: r })
      .then((s) => JSON.parse(s) as RoomPresentation);
  assert.equal((await preview(member.c)).location?.room, "welcome");
  const barrier = `barrier${guild}`;
  await admin.c.reducers.createEntity({
    id: barrier,
    property,
    room: "welcome",
    components: JSON.stringify({
      transform: { position: [0, 0, 3], rotation: [0, 0, 0] },
      collider: { center: [0, 0, 0], size: [2, 0.3], enabled: false },
    }),
  });
  await member.c.reducers.walkTo({ x: 0, z: 5, entity: "", action: "" });
  await admin.c.reducers.updateEntity({
    id: barrier,
    revision: 1,
    components: JSON.stringify({
      collider: { center: [0, 0, 0], size: [2, 0.3], enabled: true },
    }),
  });
  const replanned = (await preview(member.c)).location!;
  assert.ok(
    replanned.walk.points.some((p) => Math.abs(p[0]) > 0.5),
    "navigation edits replan the active route before arrival",
  );
  await member.c.reducers.walkTo({ x: 0, z: 0, entity: "", action: "" });
  const entrance = `entrance${guild}`;
  await admin.c.reducers.createEntity({
    id: entrance,
    property,
    room: "welcome",
    components: JSON.stringify({
      transform: { position: [0, 0, -3], rotation: [0, 0, 0] },
      visual: {
        boxes: [{ position: [0, 1, 0], size: [1, 2, 0.2], color: "#8899aa" }],
      },
      interaction: { approach: [0, 0, 1] },
      homeEntrance: { name: "Open home" },
    }),
  });
  await member.c.reducers.claimHome({ entrance, name: "Member home" });
  await until(
    async () => notifications,
    (n) => n >= 2,
  );
  const original = (await preview()).entities.find((e) => e.id === entrance)!;
  await admin.c.reducers.updateEntity({
    id: entrance,
    revision: original.revision,
    components: JSON.stringify({ visibility: false }),
  });
  const changed = (await preview()).entities.find((e) => e.id === entrance)!;
  await admin.c.reducers.restoreEntity({
    id: entrance,
    revision: changed.revision,
    sourceRevision: original.revision,
  });
  assert.notEqual(
    (await preview()).entities.find((e) => e.id === entrance)?.components
      .visibility,
    false,
  );
  assert.ok(
    JSON.parse(await admin.c.procedures.entityHistory({ id: entrance }))
      .length >= 3,
  );
  const world = JSON.parse(
    await member.c.procedures.listWorld({ community: guild }),
  );
  const home = world.homes[0].property as string;
  const pkg = packageBundle({
    manifest: { ...guidePackage.manifest, id: `guide${guild}` },
    source: guidePackage.source,
    license: "MIT",
    documentation: "Reusable guide",
  });
  await member.c.reducers.publishPackage({
    bundle: JSON.stringify(pkg),
    visibility: "community",
    community: guild,
  });
  const definition = {
    components: {
      transform: { position: [0, 0, 0], rotation: [0, 0, 0] },
      label: "Shared guide",
    },
    bindings: [{ slot: "guide", hash: pkg.hash, config: {} }],
  };
  await member.c.reducers.publishTemplate({
    property: home,
    definition: JSON.stringify(definition),
  });
  const exported = JSON.parse(
    await member.c.procedures.exportTemplate({
      hash: sha256(canonical({ ...definition, property: home })),
    }),
  );
  const server = createRuntimeMcp(async () => admin.c),
    client = new Client({ name: "template-reuser", version: "1" }),
    [s, c] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  await client.connect(c);
  try {
    const result = await client.callTool({
      name: "world_import_template",
      arguments: {
        community: guild,
        property,
        namespace: `import${guild}`,
        bundle: exported,
      },
    });
    assert.ok(!result.isError, JSON.stringify(result));
    const imported = JSON.parse(
      (result.content as Array<{ text: string }>)[0].text,
    );
    await admin.c.reducers.spawnTemplate({
      property,
      room: "welcome",
      hash: imported.hash,
      id: `instance${guild}`,
      position: JSON.stringify([4, 0, 4]),
    });
    const state = await until(
      async () =>
        JSON.parse(
          await admin.c.procedures.inspectEntity({ id: `instance${guild}` }),
        ),
      (v) => v.slots?.some((s: any) => s.created),
    );
    assert.ok(state.slots.every((s: any) => !s.lastError));
  } finally {
    await client.close();
    await server.close();
  }
  await member.c.reducers.setAvatar({
    community: guild,
    definition: JSON.stringify(neutralCharacter("Member avatar")),
  });
  assert.ok(
    (await preview()).walkers?.find(
      (w) => w.id === member.c.identity!.toHexString(),
    )?.character,
  );
  await member.c.reducers.walkTo({
    x: 0,
    z: 0,
    entity: entrance,
    action: "enter",
  });
  await until(
    () => preview(member.c),
    (p) => p.location?.property === home,
  );
  await member.c.reducers.renameHome({ property: home, name: "Renamed home" });
  assert.equal(
    (await preview()).entities.find((e) => e.id === entrance)?.components.label,
    "Renamed home",
  );
  const same = await connect(member.token);
  await same.c.reducers.joinWorld({ community: guild });
  member.c.disconnect();
  assert.ok(
    !(await preview(admin.c, home, "home")).walkers?.[0].away,
    "second player session keeps avatar online",
  );
  same.c.disconnect();
  const away = await until(
    () => preview(admin.c, home, "home"),
    (p) => p.walkers?.[0]?.away === true,
  );
  const npc = away.walkers![0];
  assert.notDeepEqual(
    walkerPosition(npc, npc.walk.started),
    walkerPosition(npc, npc.walk.started + 0.5),
    "away avatar follows its authored-space routine",
  );
  const resumed = await connect(member.token);
  await resumed.c.reducers.joinWorld({ community: guild });
  const restored = await preview(resumed.c, home, "home");
  assert.equal(restored.location?.property, home);
  assert.equal(restored.location?.away, false);
  const position = walkerPosition(restored.location!, restored.serverTime);
  assert.ok(Math.hypot(position[0], position[2]) <= 1.01);
  await resumed.c.reducers.createRoom({
    property: home,
    room: "annex",
    name: "Annex",
    width: 8,
    depth: 8,
  });
  await resumed.c.reducers.enterWalkRoom({ property: home, room: "annex" });
  await resumed.c.reducers.deleteRoom({
    property: home,
    room: "annex",
    destination: "home",
  });
  assert.equal((await preview(resumed.c, home, "home")).location?.room, "home");
  await resumed.c.reducers.createRoom({
    property: home,
    room: "annex",
    name: "New annex",
    width: 8,
    depth: 8,
  });
  await resumed.c.reducers.deleteHome({ property: home });
  assert.equal((await preview(resumed.c)).location?.property, property);
  assert.equal(
    JSON.parse(await resumed.c.procedures.listWorld({ community: guild })).homes
      .length,
    0,
  );
  await resumed.c.reducers.claimHome({ entrance, name: "Rebuilt home" });
  console.log(
    JSON.stringify({
      guild,
      result:
        "welcome bootstrap, member home, rename, avatar, multi-session presence, away routine and reconnect passed",
    }),
  );
} finally {
  clients.forEach((c) => c.disconnect());
}
