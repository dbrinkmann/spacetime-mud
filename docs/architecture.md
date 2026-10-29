# Architecture and scope

The client and local agent bridge are independent TypeScript SpacetimeDB clients. The database owns the world, validates actions, persists identities, and synchronizes changes. No OpenAI service or centralized inference worker is required.

## Original gameplay preserved

The Nexus initializes without exits. Players create the first rooms. Creating a room also creates both passages in one transaction; an occupied direction or invalid description rolls the whole operation back. NPC biographies inform roleplay. Players can build manually or ask AIAgent through their own local Claude Code.

The original implementation and Apache license are retained. Combat, quests, inventory, autonomous NPC simulation, and whole-zone generation are not implemented in this release. These would be new gameplay scope, not prerequisites for the original building loop.

## Pairing and consent

1. The player installs and signs in to Claude Code on their own computer, then starts `npm run bridge`.
2. The terminal asks for consent before connecting. It creates a separate SpacetimeDB identity and prints a game URL with that public identity in the fragment. No Claude credential or database token is in the URL.
3. The player opens the link and checks the in-game consent checkbox. The `consent` reducer creates a private grant from the authenticated player to the bridge. Each bridge can pair with only one player at a time.
4. Player requests become private jobs. A view exposes only jobs belonging to that bridge's currently consenting player. Other players cannot see these jobs or claim/complete them.
5. The bridge claims a job, gives Claude the player's request and relevant game context, then submits a typed proposal. Room and NPC creation is validated and committed by the database. NPC dialogue jobs cannot create rooms or NPCs.
6. Disconnecting in-game deletes the grant, cancels outstanding jobs, removes them from the bridge's subscription, and aborts an in-flight local call. Results submitted after revocation are rejected. Stopping the terminal also stops inference; it does not silently revoke the saved pairing.

The bridge uses `claude --print --safe-mode --tools "" --strict-mcp-config --mcp-config '{"mcpServers":{}}' --no-session-persistence` and structured output. It keeps the existing Claude subscription login, disables customizations and computer tools, and never uses bypass-permission mode. Calls time out after two minutes. Claude Code 2.1.201 was used for live verification; an older version without these flags should be upgraded.

## Boundaries

- World data, room chat, player names/presence, and NPC biographies are public game content. Direct messages use a private table and per-user view.
- Browser identity tokens are stored under a host/database-specific localStorage key; the local bridge stores its separate token in `~/.spacetime-mud-bridge`. Clearing browser storage loses that anonymous character's login. Account recovery is not yet implemented.
- The bridge opens no inbound localhost HTTP port and sends no Claude credentials to the game server. Only relevant context and the player's own requests are sent to Claude.
- This is an open building demo. Everyone can add content; moderation, reporting, account recovery, and production abuse controls are future work. There is a 1,000-room cap, eight NPCs per room, bounded chat/job history, one in-flight agent job per player, and length/direction validation.
- Local proposal validation improves error reporting; server validation is the authority. A client cannot select another player's identity for movement or claim another bridge's job.

## Deployment

GitHub Pages hosts the static client. SpacetimeDB Maincloud hosts the module. The Pages workflow checks TypeScript, unit tests, multi-client integration, and a rendered React UI test against a disposable SpacetimeDB 2.13.0 instance before building and publishing. Backend updates use the signed-in owner's CLI; no Maincloud credential is stored in GitHub.

Live Claude tests are deliberately opt-in and not part of CI, since they use the operator's Claude account and quota. `tests/bridge-live.ts` runs the actual bridge subprocess, pairs it, creates a room and NPC through real Claude Code, and verifies a private NPC reply.
