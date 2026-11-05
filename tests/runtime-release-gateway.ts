import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
loadEnvFile(".env.local");
const site = process.env.LANTERN_RUNTIME_SITE;
if (!site || !/^https:\/\/[a-z0-9-]+\.dbrinkmann\.workers\.dev$/.test(site))
  throw Error("Explicit Lantern hosted endpoint required.");
const health = await (await fetch(`${site}/health`)).json();
assert.equal(health.apiVersion, "2");
assert.equal(health.database, "dbrinkmann-lantern-runtime-v2");
const origin = `https://${process.env.DISCORD_CLIENT_ID ?? process.env.VITE_DISCORD_CLIENT_ID}.discordsays.com`;
const stale = await fetch(`${site}/api/discord/session`, {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({ accessToken: "invalid-release-probe", guildId: "1" }),
});
assert.equal(stale.status, 409);
assert.match((await stale.json()).error, /Close and reopen/);
const unauthorized = await fetch(`${site}/api/preview`, { method: "POST" });
assert.equal(unauthorized.status, 401);
const bundle = await fetch(`${site}/agent/lantern-runtime.mjs`);
assert(bundle.ok);
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const digest = sha(new Uint8Array(await bundle.arrayBuffer()));
assert.equal(
  digest,
  sha(readFileSync("dist-runtime-v2/agent/lantern-runtime.mjs")),
);
const guide = await (await fetch(`${site}/agent/RUNTIME.md`)).text();
assert.equal(guide, readFileSync("dist-runtime-v2/agent/RUNTIME.md", "utf8"));
const result = {
  passed: true,
  site,
  health,
  staleSessionStatus: 409,
  unauthorizedPreviewStatus: 401,
  bundleSha256: digest,
  checkedAt: new Date().toISOString(),
};
writeFileSync(
  ".bridge/runtime-v2/gateway-release-check.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
