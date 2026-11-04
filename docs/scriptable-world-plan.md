# Lantern programmable world refactor

Status: core implementation deployed on the isolated replacement, on `refactor/programmable-world`. Production cutover and the full release gates remain separate. See `runtime-verification.md` for capability-by-capability evidence and explicit remaining launch work.
Date: 2026-11-04.

## Implementation evidence

The replacement module is `world-server`, deployed to local database `lantern-runtime-refactor` and Maincloud `dbrinkmann-lantern-runtime-v2`. Its client, downloadable MCP server, and hosted PNG preview run at `https://lantern-runtime-v2.dbrinkmann.workers.dev`. The production Activity is unchanged; this is not a claim that the release parity matrix below is complete.

Implemented on the replacement branch:

- Persistent structured Object Variables, private per-slot and per-player state, public status, immutable packages, pinned slots, migrations, queued object/slot messages, timers and diagnostic receipts.
- Templates compose geometry and pinned behaviors. Export carries package source/configuration/licenses; import republishes into another namespace with explicit reference remapping. Live local tests export from a member's home, import under another publisher and spawn a functioning instance.
- Runtime spawn/destruction/room transfer, authored component edits, revision conflicts and component history/restore. Restore does not rewind private state. Appearance changes preserve operation anchors; transform changes produce cancellation events.
- Named rigid parts, six-part characters/cosmetics, signs, dynamic home-name binding, named lights, wall cutaways, material controls and off-floor fading. Geometry has a separate budget from script messages.
- Persisted once/loop/pingpong paths, heading, pause/resume/restart, speed multipliers, progress, completion/cancellation and deterministic event-seeded random draws.
- Predicted spatial crossings, self/room views, height/tags/hysteresis, player context, current membership, public player/entity inspection and bounded spatial queries. Leased 3D regions arbitrate hidden as well as visible objects. The virtual-time simulator processes object-view crossings between requested timeline endpoints.
- Player walking and approach-before-action, occupancy-checked seats, authored exits, rooms and claimable home entrances, home expansion, rename, avatar publication, private choices/text prompts, world-anchored speech and player speech events.
- Authoring/navigation state changes replan active player routes. Edits that newly enclose a player are rejected. Solid motion reserves a conservative swept footprint until paused/completed; this implements the initial navigation policy without a continuous physics solver.
- Multi-session presence, offline home routines and reconnect at the NPC's position. The social integration test covers these with real local connections.
- Opt-in Discord Activity entry, welcome-room bootstrap, session renewal, builder pairing and room-change subscriptions. The player UI fetches its authorized projection when the subscription changes rather than polling idle rooms. The local developer workshop retains polling for arbitrary author previews.
- Hover-only object labels, character names, manual camera panning and movement-triggered deadzone following, speech composer, emotes, common/home graph maps, responsive viewport layout and a preview renderer with focus/zoom/yaw/frozen time.
- Provider-neutral downloadable MCP bundle, package/room/template/avatar/history tools and hosted-preview plumbing. `docs/runtime-authoring.md` is the builder reference. The bundle handshake has been tested without cloning at runtime.

Verification commands: `npm test`, `npm run build`, `npm run check:runtime`, `npm run test:runtime:local`, `npm run test:runtime:access`, `npm run test:runtime:mcp`, `npm run test:runtime:browser`, `npm run test:runtime:social`, and `npm run test:runtime:preview`. Current local suites exercise the actual module, generated client, browser and MCP rather than substituting a browser-only simulation. Preview images are written under `.bridge` for inspection. Do not interpret these as a hosted Discord launch test.

Additional implemented core capabilities: behavior discovery/detach/reattach and bounded terminal lifecycle callbacks; room/home deletion with relocation and incoming-link cleanup; offline player trajectories; player-target selection with current-position validation; room entry/exit and native seat/portal notifications; renewal retry and copyable provider-neutral builder instructions.

Hosted verification now includes a downloaded MCP client creating 20x14 and 60x16 rooms with geometry, seats, eight home entrances/signs, a multi-surface receptionist and six reusable moving instances. Hosted PNG previews and standalone browser interactions are exercised against Maincloud. Remaining release work: actual Discord launch with the replacement URL mapping, full P01-P22 manual/visual/performance sign-off, the specified 30-minute release soak and rollback rehearsal. Core feature verification does not waive these production cutover gates. No GitHub Actions are used.

Static baseline evidence remains in `docs/baselines/runtime-render-2026-11-04.json`; comparable headless thresholds are at most 25% regression in scene preparation/p95 frame interval and one pixel of document overflow. Embedded Activity performance is not yet verified.

## Objective and decisions

Build one general, server-authoritative, event-driven object system supporting:

- Object-to-object messaging.
- Reusable, versioned behaviors that different agents can publish, discover, and instantiate.
- Runtime changes to transforms, named parts, appearance, motion, and instances.
- Rich player interactions and typed events.
- Permission-filtered entity inspection and spatial queries.
- Structured persistent Object Variables.

Favor refactoring over extending the current collection of special cases. Existing cyberpunk scenes and scripts may be discarded and rebuilt. Do not spend effort maintaining scene-v1 or old-script compatibility. The implementation must deliberately retire the old zone and community script execution paths, rather than introduce a third runtime.

Retain useful infrastructure: Discord identity and membership verification, property ownership, agent grants, SpacetimeDB transactions/subscriptions, the cuboid renderer, navigation math, and the sandboxed interpreter where appropriate. Reuse proven algorithms after extracting and testing them; do not preserve old data shapes solely for compatibility.

World-reset permission does not imply deleting Discord credentials, application configuration, user identities, or unrelated infrastructure. Implementation uses a separate development database until the replacement passes its acceptance gates. The eventual reset targets world content and old runtime tables explicitly.

Rebuilding content does not authorize removing working product capabilities. Old data formats, IDs and source syntax need not survive; the functionality in the parity contract below must be expressible and verified in the replacement before cutover. Generic examples alone are insufficient for release.

## Target architecture

```text
Discord Activity / builder MCP
             |
      authorized commands
             |
 Entity service + package registry + interaction service
             |
   durable event inboxes / scheduler
             |
 Behavior runtime: snapshot -> handler -> validated effects -> commit
             |
 Object Variables / components / outbox / timers / operations
             |
 permission-filtered subscriptions -> shared renderer
```

The runtime is a platform service, not a traffic controller. Doors, lamps, NPCs, machinery, puzzles, and games use the same event and effect mechanisms.

Keep reducers authoritative and synchronous. Scripts never execute arbitrary host JavaScript, network calls, filesystem operations, or inference. Builder agents author content through MCP; an agent does not need to remain connected for its creations to operate.

## 1. Entity and component model

Introduce a stable entity ID distinct from a scene placement ID and a behavior-instance ID. Scripts receive validated references, not database rows or arbitrary mutation handles.

An entity records community, room, owning property, kind, lifecycle generation, revision, and enabled state. Components describe supported features:

| Component | Responsibility |
| --- | --- |
| Transform | Position, orientation, parent, local/world conversion |
| Visual | Model reference, named parts, material and visibility overrides |
| Motion | Current operation and server-time trajectory |
| Collider | Explicit navigation/collision geometry and enabled state |
| Interaction | Available actions, input schemas, approach requirements |
| Character | Six-part rig, animation and navigation capabilities |
| Seat | Occupancy, approach and sit/stand semantics |
| Portal | Authorized destination and traversal rules |
| Light / text | Script-controlled lighting and sign content |
| Behaviors | Attached package instances and configuration |

Players expose a restricted entity facade; scripts cannot acquire ownership of a player or mutate arbitrary player data. Rooms can host behavior entities without visible geometry. Common spaces and homes remain ownership boundaries.

Remove arbitrary type exclusions such as "moving means not scriptable" through capability composition. Retain explicit unsupported combinations until their semantics are implemented: a seat on a moving platform is not automatically a working passenger system. Validation reports the missing capability rather than accepting a visually plausible but broken combination.

Named parts have stable IDs, pivots and parent transforms. A script addresses `panel`, `bulb`, or `display`, never an unstable box-array index. Parent cycles, excessive depth and cross-property parenting are rejected. Coordinates remain meters, Y-up and +Z-forward; authoring angles are degrees. Specify rotation order and use a common transform implementation in server, client and preview.

An entity may expose multiple interaction surfaces and an explicit speech anchor. This preserves a receptionist whose desk and character both address the same state and actions. Model this as one entity with named surfaces or authorized interaction forwarding, not duplicate behavior instances with divergent state. Interaction events identify the surface as well as the entity.

Property entrances are engine-managed relationships, not arbitrary user-script portals. They combine claim availability, ownership, a bidirectional link, an approach point, and a home-name text binding. Reuse common entity/component services while keeping claim and ownership invariants in authoritative platform code. Scriptable text must distinguish literal/script-owned content from engine-owned bindings so a package cannot overwrite someone else's home identity.

## 2. One event runtime

Refactor `scripts.ts`, `community-scripts.ts`, `intelligence.ts`, and the script-related sections of `index.ts` into explicit services: interpreter adapter, execution context, event dispatcher, effects validator, entity access, variables, motion, spatial services, and scheduling.

Every event has an ID, target entity and behavior generation, type, bounded payload, server timestamp, sequence, authenticated source, correlation ID and causal-chain budget. Source identifies a player, behavior instance, or engine event. A forwarded message does not inherit permission to act as its original player.

Each entity has a durable bounded inbox. Handlers do not call other handlers recursively. Event ordering within an entity follows server-assigned sequence; events from concurrent sources are ordered when accepted by the server. No global ordering promise across entities.

An event dispatch freezes its recipient slots and package generations when delivery begins, then invokes them in deterministic order. Each invocation reads current committed state plus its own staged writes; it does not reuse a stale snapshot captured when the event was enqueued. A failing invocation commits no variables, messages, reservations, or component changes. Successful invocation effects and its receipt commit atomically. Other behavior slots can still receive the event if one fails; there is no implicit transaction spanning all behaviors on an entity. Entity events are processed serially: finish or terminally reject all recipients of one event before starting the next. Business dependencies between slots use explicit messages rather than relying on attachment order.

Persist dispatch progress/receipts so a scheduler retry cannot duplicate committed effects. Queue insertion is atomic with the sender's successful commit. Sending means accepted for delivery, not successfully handled. Expose terminal outcomes for delivery rejection, expired target, stale generation, or failed handling where requested. No automatic retry of a deterministically failing user handler.

Define delivery acknowledgement precisely: the script receives a provisional receipt while staging; acceptance becomes durable only if the invocation commits. Recheck destination policy, schema, generation and queue capacity during commit and authorization again at delivery. A failed effect validation rolls back the invocation. Delivery-status events use reserved bounded capacity and cannot recursively request status events. Receipt retention and deduplication windows are bounded; terminal events are never replayed merely because their diagnostic receipt has expired.

Bound queue length, execution steps, payload size, messages per invocation, chain depth/work, timers and scheduled operations. Check admission before accepting a message; do not silently discard overflow. Meter per behavior, entity and community. Fault and suspend the offending behavior instead of disabling every sensor in the room. Admins need inspect, pause, resume and reset controls.

Introduce lifecycle events with distinct meanings:

- `created`: instance's initial persistent setup, once.
- `bound`: visual/component references become available.
- `activated` / `deactivated`: subscriptions and execution become active/inactive.
- `upgraded`: explicit migration to a new package revision.
- `unbound` / `destroying`: notification and cleanup opportunity.

Mandatory engine cleanup never depends on a script's cleanup handler succeeding. It cancels stale timers and operations, removes subscriptions and reservations, and invalidates queued work using lifecycle generations. Recompiling code must not silently recreate an entity or replay initial state initialization.

A new instance progresses through created -> bound -> activated before normal interactions and sensor notifications are admitted. Missing required components prevent activation. Deactivation invalidates work first, runs a bounded notification if possible, and performs unconditional engine cleanup. Upgrades atomically swap validated code/configuration/migrated state and increment the slot generation; already queued old-generation work receives a terminal stale-generation outcome. Destruction enters a closing state that rejects new interactions before final cleanup. Specify these transitions in tests, including interrupted activation and failed initialization.

Timers are durable one-shot deadlines, not promises of exact wall-clock delivery. Fire overdue timers once on recovery; do not replay every missed interval. Recurrence is an explicit reschedule with rate accounting. Bound scheduler batches and service entities fairly so one busy entity cannot starve other rooms. Delayed messages and retries retain causal metadata; independent timer events still consume per-entity/community work budgets. Never drain an unbounded backlog inside one reducer.

## 3. Structured Object Variables

Add a dedicated variables service with namespaces:

| Namespace | Access |
| --- | --- |
| Behavior state | Private persistent state for one behavior slot |
| Entity variables | Shared properties with declared writer/read permissions |
| Public properties | Explicitly exported, readable through inspection |
| Player-scoped state | Private to an entity/behavior and an authorized interacting player |
| Configuration | Validated instance configuration, edited by authorized builders |

Support null, booleans, finite numbers, strings, arrays, records, and validated entity references. Reject functions, prototypes, cycles and unsupported native values. Bound serialized bytes, depth, keys and array lengths. Return copies; mutations to a returned value are not persisted until explicitly set.

Provide get/set/delete/has and atomic field updates where needed. An absent key must be distinguishable from an explicit null. Writes within an invocation see its own staged updates. Other entities cannot directly write private variables; they request changes through messages.

Behavior state is namespaced automatically. Shared entity variables have declared ownership or an explicit shared-write policy; arbitrary execution order must not decide which module owns a property. State-change notifications occur after successful commit, with equality checks and loop budgets.

Each package declares configuration and state schemas and a state schema version. Upgrades run a bounded migration against a copy; failure leaves the old instance and state active. Code rollback must restore a compatible state snapshot or run a reverse migration, not blindly reuse incompatible state.

Expose a safe, deterministic utility library for records, arrays, strings, vectors, rotations and basic math. Current restrictions on all Math functionality should be replaced by a reviewed allowlist; ambient randomness, time and dynamic code remain unavailable. Random/time APIs are supplied by the execution context.

## 4. Messaging and entity inspection

Proposed API shape, to be frozen through contract tests before implementation:

```javascript
var target = ctx.config.get("door");
var info = ctx.entities.inspect(target, ["capabilities", "publicState"]);
ctx.messages.send(target, "door.requestOpen", { reason: "switch" });
```

Messages are namespaced, schema-validated and asynchronous. A receiver advertises accepted message types and access policy. Default scope is the same property; cross-property links need explicit receiver approval. Same-room proximity is not write authority. Cross-community messages are excluded from the first release.

Support directed entity and behavior-slot messages first. Add bounded tag/group fan-out only after queue accounting works; expand recipients into explicit deliveries under a fan-out limit. Include request IDs/correlation for request/reply patterns, but no blocking wait inside a script.

Inspection can expose identity, display name, room, transform, bounds, tags, velocity, capabilities and public properties when authorized. General entity inspection never returns private variables, access-hidden entities, secrets, raw identity tokens or another creator's private source; authorized debugging uses separately scoped APIs. Distinguish not visible/not available without leaking hidden existence.

Separate render visibility from access visibility. A creator may inspect its own temporarily invisible entity; hiding a prop must not make its state unavailable for debugging. Ordinary sensors omit render-hidden entities by default, but their reservations remain effective. Player privacy and cross-property access still constrain queries. Returned entity references are identifiers, not transferable authority: validate them on every operation and return a defined unavailable result after deletion or unauthorized room transfer.

Spatial queries return bounded snapshots. Existing view subscriptions become another producer of entity events. Queries and subscriptions share filtering, height, hysteresis and visibility semantics. Add operation-time sampling so scripts and clients observe consistent positions from the same trajectories.

Keep an explicit motion/sensing contract: analytically scheduled crossings apply to supported piecewise-linear trajectories with fixed heading within each segment. Do not claim exact crossing prediction for arbitrary continuously rotating sensors or eased curves. Initial release permits fixed room sensors and self sensors on supported trajectories; reject unsupported moving-sensor combinations or convert them to a documented bounded approximation before accepting them. Visual part animation can be richer than authoritative sensor motion. Spatial events include sampled occurrence time and position; handlers act on current state and must tolerate delivery delay. Tests cover a deadline becoming due during a path replacement and simultaneous boundaries.

## 5. Reusable behavior composition and agent sharing

A behavior package contains:

- Stable namespaced package ID, version, immutable revision hash, author and license.
- Runtime API version, source and pinned dependencies.
- Configuration/state schemas and migrations.
- Consumed and emitted event/message schemas.
- Required capabilities and declared writable resources.
- Documentation, examples, fixtures and resource expectations.

An entity attaches packages in named slots. Package code is shared; each slot has independent state and configuration. Logical references such as `door` and `indicator` are configuration, not hardcoded world IDs in package source.

Declare resource ownership at attachment: for example one slot owns `motion`, another owns `light:bulb`, another owns `text:display`. Reject incompatible exclusive writers. Allow explicitly declared shared resources only with defined arbitration. Multiple scripts should not fight over the same transform using last-writer-wins behavior.

Use a registry with private, community and public visibility. Publish immutable revisions; instances pin exact hashes. Updating a package never silently updates all installed instances. Builders preview a diff and explicitly apply an upgrade, including schema migrations and changed permissions. No automatic execution while browsing or importing a package.

Agents share packages through registry references or portable bundles. Bundles include manifests, schemas, source, dependency locks and tests; they exclude credentials, live private state and community-specific grants. Verify content hashes and resolve the full dependency graph before installation. Hashes establish integrity, not trust; attachment still checks capabilities and ownership.

Registry writes use the paired user's identity and scoped grant, not a new agent-owned account. Enforce namespace ownership, package read/install rights, bounded acyclic dependency resolution and a deterministic build artifact. Runtime imports cannot fetch code. Dependencies execute within the caller's resource budget and cannot broaden its grants. A public package's source and manifest are readable for agent reuse; private package export requires access. Unlisting a package prevents discovery/new installation but does not silently break pinned instances; administrative suspension is a separate explicit operation.

An explicit MCP upgrade is sufficient authorization within an existing builder grant; there is no additional in-game approval/review queue. The diff and permission checks are machine-readable results available before applying the upgrade. Newly requested capabilities outside the grant are rejected.

Add reusable entity templates combining components, named parts and behavior slots. Templates reference authored models rather than requiring a built-in model catalog. A useful door behavior can work with many independently authored door models implementing the same named-part contract.

## 6. Runtime world manipulation

Separate immutable authored definitions from replicated runtime component state. Opening a door changes its runtime state, not the stored room JSON. Editor edits and runtime operations use separate revisions and explicit reconciliation rules.

Authoring updates are validated atomic change sets, including any new components, behavior bindings and references. No intermediate invalid scene is exposed. Unchanged component identities retain runtime state. Appearance-only updates retain all movement, seats, reservations and timers. Removing/replacing an actively controlled component requires an explicit operation-cancellation policy; incompatible edits fail rather than implicitly resetting unrelated behavior. Restore is a new revision with reference/ownership validation, not a blind historical row overwrite. Restoring authored content does not restore private runtime state unless a separately scoped state restore is requested.

Implement in this order:

1. Visibility, named-part color/material parameters, light properties, sign text, character animation.
2. Transform changes and bounded timed animations, including hinge pivots.
3. Script-selected paths/destinations, cancellation and replacement of motion operations.
4. Authorized creation/destruction of instances from pinned templates.
5. Room transfer for non-player entities, after lifecycle cleanup and destination authorization are complete.

Every asynchronous operation returns an operation ID and produces completion/cancellation/failure events. Replacement invalidates the old generation. Late joiners reconstruct the same animation from committed start state, server time and duration. Continuous animation must not require a script callback or reducer per frame.

Runtime collider changes must update authoritative navigation and invalidate affected paths. A door being visually open and still blocking movement is a failure. Start with bounded obstacle updates and room navigation revisions; arbitrary rigid-body physics and moving-platform passengers are separate projects.

For the initial hinged-door implementation, use authored open/closed navigation shapes and a conservative swept clearance region. A close request fails or waits if an occupant is in that region; it must not entomb or forcibly move a player. Update navigation at defined operation boundaries and keep the passage blocked until the opening is clear. Continuously swept rigid-body collision remains deferred. Recompute/cancel affected approach commands when the navigation revision changes.

Creation consumes entity/geometry/script budgets and inherits explicit property ownership. Templates cannot escalate permissions. Destruction must account for occupants, seats, portals, queued events, references, reservations and child entities; reject or follow a documented relocation policy. A world escape/return action remains engine-owned.

## 7. Rich interaction events

Replace special action callbacks with typed interaction descriptors: ID, label, input schema, target capability, approach/reach requirements, availability and required permission. Engine-owned entry points create authenticated events; scripts cannot forge engine events through messaging.

First interaction types:

- Primary/secondary use and named actions with bounded payloads.
- Choice dialogs and short text input.
- Entity targeting with allowed target kinds/range.
- Sit/stand and portal traversal notifications.
- Opt-in local public speech subscriptions.

Dialog responses carry an opaque request ID tied to player, entity, behavior generation and expiry. Revalidate membership, room/range and request state when the response arrives; reject replay, stale UI and forged actor IDs. Private speech is never converted into a public listener event. Script-origin speech does not trigger listeners by default; any future opt-in must carry source provenance and chain budgets.

Render interactions in the world where practical: bubbles, contextual choices and focused prompts. Do not add a second permanent chat panel. Provide keyboard/touch access using the same actions and server validation as pointer input.

Player-affecting capabilities such as animation, attachment or transport require narrowly scoped consent or an engine-defined interaction grant. They are not implied by being allowed to edit a room. The first release does not grant arbitrary player control.

## 8. Authoring and debugging surface

MCP should expose the same model the engine uses, with generated schemas and examples from one contract source. Retire conflicting legacy guide text and tools rather than documenting exceptions indefinitely.

Required tool families:

- Entity inspect/query/create/update and component validation.
- Behavior search/get/publish/export/import/attach/configure/upgrade/detach.
- Variable inspection with visibility filtering.
- Event traces, errors, queue status, budgets and active operations.
- Simulation: instantiate a fixture, advance virtual time, inject validated player/message events, inspect state, render a frame and assert outcomes.

Simulation uses the production interpreter, effect validation, motion and event scheduling code with an isolated store and clock. A renderer-only preview is not sufficient. Agents need a way to reproduce a failed sequence without editing a live room.

Trace entries record event ID/source/type, target slot, package hash, duration/work, effect summaries and outcome. Redact private payloads by viewer permission. Bound retention and expose aggregate budget usage rather than retaining unlimited event history.

Builder authorization remains separate from installed script authority. Pairing expiry stops authoring access, not ordinary approved behavior execution. Revoking a runtime grant or property authority must take effect at execution, including for already queued messages.

Installed behavior authority is a persisted property-scoped capability grant, not the creator's short-lived Discord session lease. An owner logging off or a transient membership verification lapse does not stop their world. Explicit administrative revocation, property transfer, or confirmed membership removal follows a defined suspension/regrant policy. Test these separately from ordinary connection expiry. Packages cannot manufacture player consent or promote an audit correlation ID into acting-player authority.

## 9. Storage and API boundaries

Proposed table groups, refined during schema implementation:

- Entities, component definitions, runtime component state and references.
- Package metadata, immutable package revisions and dependency locks.
- Behavior slots, configuration, state schema versions and capability grants.
- Object Variables partitioned by entity/slot/player namespace.
- Event inboxes, dispatch receipts, timer records and operation records.
- Spatial subscriptions, memberships and expiring reservations.
- Interaction requests, trace records and resource accounting.

Keep tables private and expose filtered views. Query by community/property/room/entity indices, not whole-world scans. Avoid invalidating every room subscription on each variable write. Replicate visible state and operation anchors, not private execution internals.

Start with conservative configurable quotas; increase them using measured load fixtures. Replace the fixed 16-script room limit with separate budgets for resident instances, active execution, sensing, geometry, queued work and replication. Do not remove limits before accounting and fault isolation exist.

## Delivery sequence and gates

Implementation priority update: deliver visible, usable slices through the renderer and creator tools before expanding advanced delivery diagnostics or package discovery. Keep property authorization, bounded execution and transactional updates. Remaining release/parity gates still apply before replacing production; they do not block development previews. Next is authoritative navigation/collision and player interaction, followed by world lifecycle and existing social/home functionality.

| Phase | Deliverables | Required gate |
| --- | --- | --- |
| 0: Contract and extraction | Capability model, event envelope, value schemas, effect protocol; extract reusable math/interpreter/permissions | Contract tests and a dependency map; one declared replacement architecture |
| 1: Runtime foundation | Entity identity, variables, lifecycle, inbox/outbox, receipts, budgets and fault isolation | Restart/retry/rollback tests; hostile script cannot disable unrelated objects |
| 2: Cooperation | Inspection, directed messaging, permission checks, request/reply correlation | Switch communicates with an independently scripted receiver; denial/revocation/spam tested |
| 3: Behavior packages | Registry, slots, manifests, schemas, resource arbitration, pinned upgrades and migrations | Two agents install the same package with different config/state; failed migration leaves old instance intact |
| 4: Expression | Named parts, visual effects, operations, dynamic paths, collider/navigation updates | Door, lamp and text display respond without room republishing; late-join and cancellation verified |
| 5: Interaction | Typed actions, dialogs, input/targeting, sit/stand, public-speech subscriptions | Forged/stale responses rejected; keyboard/touch and proximity rules agree |
| 6: World lifecycle | Templates, bounded spawn/destruction, non-player transfer, cleanup | No orphaned events/references/reservations; ownership and destination limits enforced |
| 7: Creator release | Simulation, traces, generated guide/tools, quotas, clean-world bootstrap | Independent agent completes end-to-end fixture using only published MCP/docs |

Tracing, simulation harness and security tests begin in phase 1 and grow with each phase. They are not postponed until phase 7. Phase 7 is the completeness/release gate.

Phase 1 includes the minimum attach/configure and authenticated action entry points needed to exercise a behavior, using fixed local package fixtures. Phase 2 tests messages with these fixtures; phase 3 replaces development package loading with the real registry and removes that scaffolding. This avoids making message tests depend on an unfinished registry or waiting until phase 5 to exercise any player action. The production interpreter remains the existing bounded ES5 interpreter for this refactor; changing language/interpreter is out of scope unless the phase-0 structured-value spike finds a blocking issue.

Each phase must remove the superseded implementation from the replacement application. Temporary development scaffolding has an explicit deletion task. Do not ship parallel runtimes selected by scene type or a growing set of compatibility flags.

## End-to-end acceptance fixtures

1. Switch, hinged door and indicator: independently authored packages communicate through declared schemas. Door collider agrees with visual state. Lamp observes door state through an explicit message/public-property contract.
2. Configurable machine: private structured state, a public status, a timed operation, cancellation, shared-region reservation and a choice dialog.
3. Character guide: inspected nearby entities, opt-in greeting, targeted dialogue, selected destination and arrival event; uses the same runtime as props.
4. Reusable installation: export from one agent, import by another into a different property, remap configured references, instantiate twice, and verify state isolation.
5. Adversarial world: cyclic messaging, oversized values, forged player identity, unauthorized inspection, revoked grants, queue overflow, failing migration, stale operation and subscriber loops. Healthy neighbors continue functioning.
6. Restart/late join: database/module restart, interrupted dispatch and reconnect preserve committed state and avoid duplicate effects. Client position/appearance matches authoritative operations.

No traffic-specific policy belongs in platform code. In addition to these generic fixtures, the parity fixtures below must demonstrate that builders can recreate existing traffic and social-world behavior using the same primitives.

## Existing-world functionality parity contract

Comparison performed on 2026-11-04 using read-only Maincloud queries for rooms 3 and 23 and their scripted objects, plus the current community authoring contract and regression-test coverage. This is a data/code audit, not a fresh manual Discord playthrough. Re-run the tests and visual checks against the replacement; current test files are evidence of requirements, not proof that a new implementation passes them.

### Observed content and known failures

- Welcome Station (room 3, revision 5): 20 x 14m, 15 models, 19 placements, six lights, four signs, cutaway walls, two benches, an authored exit, and a waving six-part receptionist. Script 2 is referenced by both the reception desk and NPC. It has five actions (greet, location, directions, housing, news), private personalized arrival greetings, public emotes, a persistent visit count and rotating rumors. Its lastError was empty.
- Neon-dori (room 23, revision 7): 60 x 16m, 31 models, 38 placements, six lights, 20 signs, all seven material presets, three stools, a subway exit, eight claimable home entrances and eight live home-name signs with VACANT fallback. Four low-altitude and two rooftop-altitude vehicles have scripted one-way motion. Low routes extend to X +/-40m; high routes to +/-46m at Y 12.5/14m, beyond the floor's X +/-30m edge.
- At this audit, all six vehicle scripts reported `Error: Unknown view.` Previous healthy checks and builder reports do not establish current health. Treat yielding, following and respawn as required behavior to reproduce and repair, not as verified passing live behavior. Capture causal traces and test subscription loss/recovery; do not infer a root cause from lastError alone.
- Current signs in these two sources do not use `attachTo`; attached-sign movement/fading is nevertheless an existing platform capability and belongs in parity tests. Sensor height, reservations and short timers are also platform capabilities even if a particular vehicle script does not use them.
- The shared desk/NPC script reference is present in stored content even though newer validation restricts that combination. Preserve the interaction outcome through the new entity model, not this inconsistency between stored data and validation.

### Mandatory parity matrix

| ID / existing capability | Required replacement outcome | Implementation owner / acceptance evidence |
| --- | --- | --- |
| P01: Discord community entry | Verified guild membership, Discord display name, admin common-space authority, community isolation and server-selected welcome room work without a local web app | Identity/property services; two-user, two-community and role-revocation tests |
| P02: Authored geometry | Variable-size rooms up to the current 100m dimensions, cuboid models, shared model instances, rotated boxes, authored floors and reachable spawn remain supported | Entity/visual components; rebuild a 60 x 16m street and a 20 x 14m station with equivalent content density |
| P03: Materials and lighting | Plain/asphalt/concrete/metal/wood/fabric/glass, tint, roughness, optional wear, transparency, emissive boxes, floor materials, lights and current industrial shading remain available | Renderer; comparative screenshots including asphalt, transparent canopies, neon and floor seams; no blanket texture regression |
| P04: Signs and cutaways | Unicode/multiline signs, readable front faces, optional backfaces, sizing, emissive text, camera-dependent wall cutaways, and attached signs that move/fade with parents | Visual/text components; view both sides and inspect an attached sign during motion |
| P05: Home-name binding | A claimed doorway sign resolves the destination property's current name; vacant/removed links use fallback; changes arrive without republishing geometry | Property binding + text component; claim/rename/remove and preview-context tests |
| P06: Homes and common space | Admins author entrance spots; members can claim only available spots, one claimant wins a race, and no free spot means no home creation in that room | Engine property service; concurrent claim, exhausted spots, deletion/relocation and ownership tests |
| P07: Connected maps | Common-room graph, named home entrances, a home's expandable room graph, return links and return-to-welcome work; no mandatory Nexus or coordinate competition | Navigation/property services; create a multi-room home, travel both directions and recover from broken content |
| P08: Movement and interaction approach | Click authored nonblocking floor overlays such as roads to walk; navigate around obstacles; approach doors, NPCs, props and seats before acting; new commands cancel pending approach | Interaction/navigation client and server; road, stair exit, receptionist and seat tests with stale-command cancellation |
| P09: Camera and layout | Character-scale initial zoom independent of room size, free zoom, orbit, manual pan, dead-zone auto-pan and recenter-on-movement; no document scrolling to reach core game controls in supported layouts | Existing camera/UI retained through refactor; camera tests and desktop/embedded/mobile viewport checks |
| P10: Contextual labels | Doors/interactive objects show labels on hover/focus or equivalent touch interaction, not permanent overlapping labels | Interaction presentation; crowded-doorway screenshot and keyboard/touch checks |
| P11: Seats and avatars | Station benches and street stools support approach/sit/stand, occupancy rules and correct six-part rig pose; authored rigid cosmetics and idle/walk/sit/wave/talk remain | Seat/character components; two users contend for a seat, stand safely, and render different authored characters |
| P12: Away presence | A home owner becomes an away avatar at home after disconnect, follows the configured idle routine, and resumes at the avatar's location on return; agent connections do not keep owners online | Presence/character services; disconnect/reconnect, controller takeover, multiple tabs and agent-only connection tests |
| P13: Local speech | Public say/emote, actor-only private replies, temporary world-anchored bubbles, no permanent bottom chat panel, no redundant player-name prefix; object attribution remains clear | Interaction/speech services; two users plus builder verify private-message isolation and room-change cleanup |
| P14: Receptionist | Room-arrival greeting with player name, persistent visit count, five contextual actions, cycling news, public emote, and private responses from either desk or NPC interaction surface | Shared entity + behavior package; actions/state/speech-anchor test, separate from optional proximity greeting |
| P15: Scripted prop motion | Loop/pingpong/once, authored offset and speed, pause/resume/restart/progress, visibility and completion callbacks; heading follows path; late joiners agree | Motion operations; timing/cancellation/restart/late-join tests and unchanged-phase checks on appearance edits |
| P16: Off-floor/elevated motion | Routes can extend beyond room floor within validated world bounds, fade at the edge, and run above buildings; hidden geometry cannot intercept clicks | Motion/renderer; six-vehicle equivalent fixture at both altitude bands with entry/exit screenshots |
| P17: Sensing and cooperation | Named self/room views, tags, optional height, hysteresis, current membership, enter/exit actor context, prediction invalidation and hidden-source sensing retain their semantics or explicit equivalent | Spatial service; yielding, queue release, slower-leader following and separate altitude sensing tests |
| P18: Respawn and timing | Hidden endpoint completion, bounded deterministic random delay, restart at spawn while hidden, occupancy checks, reservations, timer cancellation and subsecond events remain authorable | General packages/scheduler; competing respawns, reservation expiry, stale timers and error rollback tests |
| P19: Live publication | Authorized agents edit live without an in-game review queue; renderer updates without refresh; revision conflicts are rejected; material-only edits preserve walking, seats and motion | Authoring service; two editors, hot publication and appearance-only effect-scope tests |
| P20: Agent usability | Any supported MCP agent can connect without cloning the application; clear connection instructions and pairing status; explicit common-space grant, revocation, renewal recovery, scoped inspect and errors | MCP + Activity; independent-agent install/build, transient renewal failure and revoked-admin tests |
| P21: Preview and recovery | Hosted PNG preview of drafts with focus/zoom/yaw/time, live home-name resolution where authorized, validation before publish, revision history and restore remain | Authoring/preview tooling; large-room close-up, unpublished draft, history/restore and permission tests |
| P22: Runtime safety and continuity | Persistent state, deterministic execution, rollback, script-independent execution, generation invalidation, subscription recovery, useful lastError/traces and isolated quotas | Runtime; restart, repeated route cycles, lost-subscription fault injection and no cascading room-wide shutdown |

Functional equivalence does not require preserving the current numeric IDs, visual theme, exact geometry, dialogue wording, old ES5 API names or room JSON. It does require an agent to express the same outcomes with the released tools. Neither an unsupported capability nor an undocumented manual database repair counts as parity.

### Additional release gates

1. Build a station-and-common-street fixture through the new public authoring API. Include two benches, three stools, a multi-surface receptionist, bidirectional room exits, eight claimable home entrances and bound vacancy/home-name signs. Use the baseline room sizes and comparable geometry/sign/light density; do not reduce the fixture to hide renderer or quota regressions.
2. Rebuild six independently configured moving instances from reusable packages: four low and two elevated. Verify pedestrians, queuing, following, completion, hidden restart, reservations and late joins across repeated complete cycles. Trace every failure and establish a sustained error-free run with no disappearing subscriptions. Test generic sensor/lifecycle components independently as well; do not hardcode traffic rules into the engine.
3. Run two real player identities and a separately authorized builder through arrival, receptionist dialogue, movement, seating, home claiming, sign updates, home expansion, away presence and return. Include admin downgrade, pairing renewal failure and recovery, and failed concurrent claims.
4. Run renderer/UI parity at embedded Discord desktop size and a narrow/mobile viewport. Compare fixed-camera captures for material fidelity, glyphs, cutaways, hover labels, bubbles, avatar poses and off-floor props. Manual Discord launch verification remains a distinct gate from automated standalone browser tests.
5. Assign every P01-P22 row an implementation owner and a passing test/manual-evidence reference before release. Existing suites to port include `community.ts`, `community-browser.ts`, `community-agent.ts`, `community-agent-browser.ts`, `community-scripts.ts`, `community-scripts-browser.ts`, `camera.test.ts`, `scene-features.test.ts`, `art-preview.ts`, `intelligence-integration.ts`, `object-platform-integration.ts`, and `renewal.test.ts`. Add tests for requirements not adequately covered; do not preserve legacy imports just to keep old tests green.

Phase 0 records the baseline; phases 1-6 implement each row's service; phase 7 requires all parity evidence in addition to the new generic-system fixtures. Production scene resets and production runtime removal remain blocked on this gate, even though content preservation itself is not required. Removing superseded code from the isolated replacement branch during implementation is expected.

### Measurable completion evidence

Before broad implementation, phase 0 fixes supported viewport sizes and records baseline client frame times, cold/warm scene load times, subscription traffic and server work for the station/street fixture on a named reference environment. Set explicit acceptable regression thresholds in that record; do not decide them after seeing refactor results.

The release soak lasts at least 30 minutes and includes at least 20 complete cycles per moving instance, repeated joins/leaves and two simultaneous player sessions. Require no unexpected script faults, vanished subscriptions, duplicate terminal operation effects, growing orphan queues or unreleased expired reservations. A known-failing current traffic baseline is not a reason to waive these assertions. Record identifiers, versions, logs and screenshots rather than a bare "passed" label.

Run adversarial tests for structured-value conversion and host API boundaries before enabling public package execution. Snapshot/isolation tests verify that scripts cannot mutate database or host objects through returned arrays/records. Trace access and retention tests must cover private player state and dialogue payloads, not only entity ownership.

## Reset and deployment

Build on a dedicated refactor branch and isolated database. Keep current production available during implementation; old-format compatibility is not a release requirement, but the P01-P22 functionality parity gate is.

At cutover, take a recovery snapshot, enumerate the world-content reset, provision the new schema and an empty common-space bootstrap, deploy the matching client/MCP/guide, and verify with a fresh community and two identities. Preserve application secrets and account/guild identity infrastructure. Remove legacy runtime entry points, generated bindings, scene schemas and obsolete docs from the released app. GitHub Actions remain disabled; validation and deployment run explicitly.

Prefer switching the gateway/client to the independently verified replacement database over destructively republishing the old database. Reprovision required gateway/operator identities and guild/property roots in the replacement; do not copy old world references into new membership records. Reset the old database only after the rollback window and explicit target checks. Record the exact old/new database, client build, gateway configuration and MCP API version as one release unit. Pause content writes during the switch and verify that stale clients fail clearly with an upgrade/reconnect response.

Rehearse rollback before cutover. Rollback restores the prior release unit and its database; it does not attempt reverse migration of new-world writes. Document the point-in-time recovery boundary and any writes that would be lost. Keep backup access restricted and credentials outside scene/package exports. Public guides must identify the active API version so builders do not receive mismatched instructions during the transition.

Publish a builder handoff explaining the new contracts and how to rebuild content. The completion criterion is the independent-agent fixture plus all parity gates, not merely a successful deployment or a hand-authored demo. No capability already provided by the current world or community platform may be silently moved into the deferred list.

## Original design review disposition (before implementation)

Reviewed for implementability, parity and scope. The architecture is ready to start phase 0; this is not a claim that the implementation or cutover is ready. Phase 0 must deliver the frozen event/effect/value contracts, lifecycle transition tests, structured-value sandbox spike, numeric resource/performance budgets and baseline evidence. These are implementation prerequisites, not unanswered product questions.

The critical risks are event/operation timing, untrusted structured-value conversion, navigation changes under occupants, and atomic updates across package/component/state revisions. They have explicit tests and delivery gates above. No additional user decision is required to begin the refactor under the stated scope.

## Explicitly deferred

Full physics, passenger-carrying platforms, arbitrary player-control scripts, cross-community messaging, unrestricted HTTP, economy/payment systems, and marketplace monetization. None is necessary to deliver the six requested capabilities. Package sharing and bounded template spawning are included; commerce and unrestricted external code loading are not.
