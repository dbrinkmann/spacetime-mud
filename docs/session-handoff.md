# Session handoff

Updated November 5, 2026 (US Eastern).

## Current state

- Repository: `dbrinkmann/spacetime-mud`; branch: `refactor/programmable-world`.
- Runtime v2 is live at https://lantern-staging.dbrinkmann.workers.dev through the existing Discord app. No Discord portal URL change was needed.
- User confirmed "it works" after reopening in Discord, then confirmed their builder agent connected. Do not repeat setup or assume pairing is still blocked. Grants can expire; inspect current state when needed.
- The separate builder agent is rebuilding content. Last suggested brief: Welcome Station and Neon-dori, connected exits, home entrances/name signs, receptionist and reusable traffic behaviors. **This is a brief, not evidence that rebuilding is complete.** Inspect live content instead of assuming old room IDs or an empty world.
- Prior world content was not migrated. The old database is retained for rollback. Historical reset authorization does not cover deleting new builder work.

## Deployment map

| Purpose | Configuration / target |
| --- | --- |
| Live Worker | `wrangler.jsonc`, Worker `lantern-staging` |
| Activated release at cutover | `95bfd76d-c5a1-48ff-b164-f2fb2f2921c9`; see cutover record for subsequent documentation deployments |
| Current Worker after guide correction | `1614b0ed-f683-4b24-bc9c-131525af79cc`; only `/agent/RUNTIME.md` changed |
| Live database | Maincloud `dbrinkmann-lantern-runtime-v2`, module `world-server` |
| Live identity store | D1 `lantern-discord-staging` |
| Alternate verification Worker | `wrangler.runtime.jsonc`, Worker `lantern-runtime-v2`; **same live database**, separate D1 |
| Local test database | `lantern-runtime-refactor` at `http://127.0.0.1:3030` |
| Retained old release | Worker version `c975a41e-eaea-4334-993a-154265a03690`, database `dbrinkmann-lantern-staging` |

Use `npm run build:runtime:release` then `wrangler deploy --config wrangler.jsonc` for an authorized frontend/gateway release. Database changes require explicit publication of `world-server` to the intended target. Existing local CLI: `D:\dev\personal\scratch\tools\spacetimedb\spacetimedb-cli.exe` (2.13.0). Credentials are already configured locally; do not print them or ask the user to configure everything again without first checking.

## Evidence and limitations

- 82 tests passed; client/runtime type checks and release build passed.
- Exact-candidate and post-cutover stable-URL browser suites passed: walking/approach cancellation, messages, lights, dialogue, seating, home travel, subscriptions, reconnect and narrow layout.
- Hosted PNG previews passed. Thirty-minute Maincloud soak: 1802.418 seconds, 350 checks, at least 105 cycles per moving instance; ten additional reconnect cycles. Fixture movers suspended afterward.
- User confirmed actual embedded Discord launch. This is not a complete manual P01-P22 audit or embedded GPU benchmark.
- Paired render comparisons passed the 1.25 ratio threshold. A historical baseline outlier and software-rendering caveats are documented in `runtime-cutover.md`.
- Desktop control reported an unavailable native pipe during verification; do not claim screenshots or interactions that were not observed.
- GitHub Actions are disabled. No CI rollout is pending or desired.

## Where to resume

The user is switching sessions, not requesting another feature or another rebuild. Start by reading the shared rules and this handoff, then handle their next request. Platform improvements should remain general; authored-world changes belong to the builder agent unless explicitly requested here.

Read `docs/runtime-authoring.md` for the API, `docs/runtime-verification.md` for capability evidence, `docs/runtime-cutover.md` for deployment/rollback, and `docs/scriptable-world-plan.md` for architecture and the parity matrix. Old v1 guides under `public/agent` and earlier module/workshop files are historical; current release packaging excludes those guides.

Builders use the live `/agent/RUNTIME.md` and `/agent/lantern-runtime.mjs`, with `LANTERN_RUNTIME_HOST=https://maincloud.spacetimedb.com`, `LANTERN_RUNTIME_DATABASE=dbrinkmann-lantern-runtime-v2`, and `LANTERN_RUNTIME_SITE=https://lantern-staging.dbrinkmann.workers.dev`. No repository clone is required.
