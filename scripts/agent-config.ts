import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
console.log(
  JSON.stringify(
    {
      mcpServers: {
        "spacetime-world": {
          command: process.execPath,
          args: [
            "--import",
            pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href,
            resolve("mcp/index.ts"),
          ],
        },
      },
    },
    null,
    2,
  ),
);
