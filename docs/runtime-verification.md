# Runtime v2 core verification

Date: 2026-11-04. Branch: `refactor/programmable-world`.

The core is implemented on the isolated replacement. This record distinguishes working capability from approval to replace the existing Discord release.

## Release targets

- Module: `world-server`; Maincloud database `dbrinkmann-lantern-runtime-v2`.
- Hosted client/MCP/preview: https://lantern-runtime-v2.dbrinkmann.workers.dev.
- Worker: `lantern-runtime-v2`; D1: `lantern-runtime-v2`, independent of production.
- Local integration database: `lantern-runtime-refactor`.
- Production `dbrinkmann-lantern-staging` and its Discord URL mapping remain unchanged.
- GitHub Actions stay disabled. Commands below are run explicitly.

## Requested core capabilities

| Capability | Implementation | Evidence |
| --- | --- | --- |
| Object-to-object messaging | Queued typed entity/slot delivery, pinned generations, staged effects, receipts | `runtime-engine.test.ts`; `runtime-local.ts`; hosted switch → door → indicator browser test |
| Reusable composition | Immutable packages, search/read, slots, config, migrations, detach; template export/import with dependencies and reference remapping | `runtime-registry.test.ts`; `runtime-templates.test.ts`; Maincloud `runtime-social-local.ts`; downloaded MCP release fixture |
| Runtime manipulation | Components/named parts, paths, timers, visibility/lights/text, spawn/destroy/transfer, navigation, room/home cleanup | Operations/path/reservations/walking tests; local scheduler and hosted browser; Maincloud cleanup/rebuild tests |
| Rich interaction | Approach before actions, private choices/text/target selection, public speech, room entry/exit, seat/stand/portal events | `runtime-interactions.test.ts`; browser selects a target, answers prompts, sits/stands and traverses portals; native event counters checked on server |
| Entity inspection | Public components/status, player names and sampled positions/velocity, bounded spatial queries; scoped builder diagnostics | Engine/spatial/interactions tests; MCP and live preview tests |
| Structured Object Variables | Slot-private state, declared shared entity variables, public status, player memory, schema-checked migration | Engine/value/registry tests; persistent visit memory, package import isolation and reconnect integration tests |

## Supporting functionality

Player homes, authored entrance claims, connected room maps, home-name signs, avatar cosmetics, offline home presence, multi-session reconnect, hover labels, camera following/manual pan, responsive layouts and world speech are exercised in browser/social suites. Material, sign, glyph, character and preview tests retain the cuboid authoring model.

`runtime-release.ts` downloads the published MCP bundle into an isolated directory. With separate player and builder identities it publishes a 20x14 station and 60x16 street through MCP, including seats, lights, signs, eight entrances, a character/desk interaction surface and six independent moving instances. It searches packages, detaches/reattaches a behavior, requests actual hosted PNG previews and checks running instances for errors, lost subscriptions and queue growth. Artifacts and credentials are kept in ignored `.bridge/parity...` directories; credentials are never included in exported templates or this report.

The large fixture is a functional/density fixture, not a claim of pixel equivalence to the old cyberpunk artwork. Full baseline visual/performance comparison remains a release gate.

## Explicit semantics and limits

- Solid motion reserves its swept footprint until paused/completed. This is conservative navigation, not full physics or passenger platforms. Nonblocking traffic uses views and reservations.
- Terminal callbacks are bounded best-effort notifications. They may update state/components or send final messages; they cannot start new asynchronous work. Cleanup always completes. Reattachment starts fresh state.
- Component restore does not rewind private script state. Migration must be explicit.
- Self-frame sensors support fixed yaw or piecewise path heading; continuously rotating objects can use room-frame sensors.
- The UI starts actions without a payload; scripts collect typed input through choices, text and target requests. The internal action contract validates bounded payload schemas.

## Commands and release boundary

Verified in this implementation pass:

- `npm test`: 79 passing tests, including terminal lifecycle, target selection, swept navigation and virtual-time repeated cycles.
- Runtime type check and isolated production client build passed.
- Local scheduled-runtime, access, browser and draft-preview suites passed.
- Maincloud social suite passed: homes, rename, avatar, multiple connections, away/reconnect, template export/import, component restore, route replanning and room/home cleanup/rebuild.
- Hosted browser suite passed on the replacement URL: switch/door/light cooperation, private choices/text/target input, native seat/stand/traversal counters, home travel, speech, reconnect, live subscriptions and narrow layout.
- Published MCP download and real hosted PNG preview passed for both large fixture rooms.
- Maincloud repeated-cycle run completed in 604.447 seconds: 118 checks, all six moving instances completed at least 35 cycles, no script faults or lost views, bounded pending queues. The run continued across a module update. Fixture community: `1793828391485`; local result: `.bridge/parity1793828391485/result.json`. Instances were suspended after verification. This ten-minute check is not the plan's thirty-minute release soak.
- Hosted Worker version tested: `4773ae60-10c0-48cf-a26f-1d5dd2ef44a5`.

Run `npm test`, `npm run check:runtime`, `npm run build:runtime:staging`, and the `test:runtime:local`, `:access`, `:mcp`, `:browser`, `:social`, `:preview` and `:release` suites. Browser/social tests accept explicit replacement host/database variables. The release fixture is deliberately fixed to the isolated hosted replacement.

Actual embedded Discord launch, complete P01–P22 manual/performance sign-off, the plan's 30-minute release soak, and rollback rehearsal are still required before switching production. Standalone browser tests and virtual-time tests are not represented as those manual/release checks.
