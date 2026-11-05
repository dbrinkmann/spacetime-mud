import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { DbConnection } from "../world-client/module_bindings";
const guild = process.env.RUNTIME_SOAK_COMMUNITY;
if (!guild || !/^\d+$/.test(guild))
  throw Error("Provide the isolated soak community ID.");
const host = "https://maincloud.spacetimedb.com",
  database = "dbrinkmann-lantern-runtime-v2";
let token: string | undefined;
const records: unknown[] = [];
for (let i = 0; i < 10; i++) {
  const c = await new Promise<DbConnection>((resolve, reject) => {
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .withToken(token)
      .onConnect((c, _identity, t) => {
        token = t;
        resolve(c);
      })
      .onConnectError((_c, e) => reject(e))
      .build();
  });
  try {
    execFileSync(
      process.env.SPACETIME_CLI ??
        "D:\\dev\\personal\\scratch\\tools\\spacetimedb\\spacetimedb-cli.exe",
      [
        "call",
        database,
        "set_community_member",
        JSON.stringify(guild),
        JSON.stringify(c.identity!.toHexString()),
        '"3"',
        "false",
        "true",
        "--server",
        host,
        "--no-config",
      ],
      { stdio: "pipe", windowsHide: true },
    );
    await c.reducers.joinWorld({ community: guild });
    await c.reducers.enterWalkRoom({
      property: `common:${guild}`,
      room: i % 2 ? "station" : "street",
    });
    const room = await c.procedures.previewRoom({
      property: `common:${guild}`,
      room: i % 2 ? "station" : "street",
    });
    assert(room);
    records.push({ cycle: i + 1, at: new Date().toISOString() });
  } finally {
    c.disconnect();
  }
  await new Promise((r) => setTimeout(r, 10000));
}
writeFileSync(
  `.bridge/parity${guild}/churn.json`,
  JSON.stringify({ passed: true, records }, null, 2),
);
console.log(
  "Ten reconnect/room-entry cycles completed during the ongoing two-player soak.",
);
