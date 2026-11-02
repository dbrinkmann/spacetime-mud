# Release verification — November 2, 2026

Game: https://dbrinkmann.github.io/spacetime-mud/
Database: `dbrinkmann-spacetime-mud` on Maincloud.

## Passed before production publication

- TypeScript server/client/bridge checks and production Vite build.
- Interpreter tests: ordinary JavaScript functions/loops, runaway loops/recursion/string growth, oversized arrays, native aliases, dynamic code, regex, constructors and prototype access.
- Real multiplayer integration on both local SpacetimeDB and Maincloud (`dbrinkmann-spacetime-mud-check`): shared gate state, independent chest rewards, duplicate-request protection, script-driven creature movement, timer reset, private discovery and script views, edit permissions and revoked collaborators.
- Draft/preview/publication isolation, version rollback preserving earned inventory, runtime failure discarding rewards/messages, builder disconnect and identity reconnect.
- Timer suite on both local and Maincloud: repeat/cancel, named replacement, object deletion, version replacement, failed-handler rollback and traces, inventory reads after writes in the preview overlay, secret passage discovery/configuration/travel.
- A real local server-process restart with a pending timer: it fired after restart with the original actor and state intact.
- Real local Claude Code through the bridge on both local and Maincloud: generated a room and scripted lantern draft, previewed/published the source, invoked the action, and observed its timer. No inference was involved in running that published behavior.
- React UI tests connected to local and Maincloud: create character and zone, save/test/publish a template, invoke an action, chat, consent initially disabled, reconnect with identity intact.
- Real Chromium desktop (1440px) and mobile (390px): explore the map, open the gate, collect inventory, chat, create a zone, preview/publish/use an object, observe its timer, and reload. No browser exceptions; no mobile horizontal overflow. Desktop, mobile and workshop screenshots were visually reviewed.
- Dependency audits: zero reported vulnerabilities in production dependencies and the server dependency tree.

## Deployment

Production confirmation is recorded below after publication. The original world reset was explicitly authorized. GitHub Actions repeats the integration, timer, React UI and Chromium checks and uploads screenshots before deploying Pages.

## Reproduce

Set `SPACETIME_HOST` and `SPACETIME_DATABASE` to a disposable database, then run:

```sh
npm test
npm run check:server
npm run build
npm run test:integration
npm run test:timers
npx vitest run
```

For browser verification, run Vite on port 5174 against that database and `npm run test:browser`. For the real agent flow use `npm run test:bridge` (consumes Claude Code usage). The server restart test is `npx tsx tests/restart-timer.ts --prepare`, restart the local server, then `npx tsx tests/restart-timer.ts`.

After deploying, `tests/deployed-smoke.ts` compares public JS/CSS hashes against the local build and checks a fresh database connection. `GAME_URL` plus `BROWSER_SMOKE_ONLY=1` runs the browser exploration check against the live site without creating a test zone.

## Scope

The shipped interpreter is ES5 JavaScript, not Lua or TypeScript syntax. Preview simulates a selected event rather than every possible world state. Script limits bound work and allocations; this is not a claim of a separate process heap or an exhaustive security audit. The builder uses one structured agent proposal per request. Those boundaries are documented in `docs/architecture.md`.
