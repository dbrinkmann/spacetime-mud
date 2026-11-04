import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { sha256, canonical } from "../shared/runtime/digest.ts";
import type { PackageManifest } from "../shared/runtime/contracts.ts";
// Intentionally fixed to the isolated local module; never targets Maincloud.
const cli =
  process.env.SPACETIME_CLI ??
  "D:\\dev\\personal\\scratch\\tools\\spacetimedb\\spacetimedb-cli.exe";
const target = ["--server", "http://127.0.0.1:3030", "--no-config"];
const database = "lantern-runtime-refactor";
function call(name: string, ...args: unknown[]) {
  return execFileSync(
    cli,
    ["call", database, name, ...args.map((a) => JSON.stringify(a)), ...target],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}
function rows(table: string): any[] {
  const result = JSON.parse(
    execFileSync(
      cli,
      [
        "sql",
        database,
        `SELECT * FROM ${table}`,
        "--format",
        "json",
        ...target,
      ],
      { encoding: "utf8" },
    ),
  );
  return result[0].rows;
}
function data(table: string, id: string) {
  const row = rows(table).find((r) => r[0] === id);
  return row ? JSON.parse(row[row.length - 1]) : undefined;
}
async function until(check: () => boolean) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Runtime scheduler timeout");
}
const suffix = Date.now().toString(36),
  lamp = `lamp${suffix}`,
  button = `switch${suffix}`;
const manifest: PackageManifest = {
  id: `fixture${suffix}`,
  version: "1.0.0",
  apiVersion: 2,
  stateVersion: 1,
  config: { type: "object", properties: {} },
  state: { type: "object", properties: { count: { type: "number" } } },
  initialState: {},
  writes: ["light", "transform"],
  handlers: {
    "message:light.on": { handler: "on_message", input: { type: "null" } },
    "timer:tick": { handler: "on_tick", input: { type: "null" } },
    "operation:completed": {
      handler: "on_complete",
      input: {
        type: "object",
        properties: {
          id: { type: "string" },
          resource: { type: "string" },
          outcome: { type: "string" },
        },
      },
    },
  },
};
const source =
  'function on_message(ctx){ctx.components.set("light",{color:"#ffaa00",intensity:4});ctx.state.set("count",1);ctx.timers.after(.25,"tick",null);} function on_tick(ctx){ctx.state.set("count",2);ctx.operations.animate("transform",{position:[2,0,0],rotation:[0,90,0]},.1);} function on_complete(ctx){ctx.state.set("count",3);}';
const hash = sha256(canonical({ source, manifest }));
call(
  "publish_package",
  JSON.stringify({
    format: 2,
    source,
    manifest,
    hash,
    license: "MIT",
    documentation: "Integration fixture",
  }),
  "private",
);
call(
  "create_entity",
  lamp,
  "fixture",
  "room",
  JSON.stringify({
    light: { color: "#ffffff", intensity: 0 },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0] },
  }),
);
call("attach_behavior", lamp, "light", hash, "{}");
const switchManifest: PackageManifest = {
  ...manifest,
  id: `switchPkg${suffix}`,
  writes: [],
  handlers: { "action:use": { handler: "on_use", input: { type: "null" } } },
};
const switchSource = `function on_use(ctx){ctx.messages.send("${lamp}","light.on",null);}`;
call(
  "publish_package",
  JSON.stringify({
    format: 2,
    source: switchSource,
    manifest: switchManifest,
    hash: sha256(canonical({ source: switchSource, manifest: switchManifest })),
    license: "MIT",
    documentation: "Integration fixture",
  }),
  "private",
);
call("create_entity", button, "fixture", "room", "{}");
call(
  "attach_behavior",
  button,
  "control",
  sha256(canonical({ source: switchSource, manifest: switchManifest })),
  "{}",
);
await until(
  () =>
    data("slot", `${lamp}:light`)?.enabled &&
    data("slot", `${button}:control`)?.enabled,
);
call("invoke_action", button, "use", "null");
await until(() => data("slot", `${lamp}:light`)?.state.count === 3);
assert.equal(data("entity", lamp).components.light.intensity, 4);
assert.throws(() => call("invoke_action", button, "use", "{}"));
assert.equal(data("slot", `${button}:control`).enabled, true);
call("suspend_behavior", `${lamp}:light`);
await until(() => data("slot", `${lamp}:light`)?.enabled === false);
call("resume_behavior", `${lamp}:light`);
await until(() => data("slot", `${lamp}:light`)?.enabled === true);
assert.equal(data("slot", `${lamp}:light`).state.count, 3);
assert.deepEqual(data("entity", lamp).components.transform.position, [2, 0, 0]);
assert.throws(() =>
  execFileSync(
    cli,
    [
      "call",
      database,
      "create_entity",
      JSON.stringify("unauthorized"),
      JSON.stringify("fixture"),
      JSON.stringify("room"),
      JSON.stringify("{}"),
      ...target,
      "--anonymous",
    ],
    { stdio: "pipe" },
  ),
);
console.log(
  JSON.stringify({
    database,
    button,
    lamp,
    result:
      "scheduled activation, action, message, timer, transform operation, suspend/resume and authorization verified",
  }),
);
