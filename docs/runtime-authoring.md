# Lantern runtime v2 authoring

This API belongs to the replacement runtime on `refactor/programmable-world`. The live Activity still uses the old API.

Run `lantern-runtime.mjs` with Node 22+ as a stdio MCP server. Set `LANTERN_RUNTIME_HOST`, `LANTERN_RUNTIME_DATABASE` and `LANTERN_RUNTIME_SITE` to the matching replacement deployment. No repository clone is needed. Call `world_connect`, pair its identity in the Activity, then read `world_guide`. Credentials stay in `~/.lantern-agent/runtime-v2`; never paste them into chat.

## Build and share

Inspect rooms with `world_list_rooms` and `world_preview_room`. Create a room with `world_create_room`: one origin-centered walk surface, up to 100 meters per side. Common space and each member's home have separate room graphs. Admins author visible home entrances with `homeEntrance` and a reachable `interaction.approach`; members claim an entrance. Ordinary exit entities connect additional rooms.

Create entities with `world_create_entity`. Components include `visual` cuboid geometry with existing material/roughness/wear/emissive fields, `transform`, `visibility`, `light`, `text`, `sign`, `wall`, `character`, `animation`, `collider`, `interaction`, `seat`, `exit`, `tags` and hover-only `label`.

Named parts share a suffix: `visual.leaf`, `transform.leaf`, `sign.leaf`, `light.leaf`, `wall.leaf`, `text.leaf`, `visibility.leaf`. Signs on a wall part inherit its cutaway fade. A sign's `homeEntrance` points to an entrance entity; its text is the vacant fallback. Characters use the existing six-part rig and rigid cosmetics. Positive yaw rotates local +Z toward +X.

Validate packages, simulate, publish and attach their exact hash in named slots. Slots own private structured state/configuration; shared Object Variables have declared schemas/readers/writers. A component resource has one writer. Messages queue asynchronously through `ctx.messages.send` or `sendToSlot`.

Templates combine components and pinned behavior slots. Export includes dependencies and licenses, without private instance state. Import republishes under a new namespace with explicit component/configuration reference replacements; source is never rewritten. Spawn creates independent instances.

Patch components against an inspected revision. Appearance-only edits retain motion and private state. Transform edits cancel the changed operation with an event. History/restore creates a new component revision without rewinding private state.

## Script API

`world_guide` is the current API reference and includes validated examples. Handlers are bounded ES5 functions `(ctx,payload)` subscribed by manifest `type:name` entries.

- State: `ctx.state`, shared `ctx.variables`, selected `ctx.public` status and private per-player `ctx.player.get/set`.
- Interaction: public `say`, private `tell`, choice `dialog` and short-text `prompt`. Replies deliver `dialog:name` with `{choice}` or `{text}`. Player speech delivers `speech:said` with `{speaker,text}`. Script speech does not recursively trigger scripts.
- Time: `timers.after/cancel`, `clock.now`, deterministic event-seeded `random`.
- Motion: `operations.animate/follow/pause/resume/restart/cancel/setSpeed/progress`. Paths support once/loop/pingpong and segment headings. Restart retains paused state. Speed is a multiplier of authored duration. Completion/cancellation yields `{id,resource,outcome}`. Clients interpolate persisted anchors rather than calling reducers every frame.
- Sensing: `subscribe/unsubscribe/view`, self/room boxes, optional height, tags and hysteresis. Events carry `{view,entity:{id,kind}}`. `entities.query` returns bounded spatial snapshots; `inspect` includes sampled players using `player:IDENTITY` references.
- Coordination: `reservations.claim(name,{center,size},seconds)` atomically claims a room-space 3D region, returns boolean, and can renew its lease. `release` frees it. Hidden objects retain claims; expiry and lifecycle cleanup release them. This is not a physics collider.
- World: `world.spawn(hash,position)`, `destroy()` and `transfer(room,position)` within the object's property. Declare corresponding `world.*` writes. Transfer cancels old timers/views/operations and emits `lifecycle:bound`; re-subscribe there when needed.

## Preview and verification

`world_preview` renders live or unpublished RoomPresentation data to PNG through the hosted renderer. Focus, zoom, yaw and time offset help inspect details. The default camera is near `[9,8,12]` looking toward `[0,1,0]`; its scale is independent of room size. Front walls fade with viewing direction.

`world_simulate` uses the production interpreter, queued messages, timers, operations and predicted object-view crossings under virtual time. Inspect after initialization: accepted publication does not imply queued handlers have finished.

Current limits: planar player navigation checks changed obstacles at arrival rather than continuously avoiding them. Self-frame views require fixed yaw or path-segment heading; use room-frame views while rotating. Buttons expose null-payload actions; dialogues provide player input. The offline simulator does not yet provide player-path fixtures. Hosted replacement deployment and Discord launch verification remain outstanding.
