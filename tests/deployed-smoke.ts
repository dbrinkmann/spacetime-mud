import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, basename } from "node:path";
import { connect, host, database } from "./connect.ts";
const site =
  process.env.GAME_URL ?? "https://dbrinkmann.github.io/spacetime-mud/";
// Platform curl handles this environment's TLS routing reliably. No shell is used.
function download(url: string) {
  const result = execFileSync(
    process.platform === "win32" ? "curl.exe" : "curl",
    [
      "--fail",
      "--ipv4",
      "--http1.1",
      "--retry-all-errors",
      "--silent",
      "--show-error",
      "--location",
      "--retry",
      "2",
      "--max-time",
      "30",
      "--write-out",
      "\n%{http_code}",
      url,
    ],
    { maxBuffer: 8 * 1024 * 1024, windowsHide: true },
  );
  const status = Number(result.subarray(-3).toString());
  assert.equal(status, 200, url);
  return result.subarray(0, -4);
}
const html = download(site).toString("utf8");
assert.match(html, /<title>SpacetimeMUD/);
const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(
  (m) => new URL(m[1], site),
);
assert(assets.length >= 2);
for (const url of assets) {
  assert.equal(url.origin, new URL(site).origin);
  const remote = download(url.href),
    local = readFileSync(join("dist", "assets", basename(url.pathname)));
  assert.equal(
    createHash("sha256").update(remote).digest("hex"),
    createHash("sha256").update(local).digest("hex"),
    "Published asset matches the locally validated build",
  );
}
console.log(`PASS HTTPS 200 and SHA-256 asset verification: ${site}`);
const { c } = await connect();
try {
  const nexus = c.db.visibleRooms.id.find(1n);
  assert(nexus);
  assert.equal(nexus.name, "The Nexus");
  assert.equal(c.db.myInbox.count(), 0n);
  assert.equal(c.db.myJobs.count(), 0n);
  assert.equal(c.db.agentJobs.count(), 0n);
  assert.equal(c.db.myVersions.count(), 0n);
  assert.equal(c.db.visibleRooms.count(), 1n);
  console.log(
    `PASS fresh production subscription exposes only the Nexus and no private jobs, messages or scripts: ${host}/${database}`,
  );
} finally {
  c.disconnect();
}
