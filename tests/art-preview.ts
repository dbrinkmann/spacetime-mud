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
  neon.signs![0].attachTo = "back-wall";
  neon.signs![0].position = [0, 3.2, 1];
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
    if (name === "neon" || name === "cutaway") {
      const surface = await page.evaluate(
        () =>
          (
            window.boxWorld!.inspect() as {
              signSurfaces: Array<{
                opacity: number;
                position: number[];
                side: number;
              }>;
            }
          ).signSurfaces[0],
      );
      assert.equal(
        surface.side,
        0,
        "signs should not render mirrored backfaces",
      );
      assert.deepEqual(surface.position, [0, 3.2, -3]);
      if (name === "cutaway")
        assert.ok(
          surface.opacity < 0.2,
          "attached sign must fade with its wall",
        );
      else assert.ok(surface.opacity > 0.9);
    }
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
  neon.width = 60;
  neon.depth = 16;
  neon.floorMaterial = "asphalt";
  await page.evaluate(
    async (source) => window.renderLanternPreview!({ source }),
    JSON.stringify(neon),
  );
  const before = await page.evaluate(() => {
    const a = window.boxWorld!.project([3, 0, 2]),
      b = window.boxWorld!.project([4, 0, 2]);
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
  await page.evaluate(
    async (source) =>
      window.renderLanternPreview!({
        source,
        focus: [3, 0, 2],
        zoom: 4,
        yaw: 0,
      }),
    JSON.stringify(neon),
  );
  const close = await page.evaluate(() => {
    const a = window.boxWorld!.project([3, 0, 2]),
      b = window.boxWorld!.project([4, 0, 2]);
    return { a, distance: Math.hypot(b.x - a.x, b.y - a.y) };
  });
  assert.ok(
    Math.abs(close.a.x - 700) < 1 && Math.abs(close.a.y - 450) < 1,
    "focus must be centered",
  );
  assert.ok(
    Math.abs(close.distance / before - 4) < 0.01,
    "zoom must magnify without resizing source",
  );
  await page.screenshot({ path: "test-results/art-style-closeup.png" });
  const offscreen = neon.objects.find((o) => o.id === "car")!;
  offscreen.motion = {
    points: [
      [-35, 0, 0],
      [35, 0, 0],
    ],
    speed: 2,
    mode: "once",
  };
  await page.evaluate(
    async (source) => window.renderLanternPreview!({ source, time: 0 }),
    JSON.stringify(neon),
  );
  assert.equal(
    await page.evaluate(
      () =>
        (
          window.boxWorld!.inspect() as {
            props: Array<{ id: string; visible: boolean }>;
          }
        ).props.find((p) => p.id === "car")!.visible,
    ),
    false,
  );
  await page.evaluate(
    async (source) => window.renderLanternPreview!({ source, time: 15 }),
    JSON.stringify(neon),
  );
  assert.equal(
    await page.evaluate(
      () =>
        (
          window.boxWorld!.inspect() as {
            props: Array<{ id: string; visible: boolean }>;
          }
        ).props.find((p) => p.id === "car")!.visible,
    ),
    true,
  );
  console.log(JSON.stringify(errors));
  if (errors.length) throw Error("Rendering errors");
} finally {
  await browser.close();
}
