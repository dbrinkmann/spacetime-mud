# Programmable world development module

This module is an **incomplete isolated replacement**, not the deployed Lantern application. Authoring checks gateway-provisioned membership, property ownership/admin authority and delegated builder grants. Player action injection and root property provisioning remain operator-only development entry points. The Activity integration, complete creator tools, full authority lifecycle cleanup and functionality parity gates must be completed before public deployment.

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
npm run test:runtime:access
npm run test:runtime:mcp
npm run test:runtime:browser
```

The local integration scripts deliberately fix their target to `http://127.0.0.1:3030` / `lantern-runtime-refactor`. Set `SPACETIME_CLI` to the CLI executable if it is not at the workspace's existing Windows tools path. They create uniquely named fixture entities, communities and immutable packages; they do not delete the database. Provisioning uses the publishing operator's CLI identity. The access test uses three separate anonymous SDK identities and authorizes them through the trusted provisioning reducers before checking permissions.

Current authoring contracts are development contracts. Packages declare typed event subscriptions, state/config schemas, exclusive writable component resources, and optional pure state migrations. A published bundle's SHA-256 covers canonical manifest/source. Versions are immutable. An instance pins a hash, and an upgrade must preserve package identity. Migration code has access only to copied state and configuration; it cannot send messages or modify the world.

The initial component set is visibility, transform, light, text and cuboid visuals. A handler stages changes; the dispatcher validates the whole invocation before committing. Messages are asynchronous, same-property, generation-scoped and schema-checked. A returned message ID is provisional until commit and identifies its queued delivery. Actions cannot invoke uninitialized slots. State survives suspension; resume does not replay successful creation. Explicit upgrade migrations preserve the previous installed slot if validation or execution fails.

For the visual integration test, run Vite on port 5179, then `npm run test:runtime:browser`. It provisions an isolated community for a browser identity and installs three reusable packages through ordinary authoring reducers. A real geometry click selects a switch; its action sends a message to a hinged door, which sends another to a lamp. The test verifies live operation completion, reload persistence and narrow layout and writes `.bridge/runtime-workbench.png`. The workshop is available only in development at `?runtime`; it uses its own browser identity, which needs property-edit authority. Test browser credentials are not copied to your browser.

This is an author preview, not a playable replacement: it polls `previewRoom` every 250ms, renders server motion anchors locally, and invokes `testEntityAction` under builder permissions. There is no player proximity bypass: real player interactions are still unimplemented. The renderer does not execute scripts. `world_preview_room` exposes the same projection as JSON (not PNG); `world_test_action` lets authorized agents exercise live behaviors. Both are separate from the existing production tools. Navigation, collision and Discord integration remain next.

The simulator uses the same runtime with a virtual clock and transaction snapshots. Advancing a large time interval delivers each overdue timer once; it does not replay missed recurring intervals. The scheduler processes bounded work per entity. Persisted fixed one-second windows limit invocations and interpreter work per slot, entity and community. Exhaustion defers the current delivery without dropping it or faulting the script; the entity preserves FIFO order. Failed invocations retain their maximum work reservation. These are fixed windows, not sliding-window limits. Complete causal-work accounting and receipt/status APIs remain release prerequisites.

Run `npm run mcp:runtime` for the development stdio MCP server. It defaults to the isolated local module; override with `LANTERN_RUNTIME_HOST` and `LANTERN_RUNTIME_DATABASE`. Legacy `SPACETIME_*` settings are deliberately ignored. The client checks `runtimeInfo` before returning its public identity. Credentials are stored separately under `~/.lantern-agent/runtime-v2`; tool responses never include the token. This is not yet the hosted creator installation flow.

`world_guide`, `world_validate_package` and `world_simulate` work without a live connection. Simulation uses the same runtime and caps a whole request at 256 scheduler steps. Live tools support paired package publication/export, entity creation, behavior attachment/upgrade/suspension and authorized diagnostic inspection. They do not yet author room geometry or connect the replacement to the Activity. `ctx.messages.sendToSlot(entityId, localSlotName, name, payload)` targets one behavior; `send` addresses all subscribed behaviors on an entity. Both validate recipient schemas and recheck sender authority at delivery.

Timed transform operations use `ctx.operations.animate("transform", { position: [x,y,z], rotation: [x,y,z] }, seconds)`, plus `pause`, `resume`, and `cancel` with the resource key. The returned ID identifies the committed operation. Replacement starts from the current sampled pose and queues a cancellation event for the old operation. `operation:completed` and `operation:cancelled` receive `{ id, resource, outcome }`. Angles interpolate in authored degrees along each axis; this API does not imply physics, navigation clearance, parenting or passenger support. Both inspection and the shared sampler resolve state from the persisted timing anchor. Client rendering integration is pending.

The full scope, incomplete items, parity matrix and release requirements remain in `docs/scriptable-world-plan.md`. No production reset or gateway switch is part of publishing this development module.

Shared variables use `ctx.variables.get/has/set/delete`. Their exclusive writer declares `writes: ["variables.key"]` and a `variables.key` schema in the manifest's `variables` record. Readers declare `reads: ["variables.key"]`. A `variable:key` subscription receives `{key, exists}` after a successful commit and reads the current committed value. Equal final values do not retrigger observers. General entity inspection exposes public properties, not these private shared variables or other slots' private state. Installed grants include both read and write resources.
