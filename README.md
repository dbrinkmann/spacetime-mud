# SpacetimeMUD

A shared, room-based 3D world built by its players. Hang out, chat, walk and sit together. Your chosen coding agent builds original rooms, characters, cosmetics and scripted interactions using standard MCP tools.

**[Play](https://dbrinkmann.github.io/spacetime-mud/)**

## Create with your agent

Open **Create** in the game for setup instructions. There is no model-specific prompt box or player-facing JSON editor.

```sh
git clone https://github.com/dbrinkmann/spacetime-mud.git
cd spacetime-mud
npm ci
npm run --silent agent:config
# Optional, for agent-rendered screenshots:
npx playwright install chromium
```

Add the generated command and arguments to your agent's MCP configuration. The server uses standard **stdio MCP** and works with compatible local clients; it is not a hosted HTTP MCP endpoint. No Claude subscription or model API key is required by the game. The agent chooses its model and manages its own usage.

Give your agent the [building skill](public/agent/SKILL.md), or ask it to call `world_guide`. It calls `world_connect` and gives you a pairing link. Open it in your game browser and approve access. Then describe your idea in your agent's normal conversation:

> Create a cozy floating wizard's study with plants, warm lighting and three chairs. Make a new place for me if I don't have one.

The agent can inspect existing definitions, create zones/rooms, validate geometry, save private drafts, render screenshots, and test script handlers. It cannot publish. In **Explore**, choose **Review creation**, try the private preview, then **Keep it**. Ask for revisions in your existing agent conversation. Script drafts have a separate in-world review with test results and **Keep behavior**. Revoke access under Create anytime.

Room edits require ownership or collaborator permission. Everyone can customize their own character. Published props can link to scripted objects by `objectId`; their actions and timers remain authoritative on SpacetimeDB. [Geometry and animation contract](public/poc/AUTHORING.md) / [MCP and API details](docs/agent-building.md).

## Play

Enter a traveler name and take the Nexus portal to **The Lantern & Thorn** to hang out in the shared tavern. **Bellkeeper's Crossing** also demonstrates gates, inventory and scripted timers. Click the floor to walk, select a seat to sit, and use chat to talk. Room passages, maps and Return to Nexus remain available.

Your player identity stays in your browser. Clearing browser storage creates a new identity. Model conversations remain in your chosen agent; the game does not relay prompts or launch inference.

The earlier Claude bridge remains for compatibility with old integrations but is not part of the new player workflow. Developer editors remain accessible only with `?workshop=1`; the isolated geometry sandbox is at `?poc`.

## Local development

SpacetimeDB CLI, server SDK and client SDK are pinned to **2.13.0**. The original implementation remains archived in `legacy/`.

```sh
npm ci
npm ci --prefix spacetimedb
spacetime start --listen-addr 127.0.0.1:3030 --data-dir .local-db
spacetime publish mud-local --server http://127.0.0.1:3030 --module-path spacetimedb --yes
spacetime generate --lang typescript --out-dir client/module_bindings --module-path spacetimedb
```

Set `VITE_SPACETIME_HOST=http://127.0.0.1:3030` and `VITE_SPACETIME_DATABASE=mud-local`, then `npm run dev`. For the MCP server or integration tests, use `SPACETIME_HOST` and `SPACETIME_DATABASE` instead (without the VITE prefix). The MCP server also accepts `GAME_URL` for its pairing link.

## Verification and deployment

```sh
npm test
npm run check:server
npm run build
# Against a disposable database, with SPACETIME_HOST / SPACETIME_DATABASE set:
npm run test:integration
npx tsx tests/timers.ts
npx vitest run
# With the local UI running on port 5174:
npx playwright install chromium
npx tsx tests/browser.ts
# Provider-neutral MCP and player review checks:
npm run test:agent
```

`tests/restart-timer.ts --prepare`, followed by a server restart and `tests/restart-timer.ts`, verifies durable scheduling. `tests/deployed-smoke.ts` checks HTTPS assets against the local build and connects to the production database. See [verification evidence](docs/verification.md).

GitHub Actions tests a disposable database, runs desktop/mobile Chromium checks, verifies generated bindings, and deploys Pages. Database publication is an explicit CLI operation; **do not use `--delete-data=always` on a populated world without authorization**. This release's reset was explicitly requested by the project owner.

The restricted interpreter bundle is committed for deterministic module builds. Regenerate it with `node scripts/bundle-interpreter.mjs` after installing server dependencies. See [third-party notice](docs/third-party.md).
