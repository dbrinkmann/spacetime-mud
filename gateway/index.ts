import { createServer } from "node:http";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import { resolve } from "node:path";
import { DbConnection } from "../client/module_bindings/index.ts";
import { verifyDiscordMember, exchangeDiscordCode } from "./discord.ts";

const host = process.env.SPACETIME_HOST ?? "http://127.0.0.1:3030";
const database = process.env.SPACETIME_DATABASE;
if (!database)
  throw new Error(
    "Set SPACETIME_DATABASE explicitly for the community gateway.",
  );
const directory = resolve(process.env.DISCORD_STATE_DIR ?? ".bridge/discord");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const statePath = resolve(directory, "sessions.json");
type State = {
  host: string;
  database: string;
  authorityToken?: string;
  principals: Record<string, { token: string; identity: string }>;
};
const state: State = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8"))
  : { host, database, principals: {} };
if (state.host !== host || state.database !== database)
  throw new Error("Use a distinct DISCORD_STATE_DIR for each database.");
const save = () => {
  writeFileSync(statePath + ".tmp", JSON.stringify(state), { mode: 0o600 });
  renameSync(statePath + ".tmp", statePath);
};
const connect = (token?: string) =>
  new Promise<{ c: DbConnection; token: string }>((resolve, reject) => {
    const c = DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database!)
      .withToken(token)
      .withAutomaticReconnect()
      .onConnect((c, _id, token) => {
        clearTimeout(timeout);
        resolve({ c, token });
      })
      .onConnectError((_c, e) => {
        clearTimeout(timeout);
        reject(e);
      })
      .build();
    const timeout = setTimeout(() => {
      c.disconnect();
      reject(new Error("Database connection timed out."));
    }, 15000);
  });
const authority = await connect(state.authorityToken);
state.authorityToken = authority.token;
save();
if (process.argv.includes("--init")) {
  console.log(`Gateway identity: ${authority.c.identity!.toHexString()}`);
  authority.c.disconnect();
  process.exit(0);
}
const clientId = process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;
const allowedOrigins = new Set(
  (process.env.DISCORD_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
);
if (!clientId || !clientSecret || !allowedOrigins.size)
  throw new Error(
    "Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and DISCORD_ALLOWED_ORIGINS.",
  );
// One process owns this durable token store; serialize creation so two Activity launches
// cannot establish different SpacetimeDB identities for the same Discord member.
let queue = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn);
  queue = next.then(
    () => {},
    () => {},
  );
  return next;
}
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.url === "/health" && req.method === "GET") {
    res.end('{"ok":true}');
    return;
  }
  const origin = req.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) {
    res.writeHead(403).end('{"error":"Origin not allowed"}');
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.writeHead(204).end();
    return;
  }
  if (
    req.method !== "POST" ||
    !["/api/discord/token", "/api/discord/session"].includes(req.url ?? "")
  ) {
    res.writeHead(404).end('{"error":"Not found"}');
    return;
  }
  if (!req.headers["content-type"]?.startsWith("application/json")) {
    res.writeHead(415).end('{"error":"JSON required"}');
    return;
  }
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > 12000) {
        res.writeHead(413).end('{"error":"Request too large"}');
        req.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (req.url === "/api/discord/token") {
      if (typeof body.code !== "string")
        throw new Error("Authorization code required.");
      res.end(
        JSON.stringify({
          access_token: await exchangeDiscordCode(
            clientId,
            clientSecret,
            body.code,
          ),
        }),
      );
      return;
    }
    if (
      typeof body.accessToken !== "string" ||
      typeof body.guildId !== "string"
    )
      throw new Error("Discord authorization required.");
    const verified = await verifyDiscordMember(body.accessToken, body.guildId);
    const result = await serialized(async () => {
      const key = `${verified.guildId}:${verified.userId}`;
      let principal = state.principals[key];
      if (!principal) {
        const user = await connect();
        principal = {
          token: user.token,
          identity: user.c.identity!.toHexString(),
        };
        state.principals[key] = principal;
        save();
        user.c.disconnect();
      }
      const { Identity } = await import("spacetimedb");
      const identity = Identity.fromString(principal.identity);
      if (verified.admin) {
        try {
          await authority.c.reducers.provisionCommunity({
            communityId: verified.guildId,
            name: verified.guildName,
            admin: identity,
            discordUserId: verified.userId,
          });
        } catch (e) {
          if (!String(e).includes("Community already exists")) throw e;
        }
      }
      await authority.c.reducers.setCommunityMember({
        communityId: verified.guildId,
        identity,
        discordUserId: verified.userId,
        admin: verified.admin,
        active: true,
      });
      return {
        token: principal.token,
        communityId: verified.guildId,
        name: verified.name,
        renewAfterSeconds: 60,
      };
    });
    res.end(JSON.stringify(result));
  } catch {
    // Do not reflect OAuth errors, tokens or private credentials into logs/responses.
    res
      .writeHead(401)
      .end(
        JSON.stringify({
          error:
            "Could not verify community access. An administrator must initialize the community and the gateway must be authorized.",
        }),
      );
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(
  Number(process.env.PORT ?? 8787),
  process.env.HOST ?? "127.0.0.1",
  () => console.log("Discord gateway listening."),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close();
    authority.c.disconnect();
  });
