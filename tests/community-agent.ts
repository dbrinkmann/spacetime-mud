import { builderRoom } from "./builder-fixture.ts";
import { entranceRoom } from "./entrance-fixture.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Identity } from "spacetimedb";
import { connect, until, host, database } from "./connect.ts";
import { emptyRoom, neutralCharacter } from "../shared/world.ts";

const clients = await Promise.all([connect(), connect(), connect()]);
const [admin, member, stranger] = clients.map((x) => x.c);
const guild = String(Date.now()),
  foreignGuild = String(BigInt(guild) + 1n);
const op = (name: string, ...args: unknown[]) =>
  execFileSync(
    process.env.SPACETIME_CLI ?? "spacetimedb-cli",
    [
      "call",
      "--no-config",
      database,
      name,
      ...args.map((a) => JSON.stringify(a)),
      "--server",
      host,
    ],
    { stdio: "pipe", windowsHide: true },
  );
const temp = mkdtempSync(join(tmpdir(), "lantern-mcp-"));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    resolve(
      process.env.COMMUNITY_AGENT_PATH ?? "public/agent/lantern-agent.mjs",
    ),
  ],
  cwd: temp,
  env: {
    ...process.env,
    SPACETIME_HOST: host,
    SPACETIME_DATABASE: database,
    MCP_STATE_DIR: temp,
  } as Record<string, string>,
  stderr: "pipe",
});
const agent = new Client({
  name: "community-builder-verification",
  version: "1",
});
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const result = await agent.callTool({ name, arguments: args });
  const content = result.content as Array<{ type: string; text?: string }>;
  return {
    failed: !!result.isError,
    value: JSON.parse(content.find((x) => x.type === "text")!.text!),
  };
};
const ok = async (name: string, args: Record<string, unknown> = {}) => {
  const result = await call(name, args);
  assert.equal(result.failed, false, JSON.stringify(result.value));
  return result.value;
};
const denied = async (name: string, args: Record<string, unknown>) =>
  assert.equal((await call(name, args)).failed, true, `${name} must be denied`);
const scope = { community_id: guild };
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
                "community_properties",
                "community_characters",
                "my_community_agents",
                "community_history",
              ].map((n) => `SELECT * FROM ${n}`),
            ),
        ),
    ),
  );
  op(
    "provision_community",
    guild,
    "Agent common-space verification",
    admin.identity!.toHexString(),
    "101",
  );
  op(
    "provision_community",
    foreignGuild,
    "Isolated community",
    stranger.identity!.toHexString(),
    "103",
  );
  op(
    "set_community_member",
    guild,
    member.identity!.toHexString(),
    "102",
    false,
    true,
  );
  await until(() => admin.db.myCommunities.id.find(guild));
  const welcome = admin.db.myCommunities.id.find(guild)!.welcomeRoom;
  await admin.reducers.enterCommunity({
    communityId: guild,
    name: "Admin builder",
  });
  await member.reducers.enterCommunity({
    communityId: guild,
    name: "Home builder",
  });
  await agent.connect(transport);
  const pairing = await ok("world_connect", scope);
  const agentId = Identity.fromString(pairing.agent_id);
  const guide = await ok("world_guide");
  assert(!guide.contract.includes("world_publish_visual"));
  assert(!guide.contract.includes("npm run dev"));
  assert(guide.contract.includes("world_preview"));
  assert(
    guide.room_schema && guide.character_schema && guide.contract.length > 100,
  );
  await denied("world_inspect", scope);
  await member.reducers.authorizeCommunityAgent({
    communityId: guild,
    agent: agentId,
    commonSpace: false,
  });
  for (let i = 0; i < 30 && (await call("world_inspect", scope)).failed; i++)
    await new Promise((r) => setTimeout(r, 50));
  if (process.env.TEST_PREVIEW === "true") {
    const preview = await agent.callTool(
      {
        name: "world_preview",
        arguments: {
          ...scope,
          source: JSON.stringify(builderRoom()),
          time: 1.5,
        },
      },
      undefined,
      { timeout: 90000 },
    );
    assert.equal(preview.isError, undefined, JSON.stringify(preview.content));
    const picture = (
      preview.content as Array<{ type: string; data?: string }>
    ).find((c) => c.type === "image");
    assert(picture?.data);
    const png = Buffer.from(picture.data, "base64");
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    writeFileSync("test-results/mcp-builder-preview.png", png);
  }
  let state = await ok("world_inspect", scope);
  assert.equal(state.common_space_editing, false);
  await assert.rejects(
    member.reducers.authorizeCommunityAgent({
      communityId: guild,
      agent: agentId,
      commonSpace: true,
    }),
    /admins/,
  );
  await denied("world_publish_room", {
    ...scope,
    room_id: String(welcome),
    base_revision: 0,
    source: JSON.stringify(emptyRoom("Forbidden edit")),
  });
  await denied("world_create_room", {
    ...scope,
    from_room_id: String(welcome),
    name: "Forbidden",
    label: "There",
    back_label: "Back",
  });
  await denied("world_inspect", { community_id: foreignGuild });
  await denied("world_claim_home", {
    ...scope,
    common_room_id: String(welcome),
    spot_id: "door-0",
    name: "No entrance",
  });
  await admin.reducers.publishCommunityRoom({
    roomId: welcome,
    source: JSON.stringify(entranceRoom()),
    baseRevision: 0,
  });
  await ok("world_claim_home", {
    ...scope,
    common_room_id: String(welcome),
    spot_id: "door-0",
    name: "Agent cottage",
  });
  state = await ok("world_inspect", scope);
  const home = state.room.id;
  const behavior =
    'function on_hello(ctx){ctx.tell("Hello " + ctx.actorName());}';
  const trial = await ok("world_test_object", {
    ...scope,
    room_id: home,
    source: behavior,
    handler: "on_hello",
  });
  assert.equal(trial.messages[0].kind, "tell");
  await ok("world_create_object", {
    ...scope,
    room_id: home,
    name: "Talking lantern",
    source: behavior,
    actions: [{ id: "hello", label: "Say hello" }],
  });
  let objects = await ok("world_inspect", { ...scope, room_id: home });
  const oid = objects.objects[0].id;
  await ok("world_publish_object", {
    ...scope,
    room_id: home,
    object_id: oid,
    base_revision: 1,
    name: "Talking lantern",
    source: behavior,
    actions: [{ id: "hello", label: "Say hello" }],
  });
  await denied("world_publish_object", {
    ...scope,
    room_id: home,
    object_id: oid,
    base_revision: 1,
    name: "Stale",
    source: behavior,
    actions: [],
  });
  await ok("world_delete_object", {
    ...scope,
    room_id: home,
    object_id: oid,
    base_revision: 2,
  });

  await ok("world_validate", {
    kind: "room",
    source: JSON.stringify(emptyRoom("Home workshop")),
  });
  await ok("world_publish_room", {
    ...scope,
    room_id: home,
    base_revision: 0,
    source: JSON.stringify(emptyRoom("Home workshop")),
  });
  await until(
    () => member.db.communityRooms.id.find(BigInt(home))?.revision === 1,
  );
  await ok("world_publish_avatar", {
    ...scope,
    source: JSON.stringify(neutralCharacter("Builder")),
  });
  await ok("world_set_home_routine", {
    ...scope,
    points: [
      [1, 0, 3],
      [1, 0, 2],
    ],
  });
  await ok("world_create_room", {
    ...scope,
    from_room_id: home,
    name: "Attic",
    label: "Up",
    back_label: "Down",
  });
  await member.reducers.revokeCommunityAgent({
    communityId: guild,
    agent: agentId,
  });
  await denied("world_publish_room", {
    ...scope,
    room_id: home,
    base_revision: 1,
    source: JSON.stringify(emptyRoom()),
  });
  await admin.reducers.authorizeCommunityAgent({
    communityId: guild,
    agent: agentId,
    commonSpace: false,
  });
  await denied("world_publish_room", {
    ...scope,
    room_id: String(welcome),
    base_revision: 0,
    source: JSON.stringify(emptyRoom()),
  });
  await admin.reducers.authorizeCommunityAgent({
    communityId: guild,
    agent: agentId,
    commonSpace: true,
  });
  for (let i = 0; i < 30; i++) {
    state = await ok("world_inspect", scope);
    if (state.common_space_editing) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(state.common_space_editing, true);
  const scene = entranceRoom("The Lantern Commons");
  scene.models.lantern = {
    boxes: [{ position: [0, 0.5, 0], size: [0.5, 1, 0.5], color: "#e1b561" }],
  };
  scene.objects.push({
    id: "lamp",
    name: "Welcome lantern",
    model: "lantern",
    position: [0, 0, -2],
    yaw: 0,
  });
  await ok("world_publish_room", {
    ...scope,
    room_id: String(welcome),
    base_revision: 1,
    source: JSON.stringify(scene),
  });
  await until(
    () =>
      admin.db.communityRooms.id.find(welcome)?.name === "The Lantern Commons",
  );
  assert(
    JSON.parse(admin.db.communityRooms.id.find(welcome)!.source).objects.some(
      (o: { id: string }) => o.id === "lamp",
    ),
  );
  await denied("world_publish_room", {
    ...scope,
    room_id: String(welcome),
    base_revision: 0,
    source: JSON.stringify(scene),
  });
  await denied("world_publish_room", {
    ...scope,
    room_id: home,
    base_revision: 1,
    source: JSON.stringify(scene),
  });
  state = await ok("world_create_room", {
    ...scope,
    from_room_id: String(welcome),
    name: "Town garden",
    label: "Garden",
    back_label: "Commons",
  });
  const garden = state.rooms.find(
    (r: { name: string }) => r.name === "Town garden",
  );
  assert(garden);
  await ok("world_set_welcome", { ...scope, room_id: garden.id });
  state = await ok("world_inspect", { ...scope, room_id: String(welcome) });
  const history = state.history.find(
    (h: { revision: number }) => h.revision === 1,
  );
  assert(history);
  await ok("world_restore_room", {
    ...scope,
    revision_id: history.id,
    base_revision: 2,
  });
  op(
    "set_community_member",
    guild,
    admin.identity!.toHexString(),
    "101",
    false,
    true,
  );
  await denied("world_publish_room", {
    ...scope,
    room_id: String(welcome),
    base_revision: 2,
    source: JSON.stringify(scene),
  });
  op(
    "set_community_member",
    guild,
    admin.identity!.toHexString(),
    "101",
    true,
    true,
  );
  await admin.reducers.revokeCommunityAgent({
    communityId: guild,
    agent: agentId,
  });
  for (let i = 0; i < 30 && !(await call("world_inspect", scope)).failed; i++)
    await new Promise((r) => setTimeout(r, 50));
  await denied("world_inspect", scope);
  await member.reducers.authorizeCommunityAgent({
    communityId: guild,
    agent: agentId,
    commonSpace: false,
  });
  member.disconnect();
  const key = `${guild}:${member.identity!.toHexString()}`;
  await until(
    () => admin.db.communityCharacters.key.find(key)?.away,
    "agent connection does not keep owner online",
    15000,
  );
  op(
    "set_community_member",
    guild,
    member.identity!.toHexString(),
    "102",
    false,
    false,
  );
  await denied("world_publish_avatar", {
    ...scope,
    source: JSON.stringify(neutralCharacter("Denied")),
  });
  console.log(
    "PASS standalone MCP outside repo: member home/avatar/routine building, admin common scenes/rooms/welcome/restore, role downgrade, revocation, community isolation, agent-independent away presence.",
  );
} finally {
  await agent.close();
  for (const { c } of clients) c.disconnect();
}
