import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { callReducer } from "../gateway/worker.ts";
import { DbConnection } from "../client/module_bindings/index.ts";
loadEnvFile(".env.local");
const base = "https://lantern-staging.dbrinkmann.workers.dev";
const origin = `https://${process.env.DISCORD_CLIENT_ID}.discordsays.com`;
const health = await fetch(`${base}/health`);
assert.equal(health.status, 200);
assert.equal((await health.json()).environment, "staging");
const html = await fetch(base);
assert.equal(html.status, 200);
for (const file of readdirSync("dist/assets")) {
  const expected = readFileSync(`dist/assets/${file}`);
  assert(
    !expected.includes(process.env.DISCORD_CLIENT_SECRET!),
    "Browser asset contains a secret",
  );
  const result = await fetch(`${base}/assets/${file}`);
  assert.equal(result.status, 200);
  assert.equal(
    createHash("sha256")
      .update(Buffer.from(await result.arrayBuffer()))
      .digest("hex"),
    createHash("sha256").update(expected).digest("hex"),
  );
}
const denied = await fetch(`${base}/api/discord/session`, {
  method: "POST",
  headers: {
    Origin: "https://untrusted.invalid",
    "Content-Type": "application/json",
  },
  body: "{}",
});
assert.equal(denied.status, 403);
const unauth = await fetch(`${base}/api/discord/session`, {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(unauth.status, 401);
const preflight = await fetch(`${base}/api/discord/session`, {
  method: "OPTIONS",
  headers: { Origin: origin },
});
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
const authority = JSON.parse(
  readFileSync(".bridge/discord-staging/authority.json", "utf8"),
);
const env = {
  SPACETIME_HOST: "https://maincloud.spacetimedb.com",
  SPACETIME_DATABASE: "dbrinkmann-lantern-staging",
  SPACETIME_AUTHORITY_TOKEN: authority.token,
};
await callReducer(env, "provision_community", [
  "999000000000000003",
  "Staging transport verification",
  authority.identity,
  "999000000000000002",
]);
await callReducer(env, "set_community_member", [
  "999000000000000003",
  authority.identity,
  "999000000000000002",
  true,
  true,
]);
await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => {
    c.disconnect();
    reject(new Error("Membership subscription timed out."));
  }, 15000);
  const c = DbConnection.builder()
    .withUri(env.SPACETIME_HOST)
    .withDatabaseName(env.SPACETIME_DATABASE)
    .withToken(authority.token)
    .onConnect((c) => {
      c.subscriptionBuilder()
        .onApplied(() => {
          try {
            assert(c.db.myCommunities.id.find("999000000000000003"));
            resolve();
          } catch (e) {
            reject(e);
          } finally {
            clearTimeout(timeout);
            c.disconnect();
          }
        })
        .onError((ctx) => {
          clearTimeout(timeout);
          c.disconnect();
          reject(ctx.event);
        })
        .subscribe("SELECT * FROM my_communities");
    })
    .onConnectError((_c, e) => {
      clearTimeout(timeout);
      reject(e);
    })
    .build();
});
await callReducer(env, "set_community_member", [
  "999000000000000003",
  authority.identity,
  "999000000000000002",
  true,
  false,
]);
console.log(
  "PASS hosted assets match build; health, origin checks, unauthenticated denial, CORS, and authorized Maincloud HTTP reducers.",
);
console.log(
  "Discord interactive sign-in still requires URL mappings and an in-Discord launch.",
);
