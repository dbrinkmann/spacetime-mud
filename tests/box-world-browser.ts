import { chromium, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import type { Vec3 } from "../client/poc/contract.ts";
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
mkdirSync("test-results", { recursive: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1512, height: 1000 },
    }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.POC_URL ?? "http://127.0.0.1:5174/?poc");
  await page.waitForFunction(() => !!window.boxWorld);
  await page.screenshot({
    path: "test-results/box-world-desktop.png",
    fullPage: true,
  });
  const canvas = page.getByRole("img", { name: "Interactive 3D room" });
  await expect(canvas).toBeVisible();
  const project = async (p: Vec3) =>
    page.evaluate((p) => window.boxWorld!.project(p), p);
  let p = await project([2.7, 0, 3]);
  await page.mouse.click(p.x, p.y);
  await expect(canvas).toHaveAttribute("data-animation", "walk");
  await expect(canvas).toHaveAttribute("data-animation", "idle", {
    timeout: 10000,
  });
  const state = (await page.evaluate(() => window.boxWorld!.inspect())) as {
    position: number[];
  };
  assert(Math.abs(state.position[0] - 2.7) < 0.1);
  p = await project([-1.7, 0.85, -0.1]);
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "Sit here", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-seat", "reading-chair", {
    timeout: 15000,
  });
  await page.screenshot({
    path: "test-results/box-world-seated.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Stand up", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-seat", "");
  await page.getByRole("button", { name: "wave", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-animation", "wave");
  await page
    .getByLabel("Character definition", { exact: true })
    .selectOption("wizard.json");
  await page.waitForFunction(() => {
    const s = window.boxWorld?.inspect() as
      { cosmetics: { name: string }[] } | undefined;
    return s?.cosmetics.some((c) => c.name === "Stepped wizard hat");
  });
  await page.getByRole("button", { name: "wave", exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "test-results/box-world-wizard.png",
    fullPage: true,
  });
  await page.getByLabel("Cosmetic attachments").uncheck();
  assert(
    await page.evaluate(() => {
      const s = window.boxWorld!.inspect() as {
        cosmetics: { visible: boolean }[];
      };
      return s.cosmetics.every((c) => !c.visible);
    }),
  );
  await page.getByLabel("Cosmetic attachments").check();
  await page.getByRole("button", { name: "Edit definitions" }).click();
  const input = page.getByLabel("character JSON");
  await input.fill('{"version": 1}');
  await page.getByRole("button", { name: "Validate & apply" }).click();
  await expect(page.getByRole("alert")).toContainText("parts.head");
  await expect(canvas).toBeVisible();
  const character = JSON.parse(
    readFileSync("public/poc/examples/wizard.json", "utf8"),
  );
  character.name = "Agent-authored test";
  character.cosmetics.push({
    name: "Floating crest",
    parent: "head",
    position: [0, 0.8, 0],
    boxes: [{ position: [0, 0, 0], size: [0.12, 0.2, 0.12], color: "#5ac9b8" }],
  });
  await input.fill(JSON.stringify(character, null, 2));
  await page.getByRole("button", { name: "Validate & apply" }).click();
  await page.waitForFunction(() => {
    const s = window.boxWorld?.inspect() as
      { cosmetics: { name: string }[] } | undefined;
    return s?.cosmetics.some((c) => c.name === "Floating crest");
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Room JSON", exact: true }).click();
  const room = JSON.parse(
    readFileSync("public/poc/examples/room.json", "utf8"),
  );
  room.name = "Agent-authored room";
  room.floorColor = "#60766b";
  room.models.table.boxes[0].color = "#527f91";
  await page
    .getByLabel("room JSON", { exact: true })
    .fill(JSON.stringify(room));
  await page.getByRole("button", { name: "Validate & apply" }).click();
  await expect(page.locator(".poc-title")).toContainText("Agent-authored room");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Save locally", exact: true }).click();
  await page.reload();
  await page.waitForFunction(() => !!window.boxWorld);
  await page.getByRole("button", { name: "Restore saved" }).click();
  await page.waitForFunction(() => {
    const s = window.boxWorld?.inspect() as
      { cosmetics: { name: string }[] } | undefined;
    return s?.cosmetics.some((c) => c.name === "Floating crest");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".poc-title")).toContainText("Agent-authored room");
  await expect(
    page.getByLabel("Character definition", { exact: true }),
  ).toHaveValue("custom");
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "test-results/box-world-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS WebGL room, floor picking/navigation, seat approach/pose/stand, character swap, rigid cosmetics, JSON validation/rebuild, local persistence, mobile layout.",
  );
} finally {
  await browser.close();
}
