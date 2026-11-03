import { loadEnvFile } from "node:process";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
loadEnvFile(".env.local");
const clientId = process.env.DISCORD_CLIENT_ID!;
const secret = process.env.DISCORD_CLIENT_SECRET!;
if (!/^\d+$/.test(clientId) || !secret || /your_|placeholder/.test(secret))
  throw new Error("Save valid Discord credentials in .env.local first.");
const dir = ".bridge/discord-staging";
mkdirSync(dir, { recursive: true });
const file = `${dir}/authority.json`;
let authority: { identity: string; token: string };
if (existsSync(file)) authority = JSON.parse(readFileSync(file, "utf8"));
else {
  const response = await fetch(
    "https://maincloud.spacetimedb.com/v1/identity",
    { method: "POST" },
  );
  if (!response.ok) throw new Error("Identity creation failed.");
  authority = await response.json();
  writeFileSync(file, JSON.stringify(authority), { mode: 0o600 });
}
execFileSync(
  process.env.SPACETIME_CLI ?? "spacetimedb-cli",
  [
    "call",
    "--no-config",
    "dbrinkmann-lantern-staging",
    "set_community_gateway",
    JSON.stringify(authority.identity),
    "--server",
    "maincloud",
  ],
  { stdio: "pipe", windowsHide: true },
);
const guild = process.env.DISCORD_TEST_GUILD_ID ?? "";
writeFileSync(
  `${dir}/secrets.json`,
  JSON.stringify({
    DISCORD_CLIENT_ID: clientId,
    DISCORD_CLIENT_SECRET: secret,
    DISCORD_TEST_GUILD_ID: /^\d+$/.test(guild) ? guild : "",
    DISCORD_ALLOWED_ORIGINS: `https://${clientId}.discordsays.com,https://${clientId}.discordsez.com`,
    SPACETIME_AUTHORITY_TOKEN: authority.token,
  }),
  { mode: 0o600 },
);
console.log(
  "Staging gateway authorized; secret upload file prepared in ignored storage.",
);
console.log(
  /^\d+$/.test(guild)
    ? "Test server restriction configured."
    : "Test server ID is still missing.",
);
