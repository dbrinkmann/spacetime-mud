import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { Room } from "../shared/geometry";
import type {
  RoomPresentation,
  PresentedEntity,
} from "../shared/runtime/presentation";
import { neutralCharacter } from "../shared/world";
import { samplePropMotion } from "../shared/scene-features";

// Test-only conversion of the frozen reference artwork, never a runtime importer.
function project(room: Room): RoomPresentation {
  const entities: PresentedEntity[] = [];
  const add = (id: string, components: any) => {
    entities.push({ id, revision: 1, components, operations: [], actions: [] });
  };
  add("floor", {
    walkSurface: { width: room.width, depth: room.depth },
    visual: {
      boxes: [
        {
          position: [0, -0.14, 0],
          size: [room.width, 0.25, room.depth],
          color: room.floorColor,
          material: room.floorMaterial,
          roughness: room.floorRoughness,
          wear: room.floorWear,
        },
      ],
    },
  });
  for (const p of room.objects) {
    const sample = p.motion ? samplePropMotion(p, 15) : null;
    add(p.id, {
      label: p.name,
      visual: room.models[p.model],
      transform: {
        position: sample?.position ?? p.position,
        rotation: [0, sample?.yaw ?? p.yaw, 0],
      },
      wall: p.wall ?? false,
    });
  }
  for (const sign of room.signs ?? []) {
    const { id, attachTo, binding, ...spec } = sign;
    // Existing baseline has no attachments; fail rather than silently miscompare.
    if (attachTo)
      throw Error("Reference signs need a local-coordinate conversion.");
    add(`sign-${id}`, { sign: spec });
  }
  for (const npc of room.npcs ?? [])
    add(npc.id, {
      character: npc.character,
      animation: npc.animation,
      transform: { position: npc.position, rotation: [0, npc.yaw, 0] },
    });
  room.lights.forEach((light, i) =>
    add(`light-${i}`, {
      light: { color: light.color, intensity: light.intensity },
      transform: { position: light.position, rotation: [0, 0, 0] },
    }),
  );
  add("scale-reference", {
    character: neutralCharacter("Scale reference"),
    transform: { position: room.spawn, rotation: [0, 0, 0] },
  });
  return { serverTime: 15, entities };
}
const rows = JSON.parse(
  readFileSync("test-results/parity-rooms.json", "utf8").replace(/^\uFEFF/, ""),
)[0].rows as [number, string, number, string][];
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
const measurements: any[] = [];
mkdirSync("test-results/runtime-comparison", { recursive: true });
try {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 800, height: 600 },
    { width: 390, height: 700 },
  ]) {
    if (
      process.env.RUNTIME_RENDER_WIDTH &&
      viewport.width !== Number(process.env.RUNTIME_RENDER_WIDTH)
    )
      continue;
    for (const [id, name, revision, raw] of rows) {
      if (
        process.env.RUNTIME_RENDER_ROOM &&
        id !== Number(process.env.RUNTIME_RENDER_ROOM)
      )
        continue;
      const room = JSON.parse(raw) as Room;
      for (const p of [...room.objects, ...(room.npcs ?? [])])
        delete p.objectId;
      for (const mode of ["legacy", "runtime"] as const) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(
          `http://127.0.0.1:5179/?${mode === "runtime" ? "runtime-preview" : "preview"}`,
        );
        await page.waitForFunction(
          (mode) =>
            mode === "runtime"
              ? !!window.renderRuntimePreview
              : !!window.renderLanternPreview,
          mode,
        );
        const extent = Math.max(room.width, room.depth),
          aspect = viewport.width / viewport.height;
        const span = Math.max(extent * 0.61, (extent * 0.78) / aspect);
        const source = JSON.stringify(
          mode === "runtime" ? project(room) : room,
        );
        const render = () =>
          page.evaluate(
            async ({ source, mode, zoom }) => {
              const start = performance.now();
              if (mode === "runtime")
                await window.renderRuntimePreview!({ source, time: 15, zoom });
              else await window.renderLanternPreview!({ source, time: 15 });
              return performance.now() - start;
            },
            { source, mode, zoom: Math.max(4.5, 3 / aspect) / span },
          );
        const coldMs = await render(),
          warmMs = await render();
        const frames = await page.evaluate<number[]>(
          `new Promise(resolve=>{const values=[];let last=performance.now();function tick(now){values.push(now-last);last=now;if(values.length<60)requestAnimationFrame(tick);else resolve(values.slice(5).sort((a,b)=>a-b));}requestAnimationFrame(tick);})`,
        );
        const overflow = await page.evaluate(() => ({
          x: Math.max(0, document.documentElement.scrollWidth - innerWidth),
          y: Math.max(0, document.documentElement.scrollHeight - innerHeight),
        }));
        await page.screenshot({
          path: `test-results/runtime-comparison/${mode}-${id}-${viewport.width}.png`,
        });
        const measurement = {
          mode,
          id,
          name,
          revision,
          viewport,
          coldMs,
          warmMs,
          p95FrameIntervalMs: frames[Math.floor(frames.length * 0.95)],
          overflow,
          errors,
        };
        measurements.push(measurement);
        console.log(JSON.stringify(measurement));
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  writeFileSync(
    "test-results/runtime-comparison/report.json",
    JSON.stringify({ date: new Date().toISOString(), measurements }, null, 2),
  );
}
