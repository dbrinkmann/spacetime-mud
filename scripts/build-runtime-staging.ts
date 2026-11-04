import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { execFileSync } from "node:child_process";
import "./build-runtime-agent.ts";
if (existsSync(".env.local")) loadEnvFile(".env.local");
const clientId =
  process.env.DISCORD_CLIENT_ID ?? process.env.VITE_DISCORD_CLIENT_ID;
if (!clientId || !/^\d+$/.test(clientId))
  throw Error("Discord application ID required.");
const env = {
  ...process.env,
  VITE_DISCORD_CLIENT_ID: clientId,
  VITE_RUNTIME_HOST: "https://maincloud.spacetimedb.com",
  VITE_RUNTIME_DATABASE: "dbrinkmann-lantern-runtime-v2",
  VITE_RUNTIME_SITE: "https://lantern-runtime-v2.dbrinkmann.workers.dev",
  VITE_COMMUNITY_ONLY: "true",
};
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  { stdio: "inherit", env },
);
execFileSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build", "--outDir", "dist-runtime-v2"],
  { stdio: "inherit", env },
);
