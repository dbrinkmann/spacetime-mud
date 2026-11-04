import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
const base =
  process.env.RELEASE_URL ?? "https://lantern-staging.dbrinkmann.workers.dev";
for (const file of [
  "privacy/index.html",
  "terms/index.html",
  "support/index.html",
  "release.css",
  "release/lantern-inn.png",
  "release/authored-characters.png",
]) {
  const response = await fetch(base + "/" + file);
  assert.equal(response.status, 200);
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    readFileSync("public/" + file),
  );
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  mkdirSync("test-results", { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const slug of ["privacy", "terms", "support"]) {
      const response = await page.goto(base + "/" + slug + "/");
      assert.equal(response.status(), 200);
      await page.getByRole("heading", { level: 1 }).waitFor();
      assert.equal(
        await page.locator("link[rel=stylesheet]").getAttribute("href"),
        "/release.css",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      assert.ok(
        (await page.locator("body").innerText()).includes(
          "emergent.worlds@proton.me",
        ),
      );
      await page.screenshot({
        path: `test-results/release-${slug}-${width}.png`,
        fullPage: true,
      });
    }
  }
  console.log(
    "PASS: hosted release files match local files; all pages render on desktop/mobile with correct contact and no overflow.",
  );
} finally {
  await browser.close();
}
