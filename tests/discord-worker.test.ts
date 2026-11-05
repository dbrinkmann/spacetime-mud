import test from "node:test";
import assert from "node:assert/strict";
import { Identity } from "spacetimedb";
import worker, { membershipArgs, callReducer } from "../gateway/worker.ts";

test("runtime cutover rejects stale Activity renewal before touching identity services", async () => {
  const origin = "https://123.discordsays.com";
  const env = {
    RUNTIME_API_VERSION: "2",
    DISCORD_ALLOWED_ORIGINS: origin,
  } as any;
  const response = await worker.fetch(
    new Request("https://example.invalid/api/discord/session", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: "test", guildId: "123" }),
    }),
    env,
  );
  assert.equal(response.status, 409);
  assert.match(((await response.json()) as any).error, /Close and reopen/);
});

test("gateway HTTP arguments preserve all 256 identity bits in SATS-JSON", () => {
  const identity =
    "c20096ebf6f0e749af1081b85095970a80e6e8f96260b3404941522f9ecee4a3";
  const args = JSON.parse(
    membershipArgs("provision_community", [
      "123",
      'A "quoted" community',
      identity,
      "456",
    ]),
  );
  assert.equal(args[1], 'A "quoted" community');
  assert.equal(BigInt(args[2][0]), Identity.fromString(identity).__identity__);
  const member = JSON.parse(
    membershipArgs("set_community_member", [
      "123",
      identity,
      "456",
      true,
      false,
    ]),
  );
  assert.equal(
    BigInt(member[1][0]),
    Identity.fromString(identity).__identity__,
  );
  assert.equal(member[4], false);
  assert.throws(
    () => membershipArgs("set_community_member", ["123", "invalid"]),
    /identity/,
  );
});

test("gateway accepts only successful reducers or an already-provisioned community", async () => {
  const env = {
    SPACETIME_HOST: "https://example.invalid",
    SPACETIME_DATABASE: "test",
    SPACETIME_AUTHORITY_TOKEN: "private",
  };
  const id = "00".repeat(32);
  const exists = (async () =>
    new Response("Community already exists.", { status: 400 })) as typeof fetch;
  await callReducer(env, "provision_community", ["1", "Test", id, "2"], exists);
  await assert.rejects(
    callReducer(
      env,
      "set_community_member",
      ["1", id, "2", true, true],
      exists,
    ),
    /authorization/,
  );
});
