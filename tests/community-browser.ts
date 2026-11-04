import assert from "node:assert/strict";
import { builderRoom } from "./builder-fixture.ts";
import { entranceRoom } from "./entrance-fixture.ts";
import { until } from "./connect.ts";
import { chromium, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { connect, host, database } from "./connect.ts";
const url = process.env.GAME_URL ?? "http://127.0.0.1:5176";
const { c, token } = await connect();
const guild = String(Date.now());
execFileSync(
  process.env.SPACETIME_CLI ?? "spacetimedb-cli",
  [
    "call",
    "--no-config",
    database,
    "provision_community",
    JSON.stringify(guild),
    JSON.stringify("Lantern Village"),
    JSON.stringify(c.identity!.toHexString()),
    '"100"',
    "--server",
    host,
  ],
  { stdio: "pipe", windowsHide: true },
);
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ host, database, token }) =>
      localStorage.setItem(`community-world:${host}:${database}`, token),
    { host, database, token },
  );
  await page.goto(`${url}/?community`);
  await page.getByLabel("Your character's name").fill("Alice");
  await page
    .getByRole("button", { name: "Enter community", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No available home entrances" }),
  ).toBeVisible();
  await new Promise<void>((resolve, reject) =>
    c
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .onError(reject)
      .subscribe([
        "SELECT * FROM my_communities",
        "SELECT * FROM community_rooms",
        "SELECT * FROM community_exits",
      ]),
  );
  await until(() => c.db.myCommunities.id.find(guild));
  const welcome = c.db.myCommunities.id.find(guild)!.welcomeRoom;
  await c.reducers.publishCommunityRoom({
    roomId: welcome,
    source: JSON.stringify(entranceRoom()),
    baseRevision: 0,
  });
  await expect(page.locator(".community-entrance")).toHaveCount(2);
  await expect(page.locator(".community-entrance").first()).toBeHidden();
  const vacantDoor = await page.evaluate(() =>
    window.boxWorld!.project([-2, 1, -3]),
  );
  await page.mouse.move(vacantDoor.x, vacantDoor.y);
  await expect(
    page.locator(".community-entrance").filter({ hasText: "Garden door 1" }),
  ).toBeVisible();
  await expect(
    page.locator(".community-entrance").filter({ hasText: "Garden door 2" }),
  ).toBeHidden();
  await page.mouse.click(vacantDoor.x, vacantDoor.y);
  await expect(page.getByLabel("Home entrance")).toHaveValue("door-0");
  await page.getByLabel("Home name").fill("Alice's cottage");
  await page.getByRole("button", { name: "Create home", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Alice's cottage", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Home map", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Interactive 3D room" }),
  ).toBeVisible();
  await expect(
    page.locator(".poc-nameplate").filter({ hasText: "Alice · you" }),
  ).toBeVisible();
  await until(() =>
    [...c.db.communityRooms.iter()].some((r) => r.name === "Alice's cottage"),
  );
  const home = [...c.db.communityRooms.iter()].find(
    (r) => r.name === "Alice's cottage",
  )!;
  const outside = [...c.db.communityExits.iter()].find(
    (e) => e.fromRoom === home.id,
  )!;
  const interior = builderRoom();
  interior.name = home.name;
  interior.width = 80;
  interior.depth = 80;
  interior.models.road = {
    boxes: [{ position: [0, 0, 0], size: [8, 0.04, 4], color: "#28282a" }],
  };
  interior.objects.push({
    id: "road",
    name: "Decorative road",
    model: "road",
    position: [0, 0, 2],
    yaw: 0,
  });
  interior.objects.forEach((o) => delete o.homeEntrance);
  interior.objects[0].exit = {
    id: String(outside.reverseId),
    approach: [0, 0, 1],
  };
  await assert.rejects(
    c.reducers.publishCommunityRoom({
      roomId: home.id,
      source: JSON.stringify(interior),
      baseRevision: 0,
    }),
    /originate/,
  );
  interior.objects[0].exit.id = String(outside.id);
  await c.reducers.publishCommunityRoom({
    roomId: home.id,
    source: JSON.stringify(interior),
    baseRevision: 0,
  });
  await expect(
    page.locator(".community-entrance").filter({ hasText: "Outside: Welcome" }),
  ).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window.boxWorld!.inspect() as { camera: { span: number } }).camera
            .span,
      ),
    )
    .toBe(4.5);
  // An overview is still available through manual zoom for distant doors.
  await page.locator(".poc-viewport").hover();
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(200);
  const hoverDoor = await page.evaluate(() =>
    window.boxWorld!.project([-2, 1, -3]),
  );
  await page.mouse.move(hoverDoor.x, hoverDoor.y);
  await expect(
    page.locator(".community-entrance").filter({ hasText: "Outside: Welcome" }),
  ).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(
    page.locator(".community-entrance").filter({ hasText: "Outside: Welcome" }),
  ).toBeHidden();
  const target = await page.evaluate(() =>
    window.boxWorld!.project([2, 0.02, 2]),
  );
  await page.mouse.click(target.x, target.y);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = window.boxWorld!.inspect() as {
          travelers: Array<{ name: string; position: number[] }>;
        };
        return (
          state.travelers.find((t) => t.name === "Alice")?.position[0] ?? 0
        );
      }),
    )
    .toBeGreaterThan(1.5);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = window.boxWorld!.inspect() as {
          position: [number, number, number];
        };
        const point = window.boxWorld!.project([
          s.position[0],
          0.65,
          s.position[2],
        ]);
        const rect = document
          .querySelector(".poc-viewport")!
          .getBoundingClientRect();
        return (
          Math.abs((point.x - rect.left) / rect.width - 0.5) <= 0.176 &&
          Math.abs((point.y - rect.top) / rect.height - 0.5) <= 0.151
        );
      }),
    )
    .toBe(true);
  const outsideDoor = await page.evaluate(() =>
    window.boxWorld!.project([-2, 1, -3]),
  );
  await page.mouse.click(outsideDoor.x, outsideDoor.y);
  await expect(
    page.getByRole("heading", { name: "Welcome", exact: true }),
  ).toBeVisible();
  await page.locator(".poc-viewport").hover();
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(200);
  const hoverHome = await page.evaluate(() =>
    window.boxWorld!.project([-2, 1, -3]),
  );
  await page.mouse.move(hoverHome.x, hoverHome.y);
  await expect(
    page
      .locator(".community-entrance")
      .filter({ hasText: "Enter Alice's cottage" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/community-entrances.png",
    fullPage: true,
  });
  const door = await page.evaluate(() => window.boxWorld!.project([-2, 1, -3]));
  await page.mouse.click(door.x, door.y);
  await expect(
    page.getByRole("heading", { name: "Home map", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/community-desktop.png",
    fullPage: true,
  });
  for (const [width, height] of [
    [1200, 650],
    [900, 500],
    [390, 844],
    [640, 360],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const canvas = document
            .querySelector(".poc-viewport canvas")!
            .getBoundingClientRect();
          const input = document
            .querySelector('[aria-label="Room message"]')!
            .getBoundingClientRect();
          return (
            document.documentElement.scrollHeight <= innerHeight &&
            document.documentElement.scrollWidth <= innerWidth &&
            canvas.height > 100 &&
            canvas.bottom <= innerHeight &&
            input.bottom <= innerHeight &&
            input.top >= 0
          );
        }),
      )
      .toBe(true);
    if (width <= 700) {
      await page
        .getByRole("button", { name: "Room tools", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Room", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Close room tools", exact: true })
        .click();
    }
    await page.screenshot({
      path: `test-results/community-layout-${width}x${height}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/community-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Alice's cottage", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "Community browser passed: arrival, claim, enter/leave, home map, 3D canvas, reload, mobile layout.",
  );
} finally {
  c.disconnect();
  await browser.close();
}
