# SpacetimeMUD

A persistent fantasy MUD built by its players. Explore a room map, interact with scripted objects, and use your own local Claude Code to build a realm that keeps working after you log off.

**[Play the live demo](https://dbrinkmann.github.io/spacetime-mud/)** · [Database](https://spacetimedb.com/dbrinkmann-spacetime-mud)

## Box-world proof of concept

Run `npm ci` and `npm run dev -- --port 5174`, then open [the local 3D workshop](http://localhost:5174/?poc). Edit room and character JSON, preview six-part animations and rigid cosmetics, and test walking and seating. See the [authoring contract](public/poc/AUTHORING.md). This local prototype is separate from the deployed multiplayer game.

## Play

Enter a traveler name, then take the Nexus portal to **Bellkeeper’s Crossing**. Stand on the pressure plate to open the garden gate for twelve seconds. Find your moonleaf keepsake in the chest, or visit the tower and ring the bell to summon its raven keeper.

Use passage buttons, the map, WASD/arrow keys, or touch controls. The map reveals rooms as you explore and supports multiple floors. Ordinary text in the chronicle is chat, not a command language. Return to Nexus always works, including in a realm with a broken script.

Your character token stays in this browser. Clearing browser storage creates a different identity. Everyone can create zones; existing zones require owner/collaborator permission to edit.

## Build

Open **Build → Zones**, create a realm, and its portal appears in the Nexus. Use Rooms to extend or arrange it. Objects supports scenery, items, containers, characters, exits and room behaviors. Start with a template, or write a behavior yourself.

1. Save a new object draft.
2. Inspect the saved source and actions.
3. Preview a declared handler (for example `on_touch`). Preview uses an isolated state/effect overlay and never changes the world.
4. Publish the tested version.
5. Explore and use the object. Inspect its event log back in the workshop.

Version history can reactivate a previously tested definition. Publishing/rollback cancels that object's outstanding timers and preserves earned inventory and persistent state. Test important actions and timers separately: preview is an event simulation, not a proof that every possible world state succeeds.

Scripts use **ES5 JavaScript in the existing JS-Interpreter**, embedded directly in SpacetimeDB reducers. No custom language and no external inference is needed to execute published behavior. See [scripting and architecture](docs/architecture.md).

## Connect your Claude Code

Install Node.js 22+ and sign in to Claude Code on **your own machine**:

```sh
git clone https://github.com/dbrinkmann/spacetime-mud.git
cd spacetime-mud
npm ci
npm run bridge
```

Approve the terminal consent prompt. Open its pairing link, then explicitly consent in the game's builder panel. Game context and your requests are sent to Claude and count toward your usage. The bridge runs Claude with computer tools, customizations, session persistence and external MCP servers disabled. You can revoke consent anytime.

Ask for rooms or scripted objects. Object changes arrive as private drafts for inspection, preview and publication. Existing objects can be revised by ID; the bridge receives your editable definitions. A bridge disconnect never stops published gameplay or timers.

For an existing checkout, run `git pull` and `npm ci` before restarting the bridge after this release.

## Local development

SpacetimeDB CLI, server SDK and client SDK are pinned to **2.13.0**. The original implementation remains archived in `legacy/`.

```sh
npm ci
npm ci --prefix spacetimedb
spacetime start --listen-addr 127.0.0.1:3030 --data-dir .local-db
spacetime publish mud-local --server http://127.0.0.1:3030 --module-path spacetimedb --yes
spacetime generate --lang typescript --out-dir client/module_bindings --module-path spacetimedb
```

Set `VITE_SPACETIME_HOST=http://127.0.0.1:3030` and `VITE_SPACETIME_DATABASE=mud-local`, then `npm run dev`. For a local bridge or integration tests, use `SPACETIME_HOST` and `SPACETIME_DATABASE` instead (without the VITE prefix). The bridge also accepts `GAME_URL` for its pairing link.

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
# Opt-in: uses real Claude Code quota:
npx tsx tests/bridge-live.ts
```

`tests/restart-timer.ts --prepare`, followed by a server restart and `tests/restart-timer.ts`, verifies durable scheduling. `tests/deployed-smoke.ts` checks HTTPS assets against the local build and connects to the production database. See [verification evidence](docs/verification.md).

GitHub Actions tests a disposable database, runs desktop/mobile Chromium checks, verifies generated bindings, and deploys Pages. Database publication is an explicit CLI operation; **do not use `--delete-data=always` on a populated world without authorization**. This release's reset was explicitly requested by the project owner.

The restricted interpreter bundle is committed for deterministic module builds. Regenerate it with `node scripts/bundle-interpreter.mjs` after installing server dependencies. See [third-party notice](docs/third-party.md).
