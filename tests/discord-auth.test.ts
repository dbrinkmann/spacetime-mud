import test from "node:test";
import assert from "node:assert/strict";
import {
  exchangeDiscordCode,
  verifyDiscordMember,
} from "../gateway/discord.ts";
function fake(
  memberId = "10",
  permissions = "0",
  pending = false,
): typeof fetch {
  return (async (url: string | URL | Request) => {
    const path = String(url);
    if (path.endsWith("/users/@me"))
      return Response.json({ id: "10", username: "alice" });
    if (path.endsWith("/member"))
      return Response.json({ user: { id: memberId }, nick: "Alice", pending });
    return Response.json([{ id: "20", name: "Village", permissions }]);
  }) as typeof fetch;
}
test("Discord identity, membership and admin authority come from verified API responses", async () => {
  assert.deepEqual(await verifyDiscordMember("token", "20", fake()), {
    userId: "10",
    guildId: "20",
    guildName: "Village",
    name: "Alice",
    admin: false,
  });
  assert.equal(
    (await verifyDiscordMember("token", "20", fake("10", "32"))).admin,
    true,
  );
  assert.equal(
    (await verifyDiscordMember("token", "20", fake("10", "8"))).admin,
    true,
  );
  await assert.rejects(
    verifyDiscordMember("token", "20", fake("other")),
    /membership/,
  );
  await assert.rejects(
    verifyDiscordMember("token", "20", fake("10", "0", true)),
    /membership/,
  );
  await assert.rejects(verifyDiscordMember("token", "21", fake()), /not found/);
});
test("Discord failures fail closed and code exchange never returns the client secret", async () => {
  const denied = (async () =>
    new Response("private upstream error", { status: 403 })) as typeof fetch;
  await assert.rejects(
    verifyDiscordMember("token", "20", denied),
    /could not be verified/,
  );
  await assert.rejects(
    exchangeDiscordCode("id", "secret", "code", denied),
    /^Error: Discord authorization failed\.$/,
  );
  const ok = (async (_url: unknown, init: RequestInit) => {
    const params = init.body as URLSearchParams;
    assert.equal(params.get("client_secret"), "secret");
    assert.equal(params.get("grant_type"), "authorization_code");
    return Response.json({
      access_token: "result",
      refresh_token: "not exposed",
    });
  }) as typeof fetch;
  assert.equal(await exchangeDiscordCode("id", "secret", "code", ok), "result");
});
