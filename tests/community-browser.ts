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
  const target = await page.evaluate(() => window.boxWorld!.project([2, 0, 2]));
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
  await page.getByRole("button", { name: "Outside: Welcome" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Alice's cottage" }).click();
  await expect(
    page.getByRole("heading", { name: "Home map", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/community-desktop.png",
    fullPage: true,
  });
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
