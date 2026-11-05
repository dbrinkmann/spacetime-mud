# Lantern runtime v2 server

This is the deployed Lantern module, not an incomplete development replacement. Read the repository's [agent rules](../AGENTS.md) and [session handoff](../docs/session-handoff.md) first.

`src` integrates the schema, Discord-provisioned membership, properties/homes, player movement and scheduled object runtime. Shared contracts live in `shared/runtime`; the interpreter, dispatcher and virtual-clock simulator live in `spacetimedb/src/runtime`. That shared engine is still active code.

Current capabilities include immutable behavior packages, structured state, object messages, component operations, motion, timers, spatial views, reservations, templates, entity inspection, player interactions and creator tools. The authoritative API is [runtime-authoring.md](../docs/runtime-authoring.md); evidence and limits are in [runtime-verification.md](../docs/runtime-verification.md).

Run from the repository root:

```sh
npm ci --prefix world-server
npm test
npm run check:runtime
npm run build:runtime:release
```

For local integration, explicitly publish to the disposable local database:

```sh
spacetimedb-cli publish lantern-runtime-refactor --module-path world-server --server http://127.0.0.1:3030 --no-config --delete-data=never --yes=all
npm run test:runtime:local
npm run test:runtime:access
npm run test:runtime:mcp
```

Browser tests require the local UI on port 5179 by default. Some tests accept hosted target overrides; `test:runtime:release` targets Maincloud. **The Maincloud database `dbrinkmann-lantern-runtime-v2` is now production**, even when accessed through the alternate verification Worker. Review target and fixture scope before invoking hosted tests.

Regenerate `world-client/module_bindings` from this module when the schema changes. Preserve deterministic, transactional behavior; clients derive movement from persisted anchors instead of executing scripts or requesting a reducer every frame. Navigation uses horizontal room footprints and conservative swept bounds for solid motion; full physics and passenger platforms are not implemented.

Follow [the cutover/rollback record](../docs/runtime-cutover.md) for deployment. The older database is retained for recovery and must not be republished as this module accidentally.
