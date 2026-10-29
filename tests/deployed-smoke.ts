import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, basename } from "node:path";
import { connect, host, database } from "./connect.ts";

const site =
  process.env.GAME_URL ?? "https://dbrinkmann.github.io/spacetime-mud/";
const response = await fetch(site);
assert.equal(response.status, 200);
const html = await response.text();
assert.match(html, /<title>SpacetimeMUD/);
const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(
  (m) => new URL(m[1], site),
);
assert.ok(assets.length >= 2, "Built JavaScript and stylesheet are present");
for (const url of assets) {
  const asset = await fetch(url);
  assert.equal(asset.status, 200, `${url}`);
  const remote = Buffer.from(await asset.arrayBuffer());
  const local = readFileSync(join("dist", "assets", basename(url.pathname)));
  assert.equal(
    createHash("sha256").update(remote).digest("hex"),
    createHash("sha256").update(local).digest("hex"),
    "Published artifact matches locally validated build",
  );
}
const { c } = await connect();
try {
  const nexus = c.db.room.id.find(1n);
  assert.ok(nexus);
  assert.equal(nexus.name, "The Nexus");
  assert.equal(c.db.myInbox.count(), 0n);
  assert.equal(c.db.myJobs.count(), 0n);
  assert.equal(c.db.agentJobs.count(), 0n);
  console.log(
    `PASS: ${site} returns HTTP 200, all JS/CSS assets match the validated build, and ${host}/${database} accepts a new client and synchronizes the Nexus without exposing private messages/jobs. Rooms: ${c.db.room.count()}.`,
  );
} finally {
  c.disconnect();
}
