import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const site = process.env.GAME_URL ?? "http://127.0.0.1:5174/";
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const errors: string[] = [];
mkdirSync("test-results", { recursive: true });
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(site + (site.includes("?") ? "&" : "?") + "workshop=1");
  await page.getByText("Live", { exact: true }).waitFor();
  await page
    .getByLabel("What should we call you?")
    .fill(`Browser ${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Enter world →" }).click();
  await page.getByRole("heading", { name: "The Nexus", exact: true }).waitFor();
  await page.getByRole("button", { name: /Bellkeeper’s Crossing/ }).click();
  await page
    .getByRole("heading", { name: "Bellkeeper’s Crossing", exact: true })
    .waitFor();
  await page.screenshot({
    path: "test-results/explore-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Stand on the plate" }).click();
  await page
    .getByText("Stone sinks beneath your weight.", { exact: false })
    .last()
    .waitFor();
  await page.getByRole("button", { name: "Move north", exact: true }).click();
  await page
    .getByRole("heading", { name: "The Moonlit Garden", exact: true })
    .waitFor();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Open the chest" }).click();
  await page
    .locator(".inventory-item")
    .filter({ hasText: "Moonleaf charm" })
    .waitFor();
  await page.getByLabel("Chat message").fill("A fine night for wandering.");
  await page.getByRole("button", { name: "Send message" }).click();
  await page
    .getByText("A fine night for wandering.", { exact: true })
    .last()
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/explore-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile has no horizontal overflow",
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  if (!process.env.BROWSER_SMOKE_ONLY) {
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page
      .getByRole("button", { name: "Create a zone", exact: true })
      .click();
    await page
      .getByLabel("Zone name")
      .fill(`Browser realm ${Date.now().toString(36)}`);
    await page
      .getByLabel("Entrance description")
      .fill("A warm workshop overlooking a misty valley.");
    await page
      .getByRole("button", { name: "Create zone", exact: true })
      .click();
    await page.getByLabel("Behavior script").waitFor();
    await page.getByRole("button", { name: "Save new draft" }).click();
    await page.getByRole("button", { name: "Test saved draft" }).click();
    await page.getByText(/PASS on_touch/).waitFor();
    await page.getByRole("button", { name: "Publish tested version" }).click();
    await page.getByRole("heading", { name: /Draft #.*live/ }).waitFor();
    await page.screenshot({
      path: "test-results/builder-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Explore", exact: true }).click();
    await page.getByRole("button", { name: "Touch the stone" }).click();
    await page
      .getByText("A clear note rises from the stone.", { exact: true })
      .waitFor();
    await page
      .getByText("The stone falls silent.", { exact: true })
      .waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByRole("button", { name: "Touch the stone" }).waitFor();
  } else {
    await page
      .getByRole("button", { name: "Return to Nexus", exact: true })
      .click();
    await page.reload();
    await page
      .getByRole("heading", { name: "The Nexus", exact: true })
      .waitFor();
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS real Chromium: explore, map movement, gate, inventory, chat, mobile layout, reload${process.env.BROWSER_SMOKE_ONLY ? "" : ", draft/preview/publish and scripted timer"} at ${site}`,
  );
} finally {
  await browser.close();
}
