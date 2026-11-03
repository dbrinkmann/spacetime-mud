import { chromium, expect } from "@playwright/test";
import { builderRoom } from "./builder-fixture.ts";
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 760 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `${process.env.GAME_URL ?? "http://127.0.0.1:5179"}/?preview`,
  );
  await page.waitForFunction(() => !!window.renderLanternPreview);
  const source = JSON.stringify(builderRoom());
  await page.evaluate(
    async (source) => window.renderLanternPreview!({ source, time: 1 }),
    source,
  );
  await expect(
    page.getByRole("img", { name: "Interactive 3D room" }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(() => document.fonts.check("16px LanternSigns")),
  ).toBe(true);
  type State = {
    npcs: Array<{ head: number[] }>;
    signs: string[];
    walls: Array<{ position: number[]; opacity: number }>;
  };
  const initial = (await page.evaluate(() =>
    window.boxWorld!.inspect(),
  )) as State;
  expect(initial.signs[0]).toContain("\u6771\u4eac");
  expect(initial.npcs).toHaveLength(1);
  expect(initial.walls.find((w) => w.position[2] > 0)!.opacity).toBeLessThan(
    0.2,
  );
  expect(initial.walls.find((w) => w.position[2] < 0)!.opacity).toBeGreaterThan(
    0.9,
  );
  await page.screenshot({ path: "test-results/builder-preview-front.png" });
  await page.evaluate(
    async (source) =>
      window.renderLanternPreview!({ source, yaw: 180, time: 4 }),
    source,
  );
  await page.waitForTimeout(500);
  const reverse = (await page.evaluate(() =>
    window.boxWorld!.inspect(),
  )) as State;
  expect(reverse.walls.find((w) => w.position[2] < 0)!.opacity).toBeLessThan(
    0.2,
  );
  expect(reverse.npcs[0].head).not.toEqual(initial.npcs[0].head);
  await page.screenshot({ path: "test-results/builder-preview-back.png" });
  expect(errors).toEqual([]);
  console.log(
    "PASS actual renderer: bundled Japanese font, NPC animation time, default/reverse camera wall fading.",
  );
} finally {
  await browser.close();
}
