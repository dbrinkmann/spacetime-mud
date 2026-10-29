# Launch verification — October 29, 2026

Live game: https://dbrinkmann.github.io/spacetime-mud/

Live database: `dbrinkmann-spacetime-mud` on SpacetimeDB Maincloud, with CLI/module/client SDK pinned to 2.13.0.

The initial deployment passed [GitHub Actions](https://github.com/dbrinkmann/spacetime-mud/actions/runs/40910051041). The workflow checks builds and runs disposable-database integration tests before publishing Pages.

## Passed

- TypeScript checks for the server, client, bridge, and test code; production Vite build.
- Command parser and structured-action validation tests.
- Multiple real clients: creation, room synchronization, movement and return passages, atomic rejection of occupied directions and invalid room content, chat, private messages, and duplicate-name rejection.
- Agent grants: no job without consent, private job visibility, bridge ownership, rejected unauthorized job claims, one-time completion, NPC dialogue prohibited from changing the world, and rejected completion after revocation.
- Identity persistence after reconnect, and correct presence while multiple tabs share an identity.
- Rendered React UI connected to real SpacetimeDB: character creation, manual building, passage navigation, chat, consent button disabled without approval, command help, and identity persistence on remount.
- The complete local bridge subprocess with **real signed-in Claude Code 2.1.201**: pairing, generated room, generated NPC, private NPC roleplay, and consent revocation. Repeated successfully against both local SpacetimeDB and the Maincloud validation database `dbrinkmann-spacetime-mud-check`.
- Public HTTPS page and its JavaScript/CSS return HTTP 200. Downloaded assets match the SHA-256 hashes of the locally validated production build.
- A fresh client connects to the production database and synchronizes the Nexus; private inbox and job views are empty for that unrelated identity.
- `npm audit` reports zero vulnerabilities in the new application's dependency tree.

The production world was checked with one room and no exits, preserving the intended empty Nexus. Test rooms and NPCs were created in separate validation databases, not seeded into production.

## Verification limit

Browser/computer control was unavailable in this environment. UI behavior was tested through a rendered DOM with real database connections; no visual screenshot review or manual browser walkthrough is claimed.

## Repeat the deployed check

Run `npm run build`, set `SPACETIME_HOST=https://maincloud.spacetimedb.com` and `SPACETIME_DATABASE=dbrinkmann-spacetime-mud`, then run:

```sh
npx tsx tests/deployed-smoke.ts
```

The check reads public assets and subscribes to the live world; it does not mutate world content. See the root README for disposable-database integration and opt-in Claude tests.
