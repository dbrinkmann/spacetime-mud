import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import {
  cooperationPackages,
  cooperationEntities,
} from "../shared/runtime/cooperation";
const cli =
  process.env.SPACETIME_CLI ??
  "D:\\dev\\personal\\scratch\\tools\\spacetimedb\\spacetimedb-cli.exe";
function call(name: string, ...args: unknown[]) {
  execFileSync(
    cli,
    [
      "call",
      "lantern-runtime-refactor",
      name,
      ...args.map((a) => JSON.stringify(a)),
      "--server",
      "http://127.0.0.1:3030",
      "--no-config",
    ],
    { stdio: "pipe" },
  );
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 800 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5179/?runtime");
  await page
    .getByTestId("identity")
    .filter({ hasText: /^[0-9a-f]{64}$/ })
    .waitFor();
  const identity = (await page.getByTestId("identity").textContent())!;
  const guild = Date.now().toString(),
    property = `common:${guild}`,
    prefix = `demo${guild}`;
  call("provision_community", guild, "Runtime workshop", identity, "100");
  const packages = cooperationPackages(prefix);
  packages.forEach((p) =>
    call("publish_package", JSON.stringify(p), "community", guild),
  );
  cooperationEntities(prefix, property, guild, identity).forEach((e) =>
    call("create_entity", e.id, property, "room", JSON.stringify(e.components)),
  );
  call(
    "attach_behavior",
    `${prefix}.switch`,
    "control",
    packages[0].hash,
    JSON.stringify({ target: `${prefix}.door` }),
  );
  call(
    "attach_behavior",
    `${prefix}.door`,
    "hinge",
    packages[1].hash,
    JSON.stringify({ indicator: `${prefix}.lamp` }),
  );
  call("attach_behavior", `${prefix}.lamp`, "light", packages[2].hash, "{}");
  await page.getByLabel("Property").fill(property);
  await page
    .getByRole("option", { name: `${prefix}.switch`, exact: true })
    .waitFor({ state: "attached" });
  const rect = (await page.locator("canvas").boundingBox())!;
  const camera = new PerspectiveCamera(40, rect.width / rect.height, 0.01, 500);
  camera.position.set(9, 8, 12);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const screen = new Vector3(-2, 0.75, 1).project(camera);
  await page.locator("canvas").click({
    position: {
      x: ((screen.x + 1) * rect.width) / 2,
      y: ((1 - screen.y) * rect.height) / 2,
    },
  });
  assert.equal(
    await page.getByLabel("Object", { exact: true }).inputValue(),
    `${prefix}.switch`,
  );
  await page.getByRole("button", { name: "toggle", exact: true }).click();
  await page
    .getByTestId("walking-state")
    .filter({ hasText: "Approaching object" })
    .waitFor();
  await page
    .getByLabel("Object", { exact: true })
    .selectOption(`${prefix}.lamp`);
  assert.ok(
    (await page.getByTestId("components").textContent())!.includes(
      '"intensity": 0',
    ),
  );
  const destination = new Vector3(3, 0, -3).project(camera);
  await page
    .locator("canvas")
    .click({
      position: {
        x: ((destination.x + 1) * rect.width) / 2,
        y: ((1 - destination.y) * rect.height) / 2,
      },
    });
  await page
    .getByTestId("walking-state")
    .filter({ hasText: /^Walking$/ })
    .waitFor();
  await page
    .getByTestId("walking-state")
    .filter({ hasText: /^Standing$/ })
    .waitFor();
  assert.ok(
    (await page.getByTestId("components").textContent())!.includes(
      '"intensity": 0',
    ),
  );
  await page
    .getByLabel("Object", { exact: true })
    .selectOption(`${prefix}.switch`);
  await page.getByRole("button", { name: "toggle", exact: true }).click();
  await page
    .getByLabel("Object", { exact: true })
    .selectOption(`${prefix}.lamp`);
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="components"]')
      ?.textContent?.includes('"intensity": 12'),
  );
  await page
    .getByLabel("Object", { exact: true })
    .selectOption(`${prefix}.door`);
  await page.waitForFunction(() => {
    const text = document.querySelector(
      '[data-testid="components"]',
    )?.textContent;
    return text && JSON.parse(text).transform.rotation[1] === 90;
  });
  mkdirSync(".bridge", { recursive: true });
  await page.screenshot({ path: ".bridge/runtime-workbench.png" });
  await page.reload();
  await page.getByLabel("Property").fill(property);
  await page
    .getByRole("option", { name: `${prefix}.door`, exact: true })
    .waitFor({ state: "attached" });
  await page
    .getByLabel("Object", { exact: true })
    .selectOption(`${prefix}.door`);
  await page.waitForFunction(() => {
    const text = document.querySelector(
      '[data-testid="components"]',
    )?.textContent;
    return text && JSON.parse(text).transform.rotation[1] === 90;
  });
  await page
    .getByLabel("Object", { exact: true })
    .selectOption(`${prefix}.switch`);
  await page.getByRole("button", { name: "toggle", exact: true }).click();
  await page
    .getByLabel("Object", { exact: true })
    .selectOption(`${prefix}.lamp`);
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="components"]')
      ?.textContent?.includes('"intensity": 0'),
  );
  await page.setViewportSize({ width: 390, height: 700 });
  await page.waitForFunction(
    () => document.documentElement.scrollHeight <= innerHeight + 1,
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      url: `http://127.0.0.1:5179/?runtime&property=${encodeURIComponent(property)}`,
      result:
        "live click, server messaging, door operation, light state, reload persistence and narrow layout passed",
    }),
  );
} finally {
  await browser.close();
}
