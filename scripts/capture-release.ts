import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { builderRoom } from "../tests/builder-fixture.ts";
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    (process.env.GAME_URL ?? "https://lantern-staging.dbrinkmann.workers.dev") +
      "/?preview",
  );
  await page.waitForFunction(() => !!window.renderLanternPreview);
  mkdirSync("public/release", { recursive: true });
  for (const [name, source] of [
    ["lantern-inn", readFileSync("public/poc/examples/room.json", "utf8")],
    ["authored-characters", JSON.stringify(builderRoom())],
  ]) {
    await page.evaluate(
      (source) => window.renderLanternPreview!({ source, time: 0.7 }),
      source,
    );
    await page.screenshot({ path: `public/release/${name}.png` });
  }
  if (errors.length) throw Error(errors.join("; "));
  console.log("Captured two 1600x900 real-renderer screenshots.");
} finally {
  await browser.close();
}
