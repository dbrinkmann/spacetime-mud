import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { execFileSync } from "node:child_process";
if (existsSync(".env.local")) loadEnvFile(".env.local");
const clientId =
  process.env.DISCORD_CLIENT_ID ?? process.env.VITE_DISCORD_CLIENT_ID;
if (!clientId || !/^\d+$/.test(clientId))
  throw new Error(
    "Configure the Discord application ID before building staging.",
  );
const env = {
  ...process.env,
  VITE_DISCORD_CLIENT_ID: clientId,
  VITE_SPACETIME_HOST: "https://maincloud.spacetimedb.com",
  VITE_SPACETIME_DATABASE: "dbrinkmann-lantern-staging",
  VITE_COMMUNITY_ONLY: "true",
};
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  { stdio: "inherit", env },
);
execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  stdio: "inherit",
  env,
});
