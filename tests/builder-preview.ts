import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { connect, host, database } from "./connect.ts";
import { builderRoom } from "./builder-fixture.ts";
const { c, token } = await connect();
const guild = String(Date.now());
const op = (name: string, ...args: unknown[]) =>
  execFileSync(
    process.env.SPACETIME_CLI!,
    [
      "call",
      "--no-config",
      database,
      name,
      ...args.map((a) => JSON.stringify(a)),
      "--server",
      host,
    ],
    { stdio: "pipe", windowsHide: true },
  );
const url =
  (process.env.PREVIEW_URL ??
    "https://lantern-staging.dbrinkmann.workers.dev") + "/api/preview";
const source = JSON.stringify(builderRoom());
const request = (authorization = token, community_id = guild) =>
  fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authorization}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ community_id, source, time: 1.5 }),
    signal: AbortSignal.timeout(90000),
  });
try {
  op(
    "provision_community",
    guild,
    "Preview verification",
    c.identity!.toHexString(),
    "901",
  );
  assert.equal(
    await c.procedures.previewPrincipal({ communityId: guild }),
    c.identity!.toHexString(),
  );
  assert.equal((await request("invalid")).status, 403);
  const response = await request();
  if (!response.ok) throw Error(`${response.status}: ${await response.text()}`);
  assert.match(response.headers.get("Content-Type")!, /image\/png/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  assert(bytes.length > 10000);
  writeFileSync("test-results/hosted-builder-preview.png", bytes);
  op(
    "set_community_member",
    guild,
    c.identity!.toHexString(),
    "901",
    false,
    false,
  );
  assert.equal((await request()).status, 403);
  console.log(
    "PASS hosted WebGL PNG with Japanese sign and animated NPC; invalid/revoked identities denied.",
  );
} finally {
  c.disconnect();
}
