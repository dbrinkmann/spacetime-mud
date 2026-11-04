import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { cooperationEntities } from "../shared/runtime/cooperation";
import { neutralCharacter } from "../shared/world";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1000, height: 760 },
    }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5179/?runtime-preview");
  await page.waitForFunction(
    () => typeof window.renderRuntimePreview === "function",
  );
  const entities = cooperationEntities("preview", "home", "guild", "owner").map(
    (e) => ({
      id: e.id,
      revision: 1,
      components: e.components,
      operations: [],
      actions: [],
    }),
  );
  entities.push({
    id: "receptionist",
    revision: 1,
    operations: [],
    actions: [],
    components: {
      transform: { position: [2, 0, 0], rotation: [0, 25, 0] },
      character: neutralCharacter("Receptionist") as any,
      animation: "wave",
      "transform.sign": { position: [0, 0, 0], rotation: [0, 0, 0] },
      "sign.sign": {
        text: "WELCOME / ようこそ",
        position: [0, 2.6, 0],
        yaw: 0,
        width: 3,
        height: 0.5,
        color: "#ffffff",
        emissive: true,
      },
      "light.sign": { color: "#5588ff", intensity: 8 },
    },
  });
  const source = JSON.stringify({ entities, serverTime: 0 });
  await page.evaluate((input) => window.renderRuntimePreview!(input), {
    source,
    time: 1,
  });
  mkdirSync(".bridge", { recursive: true });
  const full = await page.screenshot({ path: ".bridge/runtime-preview.png" });
  await page.evaluate((input) => window.renderRuntimePreview!(input), {
    source,
    time: 1,
    focus: [2, 1, 0] as [number, number, number],
    zoom: 2,
    yaw: 30,
  });
  const close = await page.screenshot({
    path: ".bridge/runtime-preview-close.png",
  });
  assert.notDeepEqual(full, close);
  assert.deepEqual(errors, []);
  console.log(
    "Unpublished runtime preview, character, named sign/light, focus/zoom/yaw and frozen animation passed.",
  );
} finally {
  await browser.close();
}
