import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { guidePackage } from "../shared/runtime/guide-example";
import { canonical, sha256 } from "../shared/runtime/digest";
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
  const guideManifest = { ...guidePackage.manifest, id: `${prefix}.guide` };
  const guideHash = sha256(
    canonical({ manifest: guideManifest, source: guidePackage.source }),
  );
  call(
    "publish_package",
    JSON.stringify({
      format: 2,
      manifest: guideManifest,
      source: guidePackage.source,
      hash: guideHash,
      license: "MIT",
      documentation: "Interactive guide example",
    }),
    "community",
    guild,
  );
  call("attach_behavior", `${prefix}.switch`, "guide", guideHash, "{}");
  call(
    "create_entity",
    `${prefix}.entrance`,
    property,
    "room",
    JSON.stringify({
      transform: { position: [-3, 0, -2], rotation: [0, 0, 0] },
      visual: {
        boxes: [{ position: [0, 1, 0], size: [1, 2, 0.2], color: "#778899" }],
      },
      collider: { size: [1, 0.2], center: [0, 0, 0], enabled: true },
      interaction: { approach: [0, 0, 1] },
      homeEntrance: { name: "Courtyard door" },
    }),
  );
  await page.getByLabel("Property").fill(property);
  call(
    "create_entity",
    `${prefix}.bench`,
    property,
    "room",
    JSON.stringify({
      transform: { position: [-3, 0, 0], rotation: [0, 0, 0] },
      visual: {
        boxes: [
          { position: [0, 0.45, 0], size: [1.2, 0.2, 0.5], color: "#667788" },
        ],
      },
      interaction: { approach: [0, 0, 1] },
      seat: { position: [0, 0.2, 0], yaw: 0 },
    }),
  );
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
  await page.locator("canvas").click({
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
  await page
    .getByLabel("Object", { exact: true })
    .selectOption(`${prefix}.switch`);
  await page.getByRole("button", { name: "talk", exact: true }).click();
  await page.getByRole("region", { name: "Object dialogue" }).waitFor();
  await page.getByText("Visit 1", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Directions", exact: true }).click();
  await page.getByText("The switch opens the door.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "talk", exact: true }).click();
  await page.getByText("Visit 2", { exact: true }).waitFor();
  await page.getByRole("button", { name: "introduce", exact: true }).click();
  await page.getByLabel("Your answer", { exact: true }).fill("Builder");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page.getByText("Welcome, Builder", { exact: true }).waitFor();
  await page
    .getByLabel("Object", { exact: true })
    .selectOption(`${prefix}.entrance`);
  await page.getByLabel("Home name", { exact: true }).fill("Builder's home");
  await page.getByRole("button", { name: "Claim home", exact: true }).click();
  await page.getByRole("button", { name: "enter", exact: true }).click();
  await page.getByText("Room: home", { exact: true }).waitFor();
  const returnId = await page
    .locator('select[aria-label="Object"] option')
    .evaluateAll((options) =>
      options
        .map((o) => (o as HTMLOptionElement).value)
        .find((id) => id.startsWith("return")),
    );
  assert.ok(returnId);
  await page.getByLabel("Object", { exact: true }).selectOption(returnId!);
  await page.getByRole("button", { name: "enter", exact: true }).click();
  await page.getByText("Room: room", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Property", { exact: true }).inputValue(),
    property,
  );
  await page.locator("header").click();
  await page.keyboard.press("Enter");
  await page
    .getByRole("textbox", { name: "Say something" })
    .fill("Hello from the room");
  await page.getByRole("textbox", { name: "Say something" }).press("Enter");
  await page.getByText("Hello from the room", { exact: true }).waitFor();
  await page
    .getByLabel("Object", { exact: true })
    .selectOption(`${prefix}.bench`);
  await page.getByRole("button", { name: "sit", exact: true }).click();
  await page
    .getByTestId("walking-state")
    .filter({ hasText: "Approaching object" })
    .waitFor();
  await page
    .getByTestId("walking-state")
    .filter({ hasText: "Standing" })
    .waitFor();
  await page.waitForFunction(
    () => document.documentElement.scrollHeight <= innerHeight + 1,
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  );
  assert.deepEqual(errors, []);
  await page.goto(`http://127.0.0.1:5179/?runtime&community=${guild}`);
  await page.getByText("Room: home", { exact: true }).waitFor();
  const homeProperty = await page
    .getByLabel("Property", { exact: true })
    .inputValue();
  call(
    "create_entity",
    `${prefix}.hot`,
    homeProperty,
    "home",
    JSON.stringify({
      transform: { position: [2, 0, 2], rotation: [0, 0, 0] },
      text: "Subscription update",
    }),
  );
  await page
    .getByRole("option", { name: `${prefix}.hot`, exact: true })
    .waitFor({ state: "attached" });
  const sensed = JSON.parse(
    execFileSync(
      cli,
      [
        "sql",
        "lantern-runtime-refactor",
        `SELECT data FROM slot WHERE id = '${prefix}.switch:guide'`,
        "--format",
        "json",
        "--server",
        "http://127.0.0.1:3030",
        "--no-config",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  assert.ok(
    JSON.parse(sensed[0].rows[0][0]).state.arrivals > 0,
    "scheduled view events must see the walking player",
  );
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
