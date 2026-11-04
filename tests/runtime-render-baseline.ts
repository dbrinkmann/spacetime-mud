import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { cpus, platform, release } from "node:os";
// Comparative thresholds are fixed before collecting replacement-renderer results.
const thresholds = {
  p95FrameIntervalRatio: 1.25,
  coldSceneRatio: 1.25,
  warmSceneRatio: 1.25,
  maxDocumentOverflowPx: 1,
};
const rows = JSON.parse(
  readFileSync("test-results/parity-rooms.json", "utf8").replace(/^\uFEFF/, ""),
)[0].rows as [number, string, number, string][];
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
const measurements: unknown[] = [];
mkdirSync("test-results/runtime-baseline", { recursive: true });
try {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 800, height: 600 },
    { width: 390, height: 700 },
  ]) {
    for (const [id, name, revision, raw] of rows) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("http://127.0.0.1:5179/?preview");
      await page.waitForFunction(() => !!window.renderLanternPreview);
      const scene = JSON.parse(raw);
      // A static geometry baseline cannot execute server bindings. Removing IDs
      // also avoids a known legacy shared desk/NPC validation inconsistency.
      for (const item of [...scene.objects, ...(scene.npcs ?? [])])
        delete item.objectId;
      const source = JSON.stringify(scene);
      const render = () =>
        page.evaluate(async (source) => {
          const start = performance.now();
          await window.renderLanternPreview!({ source, time: 15 });
          return performance.now() - start;
        }, source);
      const coldMs = await render(),
        warmMs = await render();
      const frames = await page.evaluate<number[]>(`new Promise(resolve=>{
        const values=[];let last=performance.now();
        function tick(now){values.push(now-last);last=now;if(values.length<60)requestAnimationFrame(tick);else resolve(values.slice(5).sort((a,b)=>a-b));}requestAnimationFrame(tick);
      })`);
      const overflow = await page.evaluate(() => ({
        x: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        y: Math.max(0, document.documentElement.scrollHeight - innerHeight),
      }));
      const file = `room-${id}-${viewport.width}x${viewport.height}`;
      await page.screenshot({
        path: `test-results/runtime-baseline/${file}.png`,
      });
      measurements.push({
        id,
        name,
        revision,
        viewport,
        coldMs,
        warmMs,
        p50FrameIntervalMs: frames[Math.floor(frames.length * 0.5)],
        p95FrameIntervalMs: frames[Math.floor(frames.length * 0.95)],
        overflow,
        errors,
      });
      await context.close();
    }
  }
  const report = {
    date: new Date().toISOString(),
    environment: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0].model,
      browser: browser.version(),
      rendering:
        "Chromium headless with SwiftShader allowed; compare on the same environment",
    },
    thresholds,
    scope:
      "Static preview geometry; not Discord UI, live subscriptions, server work, or functioning traffic.",
    measurements,
  };
  writeFileSync(
    "test-results/runtime-baseline/report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
