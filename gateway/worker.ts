import { preview } from "./preview";
import type { BrowserWorker } from "@cloudflare/puppeteer";
import { exchangeDiscordCode, verifyDiscordMember } from "./discord";
import type { D1Database } from "@cloudflare/workers-types";

type Env = {
  BROWSER: BrowserWorker;
  ASSETS: { fetch(request: Request): Promise<Response> };
  SESSIONS: D1Database;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_ALLOWED_ORIGINS: string;
  DISCORD_TEST_GUILD_ID: string;
  SPACETIME_HOST: string;
  SPACETIME_DATABASE: string;
  SPACETIME_AUTHORITY_TOKEN: string;
};
type Principal = { identity: string; token: string };
const reply = (body: unknown, status = 200, origin?: string) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(origin
        ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
        : {}),
    },
  });

export function membershipArgs(
  reducer: "provision_community" | "set_community_member",
  args: unknown[],
) {
  const identityIndex = reducer === "provision_community" ? 2 : 1;
  return `[${args
    .map((value, index) => {
      if (index !== identityIndex) return JSON.stringify(value);
      if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
        throw new Error("Invalid member identity.");
      // SATS-JSON identity is a one-field product holding a formatted U256 string.
      // The displayed hex identity is the integer's hexadecimal representation.
      const integer = BigInt(`0x${value}`);
      return JSON.stringify([`0x${integer.toString(16)}`]);
    })
    .join(",")}]`;
}
export async function callReducer(
  env: Pick<
    Env,
    "SPACETIME_HOST" | "SPACETIME_DATABASE" | "SPACETIME_AUTHORITY_TOKEN"
  >,
  reducer: "provision_community" | "set_community_member",
  args: unknown[],
  request: typeof fetch = fetch,
) {
  const result = await request(
    `${env.SPACETIME_HOST}/v1/database/${encodeURIComponent(env.SPACETIME_DATABASE)}/call/${reducer}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SPACETIME_AUTHORITY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: membershipArgs(reducer, args),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!result.ok) {
    const detail = await result.text();
    if (
      reducer === "provision_community" &&
      detail.includes("Community already exists")
    )
      return;
    throw new Error("World authorization failed.");
  }
}

async function principalFor(env: Env, key: string): Promise<Principal> {
  const read = () =>
    env.SESSIONS.prepare(
      "SELECT identity, token FROM principal WHERE member_key = ?",
    )
      .bind(key)
      .first<Principal>();
  const existing = await read();
  if (existing) return existing;
  const r = await fetch(`${env.SPACETIME_HOST}/v1/identity`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error("World identity service unavailable.");
  const issued = (await r.json()) as Principal;
  if (!/^[a-f0-9]{64}$/.test(issued.identity) || !issued.token)
    throw new Error("Invalid identity response.");
  // The unique key chooses one identity even when multiple Activity launches race.
  await env.SESSIONS.prepare(
    "INSERT INTO principal(member_key, identity, token) VALUES (?, ?, ?) ON CONFLICT(member_key) DO NOTHING",
  )
    .bind(key, issued.identity, issued.token)
    .run();
  return (await read())!;
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get("Content-Type")?.startsWith("application/json"))
    throw new Error("JSON required.");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Request body required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 12000) {
      await reader.cancel();
      throw new Error("Request too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const body = JSON.parse(new TextDecoder().decode(bytes));
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("Invalid request.");
  return body;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/preview") return preview(req, env);
    if (url.pathname === "/health")
      return reply({ ok: true, environment: "staging" });
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    const origin = req.headers.get("Origin") ?? "";
    const allowed = new Set(
      (env.DISCORD_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()),
    );
    if (!origin || !allowed.has(origin))
      return reply({ error: "Origin not allowed." }, 403);
    if (req.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type",
          Vary: "Origin",
        },
      });
    if (
      req.method !== "POST" ||
      !["/api/discord/token", "/api/discord/session"].includes(url.pathname)
    )
      return reply({ error: "Not found." }, 404, origin);
    try {
      const body = await readBody(req);
      if (url.pathname === "/api/discord/token") {
        if (typeof body.code !== "string")
          throw new Error("Authorization code required.");
        return reply(
          {
            access_token: await exchangeDiscordCode(
              env.DISCORD_CLIENT_ID,
              env.DISCORD_CLIENT_SECRET,
              body.code,
            ),
          },
          200,
          origin,
        );
      }
      if (
        typeof body.accessToken !== "string" ||
        typeof body.guildId !== "string"
      )
        throw new Error("Discord authorization required.");
      if (
        env.DISCORD_TEST_GUILD_ID &&
        body.guildId !== env.DISCORD_TEST_GUILD_ID
      )
        throw new Error("This staging world is restricted to the test server.");
      const member = await verifyDiscordMember(body.accessToken, body.guildId);
      const principal = await principalFor(
        env,
        `${member.guildId}:${member.userId}`,
      );
      if (member.admin)
        await callReducer(env, "provision_community", [
          member.guildId,
          member.guildName,
          principal.identity,
          member.userId,
        ]);
      await callReducer(env, "set_community_member", [
        member.guildId,
        principal.identity,
        member.userId,
        member.admin,
        true,
      ]);
      return reply(
        {
          token: principal.token,
          communityId: member.guildId,
          name: member.name,
          renewAfterSeconds: 60,
        },
        200,
        origin,
      );
    } catch {
      return reply(
        {
          error:
            "Could not verify community access. An administrator must open the Activity first.",
        },
        401,
        origin,
      );
    }
  },
};
