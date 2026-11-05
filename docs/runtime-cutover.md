# Runtime v2 cutover record

Prepared November 4, 2026 (US Eastern). Deployments run manually; GitHub Actions remain disabled.

## Release unit

- Existing Discord URL: `https://lantern-staging.dbrinkmann.workers.dev` (no portal change).
- Candidate Worker version: `95bfd76d-c5a1-48ff-b164-f2fb2f2921c9`.
- Candidate preview: `https://95bfd76d-lantern-staging.dbrinkmann.workers.dev`.
- Database: `dbrinkmann-lantern-runtime-v2`.
- Production D1 remains `lantern-discord-staging`, preserving principal identities.
- Existing Discord secrets, origin list and server restriction are preserved. Only the database authority secret changes, atomically with the version.
- Client/MCP use API v2. Old Activity renewal requests receive HTTP 409 and must reopen. Old agent connections must install the new bundle and pair again.
- Production build selects `client/runtime/entry.tsx`; retired client routes and v1 agent downloads are excluded.

The old world is not migrated. An administrator's first verified launch provisions the new community with an empty common-room bootstrap. Builders recreate content through the v2 guide. The original database is retained, not wiped.

## Recovery

Normal future releases use `npm run build:runtime:release` followed by `wrangler deploy --config wrangler.jsonc`. The established `build:staging` alias now builds the same runtime release. `wrangler.runtime.jsonc` remains the isolated verification deployment; do not upload old authority secrets to the production Worker.

Prior production Worker: `c975a41e-eaea-4334-993a-154265a03690`.
Prior database: `dbrinkmann-lantern-staging`.
The version includes the original database binding, assets and secrets.

```powershell
wrangler versions deploy c975a41e-eaea-4334-993a-154265a03690@100 --config wrangler.jsonc --yes --message "Restore pre-runtime release"
```

Rollback returns to the old database; it does not reverse-migrate v2 content. V2 writes remain in the replacement database but are not shown by the old release. Preserve both databases during the rollback window.

Ignored `.bridge/discord-staging/` contains a D1 export, old schema and read-only exports of all 44 old tables. The table export is sequential, not an atomic database snapshot. The retained original database is the authoritative rollback target. These exports contain private data and must not be committed.

Rollback mechanics were exercised on the isolated Worker: candidate → prior `4773ae60-10c0-48cf-a26f-1d5dd2ef44a5` → candidate `df82f283-7ba0-4a5b-8bf5-4a55c0ff1ad6`, checking `/health` after each change. This did not alter production or reverse any database writes.

## Verification

- All 82 tests passed, including meter-scaled cuboids, transparent cutaways and stale Activity renewal.
- Client and runtime type checks passed.
- Exact production candidate gateway checks passed: API/database identity, preserved Discord origin, stale-client rejection, unauthorized-preview rejection, matching published guide and MCP SHA-256.
- Hosted MCP renders the station from front/back and the street from the exact candidate.
- Full station/street artwork was converted in a test-only adapter for comparative screenshots at 1280×720, 800×600 and 390×700. The application contains no old-scene importer.
- Industrial lighting, shadows, contact shading, floor seams, unit-cube material coordinates and alpha-preserving cutaways were restored. Initial room entry centers on the player while retaining character-scale zoom.
- Paired old/new renderer runs meet the 1.25 ratio threshold. One historical frozen-baseline comparison (street, 800×600 frame interval) exceeded it; the contemporaneous old renderer slowed similarly. A focused rerun measured old/new p95 116.7/133.2ms (1.14 ratio). These software-rendered timings do not establish hardware-GPU performance inside Discord. Raw paired results are in `docs/baselines/runtime-render-comparison-2026-11-04.json`.
- Ten reconnect/room-entry cycles ran alongside the two-player live soak, recorded in `.bridge/parity1793839779007/churn.json`.
- The exact production candidate passed the hosted browser suite, including approach cancellation, messages, lights, private choices/text/target input, native seat/portal events, home claim/entry/return, live subscriptions, reconnect and narrow layout. The standalone fixture renews its verified membership every minute, matching the Activity's renewal lifecycle.
- The candidate authority provisioned and verified a fresh Maincloud test community (`1793841395563`); this checks database authority wiring, not Discord OAuth itself.

The 30-minute soak passed: 1802.418 seconds, 350 checks, minimum 105 cycles across all six movers, no reported faults or lost views, bounded queues. Result: `.bridge/parity1793839779007/result.json`. Fixture behaviors were suspended after completion.

Production switched to candidate `95bfd76d-c5a1-48ff-b164-f2fb2f2921c9` at approximately 01:20 UTC November 5. Post-switch checks against the stable URL passed: API 2, replacement database, stale-session rejection, preview authorization and matching downloaded MCP/guide. The published MCP SHA-256 is `ca698fd639ded4d01adaee383e76e9d5991334bdf29554430223a2a18652c04e`.

The complete hosted browser suite also passed again on the stable production URL after the switch (fixture community `1793841661207`). The default release build reproduces the activated asset hashes.

Actual embedded Discord launch is a separate user-assisted check: desktop automation reported that its native pipe was unavailable. The user has been asked to close/reopen as an administrator and confirm their common room and name. Do not describe standalone browser tests as embedded Discord verification or complete manual P01-P22 sign-off.

## Builder handoff

After cutover, use `/agent/RUNTIME.md` and `/agent/lantern-runtime.mjs` from the existing Lantern URL. Configure `LANTERN_RUNTIME_HOST=https://maincloud.spacetimedb.com`, `LANTERN_RUNTIME_DATABASE=dbrinkmann-lantern-runtime-v2`, and `LANTERN_RUNTIME_SITE=https://lantern-staging.dbrinkmann.workers.dev`. Call `world_connect`, pair in the Activity, then `world_guide` and inspect the newly provisioned community before rebuilding. Packages and entities replace the retired scene/object API; do not reuse v1 room IDs or scripts unchanged.
