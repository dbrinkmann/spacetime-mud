import assert from "node:assert/strict";
import { builderRoom } from "./builder-fixture.ts";
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(
    (process.env.GAME_URL ?? "http://127.0.0.1:5179") + "/?preview",
  );
  await page.waitForFunction(() => !!window.renderLanternPreview);
  const neon = builderRoom();
  neon.floorColor = "#263039";
  neon.lights = [
    { position: [-2, 2, 0], color: "#dc37ab", intensity: 3 },
    { position: [2, 2, -2], color: "#31bbde", intensity: 3 },
  ];
  mkdirSync("test-results", { recursive: true });
  for (const [name, source, yaw] of [
    ["inn", readFileSync("public/poc/examples/room.json", "utf8"), 0],
    ["neon", JSON.stringify(neon), 0],
    ["cutaway", JSON.stringify(neon), 180],
  ] as const) {
    await page.evaluate(
      async ({ source, yaw }) =>
        await window.renderLanternPreview!({ source, yaw }),
      { source, yaw },
    );
    await page.waitForTimeout(2000);
    const colors = await page.evaluate(() => {
      const canvas = document.querySelector("canvas")!;
      const gl = canvas.getContext("webgl2")!;
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(
        0,
        0,
        canvas.width,
        canvas.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      const colors = new Set<string>();
      for (let i = 0; i < pixels.length; i += 400)
        colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      return colors.size;
    });
    assert.ok(colors > 64, `${name}: scene did not render (${colors} colors)`);
    await page.screenshot({ path: `test-results/art-style-${name}.png` });
  }
  console.log(JSON.stringify(errors));
  if (errors.length) throw Error("Rendering errors");
} finally {
  await browser.close();
}
