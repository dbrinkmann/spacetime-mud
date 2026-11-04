import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { connect, host, database, until } from "./connect.ts";
import { builderRoom } from "./builder-fixture.ts";
const { c, token } = await connect();
const guild = String(Date.now());
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
try {
  await new Promise<void>((resolve, reject) =>
    c
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .onError(reject)
      .subscribe(
        ["my_communities", "community_objects", "community_rooms"].map(
          (t) => `SELECT * FROM ${t}`,
        ),
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
      '"Script browser"',
      JSON.stringify(c.identity!.toHexString()),
      '"1"',
      "--server",
      host,
    ],
    { stdio: "pipe", windowsHide: true },
  );
  await until(() => c.db.myCommunities.id.find(guild));
  const roomId = c.db.myCommunities.id.find(guild)!.welcomeRoom;
  await c.reducers.createCommunityObject({
    roomId,
    name: "Receptionist",
    source:
      'var RUMORS = ["Welcome to the station!"]; function on_hello(ctx){ctx.tell(RUMORS[0]);}',
    actions: [{ id: "hello", label: "Ask receptionist" }],
  });
  await until(() => c.db.communityObjects.count() === 1n);
  const oid = [...c.db.communityObjects.iter()][0].id;
  const scene = builderRoom();
  scene.npcs![0].objectId = String(oid);
  scene.npcs![0].position = [0, 0, 0];
  await c.reducers.publishCommunityRoom({
    roomId,
    source: JSON.stringify(scene),
    baseRevision: 0,
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
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
  await page.getByLabel("Your character's name").fill("Visitor");
  await page
    .getByRole("button", { name: "Enter community", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Receptionist",
      exact: true,
      includeHidden: true,
    }),
  ).toHaveCount(1);
  await page.waitForFunction(() => !!window.boxWorld);
  const point = await page.evaluate(() =>
    window.boxWorld!.project([0, 1.2, 0]),
  );
  await page.mouse.click(point.x, point.y);
  // Actions stay closed during approach; a floor click cancels the queued action.
  await expect(
    page.getByRole("button", { name: "Ask receptionist", exact: true }),
  ).toHaveCount(0);
  const floor = await page.evaluate(() => window.boxWorld!.project([2, 0, 3]));
  await page.mouse.click(floor.x, floor.y);
  await page.waitForTimeout(2200);
  await expect(
    page.getByRole("button", { name: "Ask receptionist", exact: true }),
  ).toHaveCount(0);
  const npc = await page.evaluate(() => window.boxWorld!.project([0, 1.2, 0]));
  await page.mouse.click(npc.x, npc.y);

  await expect(
    page.getByRole("button", { name: "Ask receptionist", exact: true }),
  ).toBeVisible();
  const arrived = await page.evaluate(() => {
    const state = window.boxWorld!.inspect() as {
      travelers: Array<{ name: string; position: number[]; animation: string }>;
    };
    return state.travelers.find((t) => t.name === "Visitor")!;
  });
  assert.notEqual(arrived.animation, "walk");
  assert.ok(Math.hypot(arrived.position[0], arrived.position[2]) < 0.9);
  await page
    .getByRole("button", { name: "Ask receptionist", exact: true })
    .click();
  await expect(
    page
      .locator(".world-speech-bubble")
      .filter({ hasText: "Welcome to the station!" }),
  ).toContainText("Welcome to the station!");
  await expect(
    page
      .locator(".world-speech-bubble")
      .filter({ hasText: "Welcome to the station!" }),
  ).toContainText("(to you)");
  await page.waitForTimeout(800);
  await expect(page.getByLabel("Room message")).toHaveCount(0);
  await page.getByRole("button", { name: "Speak", exact: true }).click();
  await page.getByLabel("Room message").fill("Hello room");
  await page.getByRole("button", { name: "Say", exact: true }).click();
  await expect(
    page.locator(".world-speech-bubble").filter({ hasText: "Hello room" }),
  ).toBeVisible();
  await expect(page.getByLabel("Room message")).toHaveCount(0);
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/community-scripts-browser.png",
    fullPage: true,
  });
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Room message")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Room message")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Close room tools" }).click();
  await page.getByRole("button", { name: "Speak", exact: true }).click();
  await expect(page.getByLabel("Room message")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Cancel speech" }).click();
  await expect(page.locator(".world-speech-bubble")).toHaveCount(0, {
    timeout: 32000,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Browser scripts passed: NPC geometry click, action, private reply and player room speech.",
  );
} finally {
  await browser.close();
  c.disconnect();
}
