import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DbConnection } from "../world-client/module_bindings";
import { Identity } from "spacetimedb";
import { movingPackage } from "./fixtures/runtime-mover";
import { neutralCharacter } from "../shared/world";
import { guidePackage } from "../shared/runtime/guide-example";
const host = "https://maincloud.spacetimedb.com",
  database = "dbrinkmann-lantern-runtime-v2",
  site = "https://lantern-runtime-v2.dbrinkmann.workers.dev";
const duration = Number(process.env.RUNTIME_SOAK_SECONDS ?? 60);
const guild = Date.now().toString(),
  property = `common:${guild}`,
  prefix = `parity${guild}`,
  directory = resolve(".bridge", prefix);
mkdirSync(directory, { recursive: true });
const cli =
  process.env.SPACETIME_CLI ??
  "D:\\dev\\personal\\scratch\\tools\\spacetimedb\\spacetimedb-cli.exe";
function call(name: string, ...args: unknown[]) {
  execFileSync(
    cli,
    [
      "call",
      database,
      name,
      ...args.map((a) => JSON.stringify(a)),
      "--server",
      host,
      "--no-config",
    ],
    { stdio: "pipe", windowsHide: true },
  );
}
const connections: DbConnection[] = [];
async function connect() {
  return new Promise<DbConnection>((resolve, reject) => {
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .onConnect((c) => {
        connections.push(c);
        resolve(c);
      })
      .onConnectError((_c, e) => reject(e))
      .build();
  });
}
const download = await fetch(`${site}/agent/lantern-runtime.mjs`);
assert(download.ok);
const bundle = resolve(directory, "lantern-runtime.mjs");
writeFileSync(bundle, await download.text());
const client = new Client({
  name: "independent-release-fixture",
  version: "1.0.0",
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [bundle],
  cwd: directory,
  env: {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (x): x is [string, string] => typeof x[1] === "string",
      ),
    ),
    LANTERN_RUNTIME_HOST: host,
    LANTERN_RUNTIME_DATABASE: database,
    LANTERN_RUNTIME_SITE: site,
    MCP_STATE_DIR: resolve(directory, "identity"),
  },
  stderr: "pipe",
});
async function tool(name: string, args: Record<string, unknown> = {}) {
  const r = await client.callTool({ name, arguments: args }, undefined, {
    timeout: 120000,
  });
  assert(!r.isError, `${name}: ${JSON.stringify(r)}`);
  return JSON.parse((r.content as any[])[0].text);
}
const movers: string[] = [];
let renewal: ReturnType<typeof setInterval> | undefined;
try {
  await client.connect(transport);
  const identity = await tool("world_connect");
  await tool("world_guide");
  const admin = await connect(),
    member = await connect();
  call(
    "provision_community",
    guild,
    "Runtime parity",
    admin.identity!.toHexString(),
    "1",
  );
  const renew = () => {
    call(
      "set_community_member",
      guild,
      admin.identity!.toHexString(),
      "1",
      true,
      true,
    );
    call(
      "set_community_member",
      guild,
      member.identity!.toHexString(),
      "2",
      false,
      true,
    );
  };
  renew();
  renewal = setInterval(renew, 60000);
  await admin.reducers.authorizeCommunityAgent({
    communityId: guild,
    agent: Identity.fromString(identity.agent_id),
    commonSpace: true,
  });
  for (const [room, width, depth] of [
    ["station", 20, 14],
    ["street", 60, 16],
  ] as const)
    await tool("world_create_room", {
      property,
      room,
      name: room,
      width,
      depth,
    });
  const box = (
    position: number[],
    size: number[],
    color: string,
    material = "concrete",
    extra = {},
  ) => ({ position, size, color, material, ...extra });
  const create = async (
    name: string,
    room: string,
    components: Record<string, unknown>,
  ) => {
    const id = `${prefix}.${name}`;
    await tool("world_create_entity", { id, property, room, components });
    return id;
  };
  const pose = (position: number[]) => ({ position, rotation: [0, 0, 0] });
  const sign = (text: string, position = [0, 2.7, 0]) => ({
    text,
    position,
    yaw: 0,
    width: 3,
    height: 0.5,
    color: "#88ddff",
    emissive: true,
  });
  await create("road", "street", {
    transform: pose([0, 0.01, 0]),
    visual: {
      boxes: [
        box([0, 0, 0], [60, 0.05, 8], "#202a30", "asphalt", {
          roughness: 0.92,
        }),
      ],
    },
  });
  for (let i = 0; i < 12; i++) {
    const x = -27 + i * 4.8;
    await create(`building${i}`, "street", {
      transform: pose([x, 0, -6]),
      visual: {
        boxes: [
          box([0, 4, 0], [4, 8, 3], "#303945", "concrete"),
          ...Array.from({ length: 12 }, (_, j) =>
            box(
              [((j % 3) - 1) * 1, 2 + Math.floor(j / 3) * 1.4, 1.52],
              [0.6, 0.7, 0.04],
              j % 2 ? "#77bbbb" : "#ffd899",
              "glass",
              { emissive: true },
            ),
          ),
          box([0, 0.8, 1.6], [2, 1.6, 0.15], "#364554", "metal"),
        ],
      },
      collider: { center: [0, 0, 0], size: [4, 3], enabled: true },
      sign: sign(`SECTOR ${i + 1}`, [0, 7, 1.6]),
    });
  }
  for (let i = 0; i < 8; i++) {
    const id = await create(`entrance${i}`, "street", {
      transform: pose([-25 + i * 7, 0, 6]),
      visual: {
        boxes: [box([0, 1.2, 0], [1.3, 2.4, 0.25], "#36494d", "metal")],
      },
      interaction: { approach: [0, 0, -1] },
      homeEntrance: { name: `Residence ${i + 1}` },
      label: `Residence ${i + 1}`,
    });
    await create(`name${i}`, "street", {
      transform: pose([-25 + i * 7, 0, 6]),
      sign: { ...sign("VACANT"), homeEntrance: id },
    });
  }
  for (const room of ["station", "street"]) {
    for (let i = 0; i < (room === "station" ? 2 : 3); i++)
      await create(`${room}seat${i}`, room, {
        transform: pose([-5 + i * 4, 0, 4]),
        visual: {
          boxes: [
            box([0, 0.45, 0], [1.6, 0.2, 0.6], "#655746", "wood"),
            box([0, 0.6, 0.3], [1.6, 0.5, 0.12], "#554e46", "fabric"),
          ],
        },
        seat: { position: [0, 0.4, 0], yaw: 0 },
        interaction: { approach: [0, 0, -1] },
        label: "Sit",
      });
    for (let i = 0; i < 6; i++)
      await create(`${room}light${i}`, room, {
        transform: pose([-8 + i * 3, 3, -4]),
        light: { color: i % 2 ? "#66aaff" : "#ffbb66", intensity: 5 },
        visual: {
          boxes: [
            box([0, 0, 0], [0.2, 0.2, 0.2], "#aaccff", "plain", {
              emissive: true,
            }),
          ],
        },
      });
  }
  for (let i = 0; i < 12; i++)
    await create(`stationprop${i}`, "station", {
      transform: pose([-8 + (i % 6) * 3, 0, i < 6 ? -5 : 5]),
      visual: {
        boxes: [
          box([0, 1, 0], [1, 2, 0.4], "#59646a", i % 2 ? "metal" : "wood"),
        ],
      },
      ...(i < 4
        ? { sign: sign(["WELCOME", "PLATFORM", "HOMES", "INFORMATION"][i]) }
        : {}),
    });
  await create("backwall", "station", {
    transform: pose([0, 0, -6.8]),
    "transform.wall": pose([0, 0, 0]),
    "visual.wall": { boxes: [box([0, 2, 0], [20, 4, 0.2], "#404952")] },
    "wall.wall": true,
    "sign.wall": sign("WELCOME STATION\nようこそ", [0, 2, 0.15]),
  });
  for (const [room, dest] of [
    ["station", "street"],
    ["street", "station"],
  ])
    await create(`${room}exit`, room, {
      transform: pose([8, 0, 4]),
      visual: { boxes: [box([0, 0.2, 0], [2, 0.4, 2], "#657078", "metal")] },
      interaction: { approach: [-1.5, 0, 0] },
      exit: { property, room: dest },
      label: `To ${dest}`,
    });
  const reception = await create("reception", "station", {
    transform: pose([0, 0, -3]),
    character: neutralCharacter("Guide"),
    animation: "wave",
    visual: { boxes: [box([0, 0.5, 1], [3, 1, 1], "#555b61", "metal")] },
    interaction: { approach: [0, 0, 2] },
    label: "Receptionist",
  });
  const guide = await tool("world_publish_package", {
    community: guild,
    visibility: "community",
    package: {
      manifest: { ...guidePackage.manifest, id: `${prefix}.guide` },
      source: guidePackage.source,
      license: "MIT",
      documentation: "Shared receptionist.",
    },
  });
  await tool("world_attach_behavior", {
    entity: reception,
    slot: "guide",
    hash: guide.hash,
    config: {},
  });
  const found = await tool("world_search_packages", {
    community: guild,
    query: prefix,
  });
  assert(found.items.some((p: any) => p.hash === guide.hash));
  await tool("world_detach_behavior", { slot: `${reception}:guide` });
  await tool("world_attach_behavior", {
    entity: reception,
    slot: "guide",
    hash: guide.hash,
    config: {},
  });
  const moving = movingPackage();
  moving.manifest.id = `${prefix}.mover`;
  const pkg = await tool("world_publish_package", {
    community: guild,
    visibility: "community",
    package: {
      manifest: moving.manifest,
      source: moving.source,
      license: "MIT",
      documentation:
        "General path follower with view subscription, reservation and repeated lifecycle.",
    },
  });
  for (let i = 0; i < 6; i++) {
    const y = i >= 4 ? 12.5 + (i - 4) * 1.5 : 0.5,
      z = i % 2 ? 2 : -2,
      start = i % 2 ? 40 : -40;
    const id = await create(`mover${i}`, "street", {
      transform: pose([start, y, z]),
      tags: ["mover"],
      visibility: false,
      visual: {
        boxes: [
          box(
            [0, 0.35, 0],
            [1.5, 0.6, 3],
            i % 2 ? "#ddaa33" : "#3355aa",
            "metal",
          ),
          box([0, 0.8, 0], [1.3, 0.5, 1.5], "#668899", "glass"),
          box([0, 0.1, -1.5], [1, 0.1, 0.1], "#44ccff", "plain", {
            emissive: true,
          }),
        ],
      },
    });
    movers.push(id);
    await tool("world_attach_behavior", {
      entity: id,
      slot: "movement",
      hash: pkg.hash,
      config: { start, end: -start, y, z },
    });
  }
  await admin.reducers.joinWorld({ community: guild });
  await member.reducers.joinWorld({ community: guild });
  await admin.reducers.enterWalkRoom({ property, room: "street" });
  await member.reducers.enterWalkRoom({ property, room: "station" });
  for (const room of ["station", "street"]) {
    const r = await client.callTool(
      {
        name: "world_preview",
        arguments: {
          community: guild,
          property,
          room,
          focus: room === "street" ? [0, 2, 0] : [0, 1, 0],
          zoom: room === "street" ? 0.65 : 0.8,
          yaw: 25,
        },
      },
      undefined,
      { timeout: 120000 },
    );
    assert(!r.isError, JSON.stringify(r));
    const png = (r.content as any[]).find((c) => c.type === "image");
    assert(png);
    writeFileSync(
      resolve(directory, `${room}.png`),
      Buffer.from(png.data, "base64"),
    );
  }
  console.log(
    JSON.stringify({
      phase: "published-preview-passed",
      guild,
      property,
      entities: "station and 60x16 street",
      directory,
      duration,
    }),
  );
  const begin = Date.now();
  let samples = 0,
    minCycles = 0;
  while (Date.now() - begin < duration * 1000) {
    const states = await Promise.all(
      movers.map((id) => tool("world_inspect", { id })),
    );
    for (const state of states) {
      assert.equal(state.slots[0].lastError, "");
      assert.equal(state.views.length, 1);
      assert(state.pending < 16);
    }
    minCycles = Math.min(...states.map((s) => s.slots[0].state.cycles));
    samples++;
    if (samples % 6 === 0)
      console.log(
        JSON.stringify({
          phase: "soak",
          seconds: Math.round((Date.now() - begin) / 1000),
          minCycles,
        }),
      );
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (duration >= 600) assert(minCycles >= 20);
  writeFileSync(
    resolve(directory, "result.json"),
    JSON.stringify(
      {
        passed: true,
        guild,
        property,
        duration,
        elapsedSeconds: (Date.now() - begin) / 1000,
        samples,
        minCycles,
        host,
        database,
        site,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ phase: "passed", directory, minCycles, samples }),
  );
} finally {
  if (renewal) clearInterval(renewal);
  for (const id of movers) {
    try {
      await tool("world_set_behavior_enabled", {
        slot: `${id}:movement`,
        enabled: false,
      });
    } catch {}
  }
  for (const c of connections) c.disconnect();
  await client.close();
  await transport.close();
}
