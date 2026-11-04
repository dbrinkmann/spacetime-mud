import { surfaceMaterials } from "../shared/geometry.ts";
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
  neon.models.swatches = {
    boxes: surfaceMaterials.map((material, i) => ({
      position: [i - 3, 0.4, 0],
      size: [0.8, 0.8, 0.8],
      color: "#75716a",
      material,
    })),
  };
  neon.objects.push({
    id: "swatches",
    name: "Material samples",
    model: "swatches",
    position: [0, 0, 0],
    yaw: 0,
  });
  neon.models.road = {
    boxes: [
      {
        position: [0, 0.01, 0],
        size: [10, 0.02, 2],
        color: "#292d31",
        material: "asphalt",
      },
    ],
  };
  neon.objects.push({
    id: "road",
    name: "Road",
    model: "road",
    position: [0, 0, 2],
    yaw: 0,
  });
  neon.models.car = {
    boxes: [
      {
        position: [0, 0.5, 0],
        size: [0.9, 0.6, 1.8],
        color: "#596b7b",
        material: "metal",
      },
      {
        position: [0, 0.9, 0],
        size: [0.7, 0.4, 0.8],
        color: "#8bb9cc",
        material: "glass",
      },
    ],
  };
  neon.objects.push({
    id: "car",
    name: "Traffic",
    model: "car",
    position: [0, 0, 2],
    yaw: 0,
    motion: {
      points: [
        [-4, 0, 0],
        [4, 0, 0],
      ],
      speed: 2,
      mode: "pingpong",
    },
  });
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
    if (name === "neon") {
      const position = () =>
        page.evaluate(
          () =>
            (
              window.boxWorld!.inspect() as {
                props: Array<{ id: string; position: number[] }>;
              }
            ).props.find((p) => p.id === "car")!.position,
        );
      assert.deepEqual(await position(), [-4, 0, 2]);
      await page.evaluate(
        async (source) => window.renderLanternPreview!({ source, time: 1 }),
        source,
      );
      assert.deepEqual(await position(), [-2, 0, 2]);
    }
  }
  console.log(JSON.stringify(errors));
  if (errors.length) throw Error("Rendering errors");
} finally {
  await browser.close();
}
