import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { chromium, expect } from "@playwright/test";
import { Identity } from "spacetimedb";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { connect, until, host, database } from "./connect.ts";
const site = process.env.GAME_URL ?? "http://127.0.0.1:5175/";
const suffix = Date.now().toString(36),
  state = resolve(".bridge", `mcp-${suffix}`);
const player = await connect(),
  other = await connect();
const mcp = new Client({ name: "provider-neutral-test", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    "--import",
    pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href,
    resolve("mcp/index.ts"),
  ],
  cwd: tmpdir(),
  env: {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (x): x is [string, string] => typeof x[1] === "string",
      ),
    ),
    SPACETIME_HOST: host,
    SPACETIME_DATABASE: database,
    MCP_STATE_DIR: state,
    GAME_URL: site,
  },
  stderr: "pipe",
});
transport.stderr?.on("data", (d) => process.stderr.write(d));
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
let agent: Awaited<ReturnType<typeof connect>> | undefined;
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await mcp.callTool({ name, arguments: args });
  assert(!r.isError, JSON.stringify(r));
  return r;
};
const value = (r: any) =>
  JSON.parse(r.content.find((c: any) => c.type === "text").text);
try {
  await player.c.reducers.createPlayer({ name: `Creator ${suffix}` });
  await other.c.reducers.createPlayer({ name: `Watcher ${suffix}` });
  await mcp.connect(transport);
  const tools = await mcp.listTools();
  assert(tools.tools.some((t) => t.name === "world_render_preview"));
  assert(tools.tools.some((t) => t.name === "world_publish_visual"));
  assert(tools.tools.some((t) => t.name === "world_publish_object"));
  const info = value(await call("world_connect"));
  assert.equal(info.paired, false);
  await assert.rejects(
    player.c.reducers.consent({ bridge: other.c.identity! }),
    /separate agent/i,
  );
  const denied = await mcp.callTool({
    name: "world_create_zone",
    arguments: { name: "Unauthorized", description: "No" },
  });
  assert(denied.isError);
  await player.c.reducers.consent({
    bridge: Identity.fromString(info.pairingUrl.split("agent=")[1]),
  });
  let paired = false;
  for (let i = 0; i < 30 && !paired; i++) {
    paired = value(await call("world_inspect")).paired;
    if (!paired) await new Promise((r) => setTimeout(r, 50));
  }
  assert(paired);
  await call("world_guide");
  await call("world_create_zone", {
    name: `Agent Atelier ${suffix}`,
    description: "Made through standard MCP tools.",
  });
  const inspected = value(await call("world_inspect")),
    roomId = BigInt(inspected.currentRoomId);
  const zone = [...player.c.db.zone.iter()].find((z) => z.entrance === roomId)!;
  await other.c.reducers.visitZone({ zoneId: zone.id });
  assert(
    (
      await mcp.callTool({
        name: "world_validate",
        arguments: { kind: "scene", source: "{}" },
      })
    ).isError,
  );
  const source = readFileSync("public/poc/examples/room.json", "utf8");
  await call("world_validate", { kind: "scene", source });
  await call("world_save_visual", {
    kind: "scene",
    room_id: String(roomId),
    source,
  });
  assert(!other.c.db.visibleScenes.roomId.find(roomId));
  const image = await call("world_render_preview", { room_id: String(roomId) });
  assert(
    (image.content as any[]).some(
      (c) => c.type === "image" && c.data.length > 1000,
    ),
  );
  agent = await connect(
    JSON.parse(readFileSync(resolve(state, readdirSync(state)[0]), "utf8"))
      .token,
  );
  const draft = [...player.c.db.myVisualDrafts.iter()][0];
  await assert.rejects(
    agent.c.reducers.publishVisual({
      key: draft.key,
      revision: draft.revision,
    }),
    /not your/i,
  );
  const context = await browser.newContext({
    viewport: { width: 1512, height: 1000 },
  });
  await context.addInitScript(
    ({ key, token }) => localStorage.setItem(key, token),
    { key: `spacetime-mud:${host}:${database}`, token: player.token },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(site);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Teach your agent to build." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Build", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Geometry JSON", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Agent request")).toHaveCount(0);
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/agent-create-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page
    .getByRole("button", { name: "Review creation", exact: true })
    .click();
  await expect(
    page.getByText("Private preview — only you can see this"),
  ).toBeVisible();
  await call("world_save_visual", {
    kind: "scene",
    room_id: String(roomId),
    source,
  });
  await expect(
    page.getByText(
      "The draft changed. Review the latest version before keeping it.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Keep it", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review creation", exact: true })
    .click();
  assert(!other.c.db.visibleScenes.roomId.find(roomId));
  await page
    .getByRole("button", { name: "Ask for changes", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("existing conversation");
  await page.screenshot({
    path: "test-results/agent-review-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Keep it", exact: true }).click();
  await until(() => other.c.db.visibleScenes.roomId.find(roomId));
  await call("world_save_visual", {
    kind: "avatar",
    source: readFileSync("public/poc/examples/wizard.json", "utf8"),
  });
  await page
    .getByRole("button", { name: "Review character", exact: true })
    .click();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await until(() => [...player.c.db.myVisualDrafts.iter()].length === 0);
  await call("world_save_object", {
    name: "MCP Bell",
    description: "A small bell.",
    kind: "scenery",
    source: 'function on_ring(ctx){ctx.say("The bell rings.");}',
    actions: [{ id: "ring", label: "Ring the bell" }],
  });
  const v = [...player.c.db.myVersions.iter()].find(
    (v) => v.name === "MCP Bell",
  )!;
  await call("world_test_object", {
    versionId: String(v.id),
    event: "on_ring",
  });
  await page
    .getByRole("button", { name: "Review MCP Bell", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Keep behavior", exact: true })
    .click();
  await until(() => other.c.db.visibleObjects.id.find(v.objectId)?.active);
  await call("world_save_object", {
    name: "Discard me",
    description: "An unwanted draft.",
    kind: "scenery",
    source: 'function on_touch(ctx){ctx.say("Hello.");}',
    actions: [{ id: "touch", label: "Touch" }],
  });
  const unwanted = [...player.c.db.myVersions.iter()].find(
    (version) => version.name === "Discard me",
  )!;
  await page
    .getByRole("button", { name: "Review Discard me", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard behavior", exact: true })
    .click();
  await until(() => !player.c.db.myVersions.id.find(unwanted.id));
  assert(!player.c.db.visibleObjects.id.find(unwanted.objectId));
  // Paired agents can finish work live without a browser approval step.
  await call("world_save_visual", {
    kind: "scene",
    room_id: String(roomId),
    source,
  });
  await until(() =>
    [...player.c.db.myVisualDrafts.iter()].some((d) => d.kind === "scene"),
  );
  const liveDraft = [...player.c.db.myVisualDrafts.iter()].find(
    (d) => d.kind === "scene",
  )!;
  assert(
    (
      await mcp.callTool({
        name: "world_publish_visual",
        arguments: {
          key: liveDraft.key,
          revision: liveDraft.revision + 1,
          room_id: String(roomId),
        },
      })
    ).isError,
  );
  await call("world_publish_visual", {
    key: liveDraft.key,
    revision: liveDraft.revision,
    room_id: String(roomId),
  });
  await until(
    () => other.c.db.visibleScenes.roomId.find(roomId)?.revision === 2,
  );
  await call("world_save_visual", {
    kind: "avatar",
    room_id: String(roomId),
    source: readFileSync("public/poc/examples/wizard.json", "utf8"),
  });
  await until(() =>
    [...player.c.db.myVisualDrafts.iter()].some((d) => d.kind === "avatar"),
  );
  const avatarDraft = [...player.c.db.myVisualDrafts.iter()].find(
    (d) => d.kind === "avatar",
  )!;
  await call("world_publish_visual", {
    key: avatarDraft.key,
    revision: avatarDraft.revision,
    room_id: String(roomId),
  });
  await until(() =>
    other.c.db.visibleAvatars.identity.find(player.c.identity!),
  );
  await call("world_save_object", {
    name: "Live bell",
    description: "Published by the agent.",
    kind: "scenery",
    source: 'function on_ring(ctx){ctx.say("Live bell rings.");}',
    actions: [{ id: "ring", label: "Ring live bell" }],
    room_id: String(roomId),
  });
  await until(() =>
    [...player.c.db.myVersions.iter()].some((v) => v.name === "Live bell"),
  );
  const liveVersion = [...player.c.db.myVersions.iter()].find(
    (v) => v.name === "Live bell",
  )!;
  assert(
    (
      await mcp.callTool({
        name: "world_publish_object",
        arguments: { versionId: String(liveVersion.id) },
      })
    ).isError,
  );
  await call("world_test_object", {
    versionId: String(liveVersion.id),
    event: "on_ring",
  });
  await call("world_publish_object", {
    versionId: String(liveVersion.id),
    room_id: String(roomId),
  });
  await until(
    () => other.c.db.visibleObjects.id.find(liveVersion.objectId)?.active,
  );
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/agent-create-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page
    .getByRole("button", { name: "Disconnect agent", exact: true })
    .click();
  await until(() => !player.c.db.myGrant.count());
  const revoked = await mcp.callTool({
    name: "world_save_visual",
    arguments: { kind: "scene", room_id: String(roomId), source },
  });
  assert(revoked.isError);
  assert(
    (
      await mcp.callTool({
        name: "world_publish_object",
        arguments: { versionId: String(liveVersion.id) },
      })
    ).isError,
  );
  assert.deepEqual(errors, []);
  await player.c.reducers.consent({ bridge: agent!.c.identity! });
  const extension = value(
    await call("world_create_room", {
      room_id: String(roomId),
      direction: "north",
      name: "Temporary annex",
      description: "Cleanup through MCP.",
    }),
  );
  const annexId = extension.room.exits.find(
    (e: any) => e.direction === "north",
  ).destination;
  await call("world_delete_room", { room_id: String(annexId) });
  await until(() => !player.c.db.visibleRooms.id.find(BigInt(annexId)));
  assert(
    (
      await mcp.callTool({
        name: "world_delete_zone",
        arguments: { zone_id: "1" },
      })
    ).isError,
  );
  await call("world_delete_zone", { zone_id: String(zone.id) });
  await until(() => !other.c.db.zone.id.find(zone.id));
  await until(
    () =>
      other.c.db.visiblePlayers.identity.find(other.c.identity!)?.roomId === 1n,
  );
  await player.c.reducers.revokeConsent({});
  console.log(
    "PASS generic MCP client: pairing, private staging, optional review, live room/avatar/behavior publication, stale revision and untested behavior rejection, mobile, revocation.",
  );
} finally {
  await mcp.close();
  await transport.close();
  player.c.disconnect();
  other.c.disconnect();
  agent?.c.disconnect();
  await browser.close();
}
