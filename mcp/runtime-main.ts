import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DbConnection } from "../world-client/module_bindings/index";
import { createRuntimeMcp } from "./runtime";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
console.log = (...args) => console.error(...args);
console.info = (...args) => console.error(...args);
// Separate names prevent a legacy SPACETIME_DATABASE environment variable from
// quietly pointing the v2 tools at the currently deployed Activity database.
const host = process.env.LANTERN_RUNTIME_HOST ?? "http://127.0.0.1:3030";
const database =
  process.env.LANTERN_RUNTIME_DATABASE ?? "lantern-runtime-refactor";
const directory =
  process.env.MCP_STATE_DIR ?? join(homedir(), ".lantern-agent", "runtime-v2");
let pending: Promise<DbConnection> | undefined,
  connection: DbConnection | undefined;
let sessionToken = "";
function connect() {
  if (pending) return pending;
  pending = new Promise<DbConnection>((resolve, reject) => {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(
      directory,
      createHash("sha256")
        .update(host + "/" + database)
        .digest("hex") + ".json",
    );
    const token = existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8")).token
      : undefined;
    const timeout = setTimeout(() => {
      connection?.disconnect();
      pending = undefined;
      reject(Error("Runtime connection timed out."));
    }, 15000);
    connection = DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .withToken(token)
      .withAutomaticReconnect()
      .onConnect((c, _identity, token) => {
        void (async () => {
          try {
            const info = JSON.parse(await c.procedures.runtimeInfo({}));
            if (info.apiVersion !== 2) throw Error("Runtime API mismatch.");
            clearTimeout(timeout);
            writeFileSync(file, JSON.stringify({ token }), { mode: 0o600 });
            sessionToken = token;
            resolve(c);
          } catch (e) {
            clearTimeout(timeout);
            c.disconnect();
            pending = undefined;
            reject(e);
          }
        })();
      })
      .onConnectError((_c, e) => {
        clearTimeout(timeout);
        pending = undefined;
        reject(e);
      })
      .build();
  });
  return pending;
}
const server = createRuntimeMcp(
  connect,
  process.env.LANTERN_RUNTIME_SITE
    ? {
        preview: async (input) => {
          const response = await fetch(
            `${process.env.LANTERN_RUNTIME_SITE!.replace(/\/$/, "")}/api/preview`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${sessionToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(input),
              signal: AbortSignal.timeout(90000),
            },
          );
          if (!response.ok)
            throw Error(
              `Preview failed (${response.status}): ${await response.text()}`,
            );
          return Buffer.from(await response.arrayBuffer()).toString("base64");
        },
      }
    : {},
);
await server.connect(new StdioServerTransport());
process.once("SIGTERM", () => {
  connection?.disconnect();
  void server.close();
});
