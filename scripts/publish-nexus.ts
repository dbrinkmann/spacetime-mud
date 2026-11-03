import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseDefinition } from "../shared/geometry.ts";
import { validateNavigation } from "../shared/navigation.ts";
const database = process.env.SPACETIME_DATABASE,
  server = process.env.SPACETIME_HOST;
if (!database || !server)
  throw Error(
    "Set SPACETIME_DATABASE and SPACETIME_HOST explicitly. This publishes the Nexus.",
  );
const cli = (...args: string[]) =>
  execFileSync(process.env.SPACETIME_CLI ?? "spacetimedb-cli", args, {
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true,
  });
const call = (name: string, ...args: string[]) =>
  cli("call", "--no-config", database, name, ...args, "--server", server);
const sql = (query: string) =>
  cli("sql", "--no-config", database, query, "--server", server);
const ids = (text: string) =>
  [...text.matchAll(/^\s*(\d+)\s*$/gm)].map((m) => BigInt(m[1]));
const target = process.env.NEXUS_DESTINATION_ROOM ?? "7";
if (!/^[1-9][0-9]*$/.test(target)) throw Error("Invalid target room ID.");
const name = "Portal to The Lantern Above";
const existing = ids(
  sql(`SELECT id FROM object WHERE room_id = 1 AND name = '${name}'`),
);
if (existing.length > 1)
  throw Error("Multiple matching portal objects; inspect before publishing.");
try {
  call("create_player", JSON.stringify("World architect"));
} catch (e) {
  if (!String(e).includes("already have a character")) throw e;
}
call("home");
call(
  "save_draft",
  "1",
  String(existing[0] ?? 0n),
  JSON.stringify("scenery"),
  JSON.stringify(name),
  JSON.stringify(
    "A lantern hangs above the shimmering doorway. Beyond it, a warm inn waits beneath a cloudglass study.",
  ),
  JSON.stringify([{ id: "travel", label: "Enter The Lantern Above" }]),
  JSON.stringify(`function on_travel(ctx){ctx.movePlayer("${target}");}`),
);
const versions = ids(sql(`SELECT id FROM version WHERE name = '${name}'`));
const version = versions.sort((a, b) => (a > b ? -1 : 1))[0];
if (!version) throw Error("Portal version missing.");
call("test_draft", String(version), JSON.stringify("on_travel"));
call("publish_version", String(version));
const objectId = ids(
  sql(`SELECT id FROM object WHERE room_id = 1 AND name = '${name}'`),
)[0];
const room = parseDefinition(
  readFileSync(new URL("../world/nexus/room.json", import.meta.url), "utf8"),
  "room",
);
room.objects.find((o) => o.id === "lantern-portal")!.objectId =
  String(objectId);
validateNavigation(room);
call(
  "save_visual_draft",
  "1",
  JSON.stringify("scene"),
  JSON.stringify(JSON.stringify(room)),
);
const keys = [
  ...sql(
    "SELECT key FROM visual_draft WHERE room_id = 1 AND kind = 'scene'",
  ).matchAll(/"([^"]+)"/g),
].map((m) => m[1]);
if (keys.length !== 1)
  throw Error("Expected one Nexus scene draft; inspect before publication.");
const revision = ids(
  sql("SELECT revision FROM visual_draft WHERE room_id = 1 AND kind = 'scene'"),
)[0];
call("publish_visual", JSON.stringify(keys[0]), String(revision));
console.log(
  `Published Nexus scene and tested portal ${objectId} to room ${target}.`,
);
