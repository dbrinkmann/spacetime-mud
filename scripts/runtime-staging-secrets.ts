import { loadEnvFile } from "node:process";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
loadEnvFile(".env.local");
const clientId = process.env.DISCORD_CLIENT_ID!,
  secret = process.env.DISCORD_CLIENT_SECRET!;
if (!/^\d+$/.test(clientId) || !secret)
  throw Error("Discord credentials are required.");
const directory = ".bridge/runtime-v2";
mkdirSync(directory, { recursive: true });
const path = `${directory}/authority.json`;
let authority: { identity: string; token: string };
if (existsSync(path)) authority = JSON.parse(readFileSync(path, "utf8"));
else {
  const response = await fetch(
    "https://maincloud.spacetimedb.com/v1/identity",
    { method: "POST" },
  );
  if (!response.ok) throw Error("Could not create isolated gateway identity.");
  authority = await response.json();
  writeFileSync(path, JSON.stringify(authority), { mode: 0o600 });
}
execFileSync(
  process.env.SPACETIME_CLI ??
    "D:\\dev\\personal\\scratch\\tools\\spacetimedb\\spacetimedb-cli.exe",
  [
    "call",
    "dbrinkmann-lantern-runtime-v2",
    "set_community_gateway",
    JSON.stringify(authority.identity),
    "--server",
    "https://maincloud.spacetimedb.com",
    "--no-config",
  ],
  { stdio: "pipe", windowsHide: true },
);
writeFileSync(
  `${directory}/secrets.json`,
  JSON.stringify({
    DISCORD_CLIENT_ID: clientId,
    DISCORD_CLIENT_SECRET: secret,
    DISCORD_TEST_GUILD_ID: process.env.DISCORD_TEST_GUILD_ID ?? "",
    DISCORD_ALLOWED_ORIGINS: `https://${clientId}.discordsays.com,https://${clientId}.discordsez.com`,
    SPACETIME_AUTHORITY_TOKEN: authority.token,
  }),
  { mode: 0o600 },
);
console.log(
  "Isolated replacement gateway authorized; upload file prepared in ignored storage.",
);
