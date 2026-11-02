import { chromium, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { connect, host, database, until } from "./connect.ts";
const site = process.env.GAME_URL ?? "http://127.0.0.1:5175/";
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const a = await connect(),
  b = await connect();
mkdirSync("test-results", { recursive: true });
try {
  const suffix = Date.now().toString(36),
    errors: string[] = [];
  await a.c.reducers.createPlayer({ name: `Host ${suffix}` });
  await b.c.reducers.createPlayer({ name: `Friend ${suffix}` });
  await a.c.reducers.createZone({
    name: `Lantern ${suffix}`,
    description: "A gathering place built from boxes.",
  });
  const roomId = [...a.c.db.visiblePlayers.iter()].find((p) =>
    p.identity.equals(a.c.identity!),
  )!.roomId;
  const zone = [...a.c.db.zone.iter()].find((z) => z.entrance === roomId)!;
  await a.c.reducers.saveDraft({
    roomId,
    objectId: 0n,
    kind: "scenery",
    name: "Hearth",
    description: "A warm fire.",
    actions: [{ id: "warm", label: "Warm your hands" }],
    source: 'function on_warm(ctx){ctx.say("The hearth warms your hands.");}',
  });
  const version = [...a.c.db.myVersions.iter()][0];
  await a.c.reducers.testDraft({ versionId: version.id, event: "on_warm" });
  await a.c.reducers.publishVersion({ versionId: version.id });
  const definition = JSON.parse(
    readFileSync("public/poc/examples/room.json", "utf8"),
  );
  definition.objects.find(
    (o: { model: string }) => o.model === "fireplace",
  ).objectId = String(version.objectId);
  await b.c.reducers.visitZone({ zoneId: zone.id });
  const context = await browser.newContext({
      viewport: { width: 1680, height: 1100 },
    }),
    guestContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
  await guestContext.addInitScript(() => {
    const real = Date.now;
    Date.now = () => real() + 300000;
  });
  const tokenKey = `spacetime-mud:${host}:${database}`;
  for (const [ctx, token] of [
    [context, a.token],
    [guestContext, b.token],
  ] as const)
    await ctx.addInitScript(
      ({ key, token }) => localStorage.setItem(key, token),
      { key: tokenKey, token },
    );
  const page = await context.newPage(),
    other = await guestContext.newPage();
  for (const p of [page, other]) {
    p.setDefaultTimeout(20000);
    p.on("pageerror", (e) => errors.push(e.message));
  }
  page.on("console", (m) => {
    if (m.type() === "error") console.log("browser:", m.text());
  });
  await page.goto(site + (site.includes("?") ? "&" : "?") + "workshop=1");
  await other.goto(site);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "visuals", exact: true }).click();
  await page
    .getByLabel("Geometry JSON", { exact: true })
    .fill(JSON.stringify(definition));
  await page.getByRole("button", { name: "Preview JSON", exact: true }).click();
  await page.waitForFunction(() => !!window.boxWorld);
  await page
    .getByRole("button", { name: "Save visual draft", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Preview saved draft", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Preview saved draft", exact: true })
    .click();
  console.log("Publishing visual");
  await page
    .getByRole("button", { name: "Publish visual", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Published.");
  await page.getByRole("button", { name: "My character", exact: true }).click();
  await page
    .getByLabel("Geometry JSON", { exact: true })
    .fill(readFileSync("public/poc/examples/wizard.json", "utf8"));
  await page
    .getByRole("button", { name: "Save visual draft", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Preview saved draft", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Preview saved draft", exact: true })
    .click();
  console.log("Publishing visual");
  await page
    .getByRole("button", { name: "Publish visual", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Published.");
  console.log("Exploring");
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page.waitForFunction(() => !!window.boxWorld);
  await other.waitForFunction(() => !!window.boxWorld);
  await until(() => b.c.db.visibleScenes.roomId.find(roomId));
  await expect(other.locator(".live-toolbar").first()).toContainText(
    "2 travelers",
  );
  const canvas = page.getByRole("img", { name: "Interactive 3D room" });
  let p = await page.evaluate(() => window.boxWorld!.project([2.7, 0, 3]));
  await page.mouse.click(p.x, p.y);
  await expect(canvas).toHaveAttribute("data-animation", "walk");
  await expect(canvas).toHaveAttribute("data-animation", "idle", {
    timeout: 15000,
  });
  await other.waitForFunction((id) => {
    const s = window.boxWorld!.inspect() as {
      travelers: { id: string; position: number[] }[];
    };
    return s.travelers.some(
      (t) => t.id === id && Math.abs(t.position[0] - 2.7) < 0.1,
    );
  }, a.c.identity!.toHexString());
  p = await page.evaluate(() => window.boxWorld!.project([-1.7, 0.85, -0.1]));
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "Sit here", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-animation", "sit", {
    timeout: 20000,
  });
  await page.waitForTimeout(700);
  await page.screenshot({
    path: "test-results/shared-world-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Chat message").fill("Welcome to our box-built world.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    other.getByText("Welcome to our box-built world.", { exact: true }),
  ).toBeVisible();
  const hearth = await page.evaluate(() =>
    window.boxWorld!.project([0, 1, -4.35]),
  );
  await page.mouse.click(hearth.x, hearth.y);
  await page
    .locator(".live-room")
    .getByRole("button", { name: "Warm your hands", exact: true })
    .click();
  await expect(
    other.getByText("The hearth warms your hands.", { exact: true }).last(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("img", { name: "Interactive 3D room" }),
  ).toHaveAttribute("data-animation", "sit", { timeout: 15000 });
  await page.getByRole("button", { name: "Stand up", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Interactive 3D room" }),
  ).toHaveAttribute("data-animation", "idle");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: "test-results/shared-world-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS two browser clients: visual draft preview/publication, avatar, synchronized paths, seating, chat, reload and mobile.",
  );
} catch (e) {
  for (const c of browser.contexts())
    for (const p of c.pages())
      await p
        .screenshot({ path: "test-results/visual-failure.png", fullPage: true })
        .catch(() => {});
  throw e;
} finally {
  a.c.disconnect();
  b.c.disconnect();
  await browser.close();
}
