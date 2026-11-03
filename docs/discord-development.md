# Discord branch development

Branch: `feature/discord-community-worlds`. The original game is unchanged. The new private community tables coexist with the legacy game during implementation; the community preview never subscribes to legacy rooms or zones.

## Hosted staging

Frontend and OAuth gateway: **https://lantern-staging.dbrinkmann.workers.dev**

World database: `dbrinkmann-lantern-staging` on Maincloud. The Cloudflare Worker serves the built frontend and `/api/discord/*`; its D1 binding stores stable member identities across worker restarts and concurrent launches. The Node gateway below is retained for development, not required on a player's machine.

Discord Activity URL mappings (targets have no `https://` prefix):

| Prefix | Target |
| --- | --- |
| `/` | `lantern-staging.dbrinkmann.workers.dev` |
| `/db` | `maincloud.spacetimedb.com` |

Enable Activities after saving the mappings. The `/` mapping also handles the OAuth API; no separate `/api` mapping is needed for this hosted deployment. Visiting the site in a regular browser shows instructions to open the Discord Activity.

Deployment: `npm run build:staging`, then `wrangler deploy`. Credentials are uploaded through `wrangler secret bulk .bridge/discord-staging/secrets.json`, prepared by `npx tsx scripts/staging-secrets.ts`; that file and its authority token are Git-ignored. The preparation script requires the operator CLI via `SPACETIME_CLI` or PATH. Never upload `.env.local` or `.bridge` as assets. `DISCORD_TEST_GUILD_ID`, when configured, restricts staged sign-in to that server.

Verified hosted assets against local build hashes, origin rejection, CORS, unauthenticated denial, and gateway-authorized HTTP membership updates with a real WebSocket subscription confirming the resulting identity. Run `npx tsx scripts/verify-discord-staging.ts` after deployment. The project owner confirmed sign-in and navigation inside Discord after configuring the URL mappings.

## Implemented and tested locally

- Operator/gateway-provisioned communities and memberships, separate common/member properties, configured welcome rooms.
- Transactional home claims, multiple named doorways from one common room, interior expansion without coordinate claims, return travel.
- Community-scoped subscriptions and edit permissions, revocation, three-minute membership leases.
- Validated scene publication, revision conflicts and restore, avatar publication.
- Authoritative movement/seats, separate player sessions, one controller, disconnect grace, automatic home return, bounded walking routines and reconnect takeover at the current position.
- Development browser at `?community`, shared 3D character rendering, home/common map lists and doorway navigation.
- Community MCP building with owner-granted, community-scoped agent access. Admins explicitly delegate common-space editing; current role checks, membership expiry and revocation apply to every mutation and subscription.
- Downloadable standalone Node MCP client at `/agent/lantern-agent.mjs`, generated with `npm run build:agent` (also part of staging builds). Create provides installation/pairing instructions and grant revocation. No repository checkout or npm dependencies are required by creators beyond Node 22+.
- Discord Activity bootstrap and OAuth gateway implementation, with mocked Discord verification tests. The project owner confirmed desktop Discord sign-in and navigation; mobile Discord remains to be checked.

The project owner subsequently confirmed successful sign-in, arrival in common space, home creation and return travel inside Discord. Nameplate correction was deployed afterwards. Community agent tests additionally run the packaged client outside the repository, verify live common-space publication through the browser pairing UI, and exercise member/home boundaries, admin scope, role removal, revocation and agent-independent away presence. Run `npm run test:community:agent` and `npm run test:community:agent:browser` against a disposable database.

The agent integration suite also passed against hosted Maincloud staging using the MCP file downloaded from the deployed site (`COMMUNITY_AGENT_PATH` selects that file). These fixtures use a separate, operator-provisioned test community; they do not change the real Discord server's common space or homes.

## Remaining before a pilot

- Complete mobile Discord verification and a multi-member community pilot against hosted staging.
- Richer agent preview tools and authored activity behaviors. The community client provides room/avatar validation and live publishing; the separate original `mcp/index.ts` client continues targeting legacy zones.
- Community scripted objects/timers and room chat. Community publication currently rejects legacy `objectId` references deliberately.
- Visible 3D entrance placement, graph map visualization, cleanup/relocation operations, richer authored routines spanning home rooms, admin moderation/audit UI.
- Restart/recovery and lease-expiry integration tests, load measurements and real community pilot. The implemented routine is a closed walk inside the home's entrance room followed by a pause; it is not the complete authored activity system.

## Local preview

Use a new disposable database. Do not publish this evolving schema over production.

```powershell
$env:SPACETIME_HOST='http://127.0.0.1:3030'
$env:SPACETIME_DATABASE='mud-community-work'
$env:SPACETIME_CLI='D:\dev\personal\scratch\tools\spacetimedb\spacetimedb-cli.exe'
& $env:SPACETIME_CLI publish --no-config $env:SPACETIME_DATABASE --server $env:SPACETIME_HOST --module-path spacetimedb --yes
$env:VITE_SPACETIME_HOST=$env:SPACETIME_HOST
$env:VITE_SPACETIME_DATABASE=$env:SPACETIME_DATABASE
npm run dev -- --port 5176
```

Open `http://127.0.0.1:5176/?community`. An unprovisioned connection displays its public development identity. The database initializer can call `provision_community` with a numeric test guild ID, community name, identity and numeric test Discord user ID. Additional identities use `set_community_member`. These APIs are authority-only, never trusted browser claims. Development memberships expire after three minutes unless renewed, just like gateway memberships.

In another terminal with the same database/CLI environment:

```powershell
npm run test:community
$env:GAME_URL='http://127.0.0.1:5176'
npm run test:community:browser
```

The tests provision isolated numeric community IDs and exercise real SpacetimeDB connections. They leave fixtures in the disposable database. Browser screenshots go to ignored `test-results/community-desktop.png` and `community-mobile.png`.

## Discord setup

1. Create a Discord application and development server. Configure its Activity following the [official guide](https://docs.discord.com/developers/activities/building-an-activity). Record the application ID; keep the client secret only in the gateway environment.
2. Set `VITE_DISCORD_CLIENT_ID` when building the web client. Discord's `frame_id` launches Activity authentication automatically; `?activity` also selects that path.
3. Configure URL mappings: `/` to the frontend host, `/api` to the gateway's `/api` path, and `/db` to the SpacetimeDB host. The SDK patches WebSocket URLs to `/db`. Verify actual mapping/path behavior inside Discord before publishing.
4. Set gateway `SPACETIME_HOST`, `SPACETIME_DATABASE`, and a durable `DISCORD_STATE_DIR`. Run `npm run discord:gateway -- --init` to create its credential and print its public identity. Authorize that identity with the database operator's `set_community_gateway` reducer.
5. Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and comma-separated exact `DISCORD_ALLOWED_ORIGINS` (including the Activity's actual origin). Run `npm run discord:gateway`. Default bind is loopback port 8787; set `HOST`/`PORT` for your chosen HTTPS reverse proxy or host.
6. An administrator opens the Activity first to provision common space. Members authenticate with `identify`, `guilds`, and `guilds.members.read`. The gateway verifies the current user, membership and effective guild permissions with Discord; client-supplied roles are never accepted.

The gateway issues a stable SpacetimeDB token per Discord member per guild, retained in its private durable store. Back up that store: losing it loses the identity mapping. Run one gateway process against the store; it is not a multi-instance storage design. Store files contain credentials, are ignored by Git, and must not be published with frontend assets. No Discord access/refresh tokens are persisted. The Activity re-verifies membership every minute; loss of access stops renewal and the server's lease expires within three minutes. Long-lived OAuth token expiry currently requires reopening the Activity.

The Discord SDK's pinned Zod 3 dependency is reported by `npm audit` under GHSA-mrhx-c7xc-m3w5. No compatible upstream SDK fix is currently reported by npm; do not blindly override it with Zod 4. Resolve/review this before public release.

## Authored home entrance spots (2026-11-03)

Common-space agents publish visible placements with `homeEntrance.approach`. Their stable placement IDs identify available spots; `claimHome` / `world_claim_home` now require a spot ID. Claims are atomic and exclusive. The scene renders clickable vacancy/home nameplates and clicking the authored geometry enters the home. Rooms without vacancies do not offer home creation. Occupied IDs must survive scene publication and restoration, with reachable approaches after relocation. Geometry customization of a threshold by its resident is not yet implemented.

Deployed to Discord staging and Maincloud. Removed the explicitly authorized legacy Supreem's Hideout property (4) and its room/links; Supreem remains in Welcome (3) with no home. Common space was preserved. Operator-only home removal evacuates occupants, clears the owner's routine and home reference, invalidates pending away state, and deletes dependent links/history/rooms.

Verified: 16 unit tests; community integration including simultaneous claims for one spot, denied unauthorized edits, occupied spot preservation/relocation and safe removal; browser vacancy/live publication/claim/3D door click/mobile flow; standalone MCP integration locally and using the downloaded deployed bundle against Maincloud; hosted asset hashes and gateway smoke checks. Existing MCP installations must download the updated client after the reducer/view schema change.

## Builder feedback loop (2026-11-03)

Community MCP `world_preview` returns a PNG using the hosted game renderer, accepting unpublished source or a subscribed room ID, optional camera yaw and frozen animation time. Cloudflare Browser Run supplies Chromium; no local creator browser/install is needed. The worker verifies the caller's SpacetimeDB token through `preview_principal`, requires active community access, and limits previews to six attempts per owner/minute in D1. Untrusted scene data is validated and passed as data to the preview page, which receives no credentials and can fetch only this deployment's assets. Preview does not publish. The browser closes after each request. Run `wrangler d1 execute lantern-discord-staging --remote --file gateway/schema.sql` before first deployment with the BROWSER binding.

Room scenes support `exit` placement bindings, text `signs` using bundled OFL Noto Sans JP, and up to 12 decorative `npcs` using the standard six-part rig. Exit references are checked against outgoing connections on publish/restore. `world_guide` now reads the community-specific `public/agent/AUTHORING.md`; the old workshop guide remains for the legacy tooling only. The new guide documents exact yaw/camera/wall-fading behavior and feature limits. No exterior scene changes are included in this platform update.

Verification: 19 unit tests; browser checks of visible Japanese signs, NPC animation at two times, opposite camera angles and wall fading; community browser publication and actual exit-geometry clicks with invalid incoming-exit rejection; actual hosted PNG with invalid/revoked token checks; downloaded standalone MCP image content against Maincloud; hosted asset hashes including font and authoring guide. For hosted preview tests set SPACETIME_HOST/DATABASE to staging and SPACETIME_CLI, then `npm run test:builder:preview`. Set TEST_PREVIEW=true for the hosted MCP integration image check. Hosted tests use isolated fixture communities.

The Cloudflare Puppeteer package currently includes audit advisories in transitive Node browser-download/FTP/archive utilities; this worker only uses its remote browser binding and never downloads/extracts browser archives or uses FTP. No forced downgrade was applied. Existing Discord SDK Zod advisory remains upstream.
