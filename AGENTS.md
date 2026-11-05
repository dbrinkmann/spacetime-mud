# Lantern engineering rules

## Start here

Read `docs/session-handoff.md`, then `README.md`. For runtime work, read `docs/runtime-authoring.md` and the relevant sections of `docs/scriptable-world-plan.md`. Check `git status` and the current branch before editing. Preserve unrelated work. Keep the handoff current when deployment status or the next task changes.

## Product and scope

- Lantern is a visual, room-based social world for Discord communities, inspired by MUSHes. It is a general programmable-object platform, not a hardcoded cyberpunk demo.
- Build reusable platform primitives; the separate builder agent authors rooms, receptionists, traffic and other content through MCP. Do not put their specific rules in the engine.
- Favor refactoring over patches and parallel compatibility systems. The current entity/package API is v2. Historical v1 scene data and `objectId` scripts are not compatible unchanged.
- Any compatible coding agent can build. Do not require Claude, repository cloning, a local player web server, or game-hosted inference. Creators receive instructions and pair a stdio MCP client; publication is live without a review queue.
- Admins build common areas and author entrance spots. Members claim an available spot for a home and expand their home graph. Room connections define maps; there is no Nexus or competition for grid coordinates.
- Characters are simple six-part cuboid rigs, with rigid cosmetics attached to parts. Preserve the shared animation contract and per-box materials.
- Preserve approach-before-interaction, responsive game layout, character-scale zoom, free zoom/pan, dead-zone follow, hover-only labels, and world-anchored speech without redundant player-name prefixes.

## Source of truth

- `world-server/src`: deployed SpacetimeDB module, schema, identity/property services and scheduled runtime integration.
- `shared/runtime`: contracts, values, components, operations, navigation, packages/templates and projections.
- `spacetimedb/src/runtime`: shared interpreter/execution engine still imported by the current module. Do not delete it just because its parent contains retired code. Read the applicable `spacetimedb/AGENTS.md` when editing there.
- `client/runtime`: released Activity UI and renderer; `client/world`: shared geometry/material/animation helpers.
- `world-client/module_bindings`: generated bindings; regenerate from `world-server`, do not hand-edit.
- `mcp/runtime.ts` and `mcp/runtime-main.ts`: provider-neutral authoring tools. `gateway/`: Discord authentication and hosted previews.
- `docs/runtime-authoring.md`: current builder contract. Keep tool schemas, examples, validation and docs aligned when changing APIs.

## Runtime design

Server state is authoritative. Scripts run in the bounded interpreter, never in clients; state/effects commit transactionally. Clients sample persisted operation and walking anchors without a reducer per frame. Preserve generation invalidation, deterministic scheduling and late-join behavior.

Packages are immutable and hash-pinned. Instance state is separate from shared package code. Component restore is not a private-state rewind. Prefer shared engine/simulator logic over a second test-only implementation. Do not add unrestricted network access, physics or model inference as an incidental feature.

## Deployment and credentials

- **No GitHub Actions.** The user explicitly does not want their Actions budget used. Do not add/re-enable workflows or automatic deployment.
- Use GitHub account **dbrinkmann**; confirm/switch `gh` identity before pushing. Continue on the existing task branch unless the user directs otherwise.
- `wrangler.jsonc` is the production Worker despite the name `lantern-staging`. Build with `npm run build:runtime:release` (`build:staging` aliases it).
- **`dbrinkmann-lantern-runtime-v2` is live production data.** Both hosted Worker configurations currently point to it. The alternate Worker URL is not a disposable database.
- Local disposable target: `http://127.0.0.1:3030` / `lantern-runtime-refactor`. Inspect actual targets before running hosted fixtures or CLI publication. A test's old "isolated" allowlist does not make a production target disposable.
- The retained old database `dbrinkmann-lantern-staging` is for rollback. Do not overwrite/reset it or interpret historical world-reset permission as permission to erase newly built content.
- Keep `.env.local`, `.bridge`, tokens, database exports and private state out of Git and tool output. Never print secrets to inspect configuration. Preserve the production D1 identity mappings and Discord secrets.
- Database publication and Worker deployment are separate operations. Use the recorded release/rollback procedure in `docs/runtime-cutover.md`; do not switch to an obsolete module or authority token.

## Verification and handoff

Run checks appropriate to the change: `npm test`, `npm run check:runtime`, and the release build, plus relevant `test:runtime:*` integrations. Use local fixtures by default. Browser tests expect a configured site and Chromium. Do not rerun long live soaks for documentation-only changes.

Differentiate unit/local tests, hosted browser/preview evidence, and actual user-confirmed Discord checks. Do not claim a full manual parity audit from a launch confirmation. Record remaining limitations honestly. Update `docs/session-handoff.md` and release evidence when work changes the deployed state.
