# SpacetimeMUD

A shared text adventure built by its players. Begin in the empty Nexus, imagine a passage, explore what others create, and bring characters to life with your own local Claude Code.

**Play:** https://dbrinkmann.github.io/spacetime-mud/

**World:** https://spacetimedb.com/dbrinkmann-spacetime-mud

This fork migrates the original Clockwork Labs game to **SpacetimeDB 2.13.0 and TypeScript**, including the database module, React client, and local Claude Code bridge. The original source is retained in `legacy/`.

## Play

Enter a name. Your character is remembered in this browser. Use clickable passages or `n`, `s`, `e`, `w`, `u`, `d`. `say Hello` speaks to the room. `help` opens the guide. `home` returns to the Nexus.

Everyone can build. The **Build** tab creates a room with a two-way passage, or an NPC with a biography. The Nexus intentionally starts with no exits: the world is authored by its players.

## Connect your Claude Code

Requires Node.js 22.12+ and a current Claude Code installation, signed in on **your own computer** (`claude auth login`). Tested with Claude Code 2.1.201. This uses your Claude account and usage allowance, not a game-hosted OpenAI key.

```sh
git clone https://github.com/dbrinkmann/spacetime-mud.git
cd spacetime-mud
npm ci
npm run bridge
```

Approve the terminal consent prompt. Open the pairing link it prints, create or load your character, and explicitly consent in the AIAgent panel. Keep the bridge terminal running.

Try:

```text
tell AIAgent create a moonlit garden to the north
north
tell AIAgent create an NPC named Mira, a keeper who remembers every flower
tell Mira What grows here?
```

For names with spaces: `tell "Orchard Keeper" Hello`.

Use **Disconnect & revoke consent** to stop the game using your bridge. This cancels pending actions and aborts active inference. Ctrl+C stops the bridge locally. No inbound localhost server is needed, and Claude credentials never leave your machine for the game server. Claude runs with customizations and computer tools disabled; the database validates each proposed action.

If the bridge reports missing CLI flags, update Claude Code. If Claude isn't on PATH, set `CLAUDE_EXECUTABLE` to the executable's absolute path. Bridge authentication is saved separately in `~/.spacetime-mud-bridge/`; do not share those files.

## Develop locally

Install the SpacetimeDB 2.13.0 CLI, then:

```sh
npm ci
npm ci --prefix spacetimedb
spacetime start --listen-addr 127.0.0.1:3030
```

In another terminal:

```sh
spacetime publish mud-local --server http://127.0.0.1:3030 --module-path spacetimedb --yes
spacetime generate --lang typescript --out-dir client/module_bindings --module-path spacetimedb
```

Create `.env.local`:

```dotenv
VITE_SPACETIME_HOST=http://127.0.0.1:3030
VITE_SPACETIME_DATABASE=mud-local
```

Run `npm run dev`. For the bridge, set `SPACETIME_HOST`, `SPACETIME_DATABASE`, and `GAME_URL` in its shell to the local server, database, and Vite URL before running `npm run bridge`. Without overrides, both the web client and bridge connect to the live demo.

PowerShell example:

```powershell
$env:SPACETIME_HOST='http://127.0.0.1:3030'
$env:SPACETIME_DATABASE='mud-local'
$env:GAME_URL='http://localhost:5173/'
npm run bridge
```

## Test

```sh
npm test
npm run check:server
npm run build
```

Publish a fresh disposable database and set `SPACETIME_HOST` / `SPACETIME_DATABASE` to it. These integration tests create game content:

```sh
npm run test:integration
npx vitest run
```

The multiplayer suite checks room creation and return passages, rollback, private messages, identity ownership, agent consent and revocation, NPC action restrictions, and reconnect/multiple-tab presence. The rendered React UI test uses a real SpacetimeDB connection.

Optional, **uses your signed-in Claude Code and quota**:

```sh
npx tsx tests/bridge-live.ts
```

This starts the actual bridge, pairs a test character, creates a room and NPC through Claude, and checks a private roleplaying response. It does not run in CI.

## Deploy

The GitHub Actions workflow tests against a disposable SpacetimeDB instance and deploys the client to GitHub Pages on pushes to `main`. Backend updates are separate:

```sh
spacetime login
spacetime publish dbrinkmann-spacetime-mud --server maincloud --module-path spacetimedb --yes
```

Do not use `--delete-data` on the live world. Schema-breaking changes need a migration plan. The SDK and CLI are pinned to 2.13.0; regenerate bindings when changing the schema.

See [architecture and boundaries](docs/architecture.md). This release implements world-building, exploration, chat, and NPC roleplay. It does not add combat, inventory, quests, or the upstream experimental zone generator. Anonymous identity recovery and moderation tooling remain future work.

## License

Apache-2.0; see [LICENSE.txt](LICENSE.txt). Based on [clockworklabs/spacetime-mud](https://github.com/clockworklabs/spacetime-mud).
