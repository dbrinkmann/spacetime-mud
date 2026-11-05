# Lantern

A room-based 3D world for Discord communities. Members hang out, build homes and create interactive objects with their preferred coding agents. The server runs deterministic, event-driven behaviors; it does not run model inference.

Open Lantern from your Discord server's App Launcher. Runtime v2 is deployed at [the existing Lantern endpoint](https://lantern-staging.dbrinkmann.workers.dev). Embedded Discord verification is tracked separately from hosted browser tests in the [cutover record](docs/runtime-cutover.md).

## Build with an agent

Creators do not need to clone this repository. Use the Activity's connection instructions, install the downloadable [stdio MCP client](https://lantern-staging.dbrinkmann.workers.dev/agent/lantern-runtime.mjs), and read the [runtime authoring guide](https://lantern-staging.dbrinkmann.workers.dev/agent/RUNTIME.md). Call `world_connect`, pair the returned agent identity in the Activity, then call `world_guide` and inspect your community.

Agents author cuboid geometry, six-part characters and cosmetics, materials, signs, entrances and behavior packages. Packages support messages, structured state, timers, motion, views, interactions and runtime world changes. Agents publish live and can request hosted PNG previews. Admins authorize common-space building; members create homes at authored entrances and expand their own room graphs.

The v2 entity/package API replaces the earlier scene/object API. Old room IDs, `objectId` scripts and v1 MCP instructions are not interchangeable with v2. See [the builder handoff](docs/runtime-cutover.md).

## Development

The current server is `world-server`, generated bindings are in `world-client/module_bindings`, the client is in `client/runtime`, and the MCP implementation is `mcp/runtime.ts`. SDK/CLI version: 2.13.0. Earlier implementations remain for reference but are excluded from the runtime release entry point.

```sh
npm ci
npm ci --prefix world-server
spacetime start --listen-addr 127.0.0.1:3030 --data-dir .local-db
spacetime publish lantern-runtime-refactor --server http://127.0.0.1:3030 --module-path world-server --no-config --yes
spacetime generate --lang typescript --out-dir world-client/module_bindings --module-path world-server --yes
npm run dev -- --port 5179
```

The development workbench is `http://127.0.0.1:5179/?runtime`. Runtime tests default to the isolated local database; hosted runs require explicit `LANTERN_RUNTIME_HOST`, `LANTERN_RUNTIME_DATABASE` and `LANTERN_RUNTIME_SITE`. The v2 MCP client uses those same names.

## Verification and release

```sh
npm test
npm run check:runtime
npm run test:runtime:local
npm run test:runtime:access
npm run test:runtime:mcp
npm run test:runtime:browser
npm run test:runtime:social
npm run test:runtime:preview
npm run build:runtime:release
wrangler deploy --config wrangler.jsonc
```

Browser tests require Chromium (`npx playwright install chromium`) and the configured site. The verification-only deployment uses `npm run build:runtime:staging` and `wrangler.runtime.jsonc`. Production uses `wrangler.jsonc`; `build:staging` aliases the production runtime build. Database publication is a separate explicit operation.

**GitHub Actions are disabled.** Validation and deployment run explicitly. See [verification evidence](docs/runtime-verification.md), [the runtime plan](docs/scriptable-world-plan.md), and [release/rollback instructions](docs/runtime-cutover.md). Keep `.env.local`, `.bridge`, authority tokens and database exports out of Git.

The restricted interpreter bundle is committed for deterministic builds. See [third-party notices](docs/third-party.md).
