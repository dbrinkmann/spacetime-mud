# Programmable world development module

This module is an **incomplete isolated replacement**, not the deployed Lantern application. Its reducers are operator-only. Verified community access, the Activity and MCP integration, aggregate execution quotas, and the functionality parity gates must be completed before public deployment.

The shared contracts live in `shared/runtime`. `spacetimedb/src/runtime` contains the interpreter adapter, buffered behavior execution, dispatcher and virtual-clock simulator. The existing production interpreter entry point delegates to that extracted adapter; there is no second interpreter implementation.

Run from the repository root:

```text
npm test
npm run check:server
npm run check:runtime
npm run build
```

Install this module's dependencies with `npm install --prefix world-server`. Publish explicitly to the isolated local database:

```text
spacetimedb-cli publish lantern-runtime-refactor --module-path world-server --server http://127.0.0.1:3030 --no-config --delete-data=never --yes=all
npm run test:runtime:local
```

The local integration script deliberately fixes its target to `http://127.0.0.1:3030` / `lantern-runtime-refactor`. Set `SPACETIME_CLI` to the CLI executable if it is not at the workspace's existing Windows tools path. It creates uniquely named fixture entities and immutable packages; it does not delete the database. Tests must use the publishing operator's CLI identity. Anonymous callers are rejected.

Current authoring contracts are development contracts. Packages declare typed event subscriptions, state/config schemas, exclusive writable component resources, and optional pure state migrations. A published bundle's SHA-256 covers canonical manifest/source. Versions are immutable. An instance pins a hash, and an upgrade must preserve package identity. Migration code has access only to copied state and configuration; it cannot send messages or modify the world.

The initial component set is visibility, transform, light and text. A handler stages changes; the dispatcher validates the whole invocation before committing. Messages are asynchronous, same-property, generation-scoped and schema-checked. A returned message ID is provisional until commit and identifies its queued delivery. Actions cannot invoke uninitialized slots. State survives suspension; resume does not replay successful creation. Explicit upgrade migrations preserve the previous installed slot if validation or execution fails.

The simulator uses the same runtime with a virtual clock and transaction snapshots. Advancing a large time interval delivers each overdue timer once; it does not replay missed recurring intervals. The scheduler processes bounded work per entity. Per-entity/community rate accounting and complete receipt/status APIs remain release prerequisites.

Timed transform operations use `ctx.operations.animate("transform", { position: [x,y,z], rotation: [x,y,z] }, seconds)`, plus `pause`, `resume`, and `cancel` with the resource key. The returned ID identifies the committed operation. Replacement starts from the current sampled pose and queues a cancellation event for the old operation. `operation:completed` and `operation:cancelled` receive `{ id, resource, outcome }`. Angles interpolate in authored degrees along each axis; this API does not imply physics, navigation clearance, parenting or passenger support. Both inspection and the shared sampler resolve state from the persisted timing anchor. Client rendering integration is pending.

The full scope, incomplete items, parity matrix and release requirements remain in `docs/scriptable-world-plan.md`. No production reset or gateway switch is part of publishing this development module.
