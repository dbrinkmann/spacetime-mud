import { chromium, expect } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { connect, host, database } from "./connect.ts";
import { emptyRoom } from "../shared/world.ts";

const { c, token } = await connect();
const guild = String(Date.now());
const op = (name: string, ...args: unknown[]) =>
  execFileSync(
    process.env.SPACETIME_CLI ?? "spacetimedb-cli",
    [
      "call",
      "--no-config",
      database,
      name,
      ...args.map((x) => JSON.stringify(x)),
      "--server",
      host,
    ],
    { stdio: "pipe", windowsHide: true },
  );
op(
  "provision_community",
  guild,
  "Builders' Village",
  c.identity!.toHexString(),
  "200",
);
const agent = new Client({ name: "browser-builder", version: "1" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve("public/agent/lantern-agent.mjs")],
  env: {
    ...process.env,
    SPACETIME_HOST: host,
    SPACETIME_DATABASE: database,
    MCP_STATE_DIR: mkdtempSync(join(tmpdir(), "lantern-browser-agent-")),
  } as Record<string, string>,
  stderr: "pipe",
});
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const result = await agent.callTool({ name, arguments: args });
  const content = result.content as Array<{ type: string; text?: string }>;
  return {
    failed: !!result.isError,
    value: JSON.parse(content.find((x) => x.type === "text")!.text!),
  };
};
try {
  await agent.connect(transport);
  const pairing = await call("world_connect");
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ host, database, token }) =>
      localStorage.setItem(`community-world:${host}:${database}`, token),
    { host, database, token },
  );
  await page.goto(
    `${process.env.GAME_URL ?? "http://127.0.0.1:5179"}/?community`,
  );
  await page.getByLabel("Your character's name").fill("Admin builder");
  await page
    .getByRole("button", { name: "Enter community", exact: true })
    .click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByLabel("Agent setup instructions")).toHaveValue(
    new RegExp(guild),
  );
  await expect(page.getByLabel("Allow editing common spaces")).toBeChecked();
  await page.getByLabel("Agent pairing ID").fill(pairing.value.agent_id);
  await page
    .getByRole("button", { name: "Connect agent", exact: true })
    .click();
  await expect(
    page.getByText("Home, character and common spaces", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () => (await call("world_inspect", { community_id: guild })).failed,
    )
    .toBe(false);
  const state = (await call("world_inspect", { community_id: guild })).value;
  expect(state.common_space_editing).toBe(true);
  await page.screenshot({
    path: "test-results/community-agent-pairing.png",
    fullPage: true,
  });
  const scene = emptyRoom(
    "The Commons",
    "Built live by the server admin's agent.",
  );
  scene.floorColor = "#385052";
  const published = await call("world_publish_room", {
    community_id: guild,
    room_id: state.room.id,
    base_revision: state.room.revision,
    source: JSON.stringify(scene),
  });
  expect(published.failed, JSON.stringify(published.value)).toBe(false);
  await page.getByRole("button", { name: "World", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The Commons", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Interactive 3D room" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  op(
    "set_community_member",
    guild,
    c.identity!.toHexString(),
    "200",
    false,
    true,
  );
  await expect(page.getByLabel("Allow editing common spaces")).toHaveCount(0);
  await expect(
    page.getByText("Home and character", { exact: true }),
  ).toBeVisible();
  const denied = await call("world_publish_room", {
    community_id: guild,
    room_id: state.room.id,
    base_revision: 1,
    source: JSON.stringify(scene),
  });
  expect(denied.failed).toBe(true);
  await page
    .getByRole("button", { name: "Disconnect agent", exact: true })
    .click();
  await expect(page.getByText("No agents connected yet.")).toBeVisible();
  await expect
    .poll(
      async () => (await call("world_inspect", { community_id: guild })).failed,
    )
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/community-agent-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "PASS browser pairing, explicit admin scope, live common-room publication, admin removal, revocation and mobile layout.",
  );
} finally {
  await agent.close();
  c.disconnect();
  await browser.close();
}
