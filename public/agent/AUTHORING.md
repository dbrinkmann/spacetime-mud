# Lantern community authoring contract

## Scriptable objects

Anything can speak: props, NPCs, or an invisible narrator. Behavior is a server-owned object separate from geometry. Use the bounded ES5 JavaScript interpreter: ordinary functions and `var`, no imports, native code, network or inference.

Tools:
- `world_test_object(community_id,room_id,source,handler,state="{}")` executes without changing the world, returning speech, state, timer requests and execution statistics.
- `world_create_object(community_id,room_id,name,source,actions)` creates and runs on_start. Actions are `{id,label}` entries: greet invokes on_greet. Inspect afterward for the object ID.
- Link ordinary prop placements or NPCs with `"objectId":"123"`, then publish the room. Click the geometry to select actions, or use the Interact panel. Exit/home-entrance placements cannot also be scripted props.
- `world_publish_object` takes room_id, object_id, base_revision, name, source, actions. It preserves state, cancels old timers, and runs on_start again. Initialization should be idempotent.
- `world_inspect` includes editable scripts, state, lastError and object_history. Restore by publishing historical source/actions/name against the current revision; state is not rolled back.
- Remove visual references before `world_delete_object(room_id,object_id,base_revision)`.

Handlers receive ctx: on_start at creation/publication; on_enter when a player travels into the room; on_ACTION for declared actions; on_EVENT for timers. Start/timers have no triggering player. No chat-listening triggers yet.

API:
- `ctx.say(text)` speaks to present players in this room.
- `ctx.tell(text)` privately replies to the triggering player; no effect without an actor.
- `ctx.emote(text)` narrates an action attributed to the object.
- `ctx.actorId()` / `ctx.actorName()` return the triggering player or empty strings.
- `ctx.get(key)` returns a persistent scalar or null; `ctx.set(key,value)` stores string, number, boolean or null.
- `ctx.after(seconds,event)` schedules one-shot on_event, 0.25..86400 seconds (fractional seconds supported). Replaces the pending timer of that name. Reschedule inside the handler to repeat.
- `ctx.cancel(event)` cancels a named timer.

Example actions: `[{"id":"greet","label":"Say hello"}]`
```javascript
function on_start(ctx) {
  if (ctx.get("visits") === null) ctx.set("visits", 0);
}
function on_greet(ctx) {
  ctx.set("visits", ctx.get("visits") + 1);
  ctx.tell("Welcome, " + ctx.actorName() + "! The exit is upstairs.");
  ctx.emote("bows politely.");
}
function on_enter(ctx) { ctx.tell("Welcome to the station!"); }
```

Speech is room-local: up to 50 messages delivered while present, cleared on room change or new connection. Private replies are not exposed to other players or paired agents. Players press Enter or click Speak to compose speech or /me actions. Messages appear as temporary bubbles above the speaker; scripted props and NPCs use their linked scene position. Invisible objects use a room narration bubble. Private replies are labeled to you. Bubbles last 12-30 seconds depending on length and show at most three recent lines per speaker; there is no permanent chat panel. Speech never triggers more scripts. Object output is visibly attributed to an object.

Limits: 16 objects/room, eight actions/object, source 16000 characters, 20000 interpreter steps and 64 API calls/event, eight speech effects of 1000 characters, 64 state keys / 8 KB, four timer effects and four pending timers/object. State, speech and timers are buffered until execution succeeds. Failed interactions roll back; arrival/timer errors appear in lastError. No cross-room writes or player control. Common-space scripts require current admin authority and common-space agent authorization; home scripts require ownership. Preview never executes scripts.

Build through the community MCP. No repository clone, workshop, or local web server is needed. Call `world_inspect` for current source, edit permissions, exits and revision, then `world_validate`, `world_preview`, and `world_publish_room` with the current `base_revision`. Preview accepts unpublished `source` or an existing `room_id`; publication is immediate and records revision history. Use `world_restore_room` for an authorized restore. Preserve existing content and occupied home entrance IDs.

## Coordinates and boxes

Meters; +Y up; +Z character forward. The room is centered on [0,0,0]. Rotations are degrees; box/attachment Euler rotations use XYZ order. A box has a local **center** `position`, full positive `size` [width,height,depth], `color` (#RRGGBB), optional `rotation` [x,y,z], and optional `emissive` boolean. Emissive changes appearance; explicit lights illuminate surroundings.

```json
{"position":[0,0.2,0],"size":[0.5,0.4,0.4],"color":"#4d7055"}
```

These are independent cuboids, not grid voxels. Use large boxes for silhouettes and small boxes for accents. Collision is declared separately; visual geometry is not a physics mesh.

## Characters

Root fields: `version: 1`, `name`, `parts`, `cosmetics`. Each required part contains boxes relative to its fixed pivot:

| Part | Pivot [x,y,z] |
| --- | --- |
| head | [0,1.48,0] |
| torso | [0,1.02,0] |
| leftArm | [0.36,1.37,0] |
| rightArm | [-0.36,1.37,0] |
| leftLeg | [0.16,0.76,0] |
| rightLeg | [-0.16,0.76,0] |

The six pivots are siblings under the animated body. Arms and legs extend downward; author feet near world Y=0. There are no elbows, knees, skin weights, imported skeletons, or custom animation code. Build around these pivots to share idle, walk, sit, wave, and talk. Use world_preview to inspect silhouettes and rigid cosmetics.

Each cosmetic attaches rigidly to one part. Its transform is relative to that pivot; its boxes are relative to that transform. Hats, hair, backpacks, held objects, and rigid clothing use the same mechanism:

```json
{"name":"Crown","parent":"head","position":[0,0.5,0],"boxes":[{"position":[0,0,0],"size":[0.5,0.12,0.5],"color":"#cfab55"}]}
```

Character box centers and attachment offsets: -2..2m per axis; sizes .01..2m; rotations -360..360 degrees. Each part requires 1..80 boxes. Up to 24 cosmetics, up to 80 boxes each; 400 total boxes including cosmetics. Large skirts/capes can intersect limbs: check sit and walk poses.

## Rooms and props

Root fields: `version`, `name`, `description`, `width`, `depth`, `floorColor`, `spawn`, `models`, `objects`, `lights`, optional `signs` and `npcs`. Width/depth are 4..100m. The renderer supplies the floor; spawn is a walkable [x,0,z].

`models` maps lowercase identifiers to `{ "boxes": [...] }`. `objects` places them using `id`, `name`, `model`, `position`, and `yaw`. Optional `collision: [width,depth]` defines a full-height navigation blocker centered on the placement, rotated by its yaw. Keep geometry centered around that footprint. Decorative rugs need no collision. Optional `wall: true` enables the cutaway heuristic described below. Walls still need a collider if they block movement.

Optional `seat` provides local `position` (top of seating surface), local `approach` (floor standing position), and `yaw` (facing relative to the prop). Placement yaw/position transform both points. Seating moves the rig root to seat-surface Y minus .76m and rotates legs forward. Surface world Y must be .3..1.1m. Approach world Y must be 0 and reachable from spawn with .23m navigation clearance. Stand returns to the approach. Check visual alignment; validation cannot detect every cosmetic intersection.

Movement uses a .25m grid and rectangular colliders, with no jumping, stairs, physics, or dynamic character collision.

`lights` contains `{ "position": [x,y,z], "color": "#RRGGBB", "intensity": 10 }`. Ambient and directional lighting are also supplied by the viewer.

Budgets: 64 models, 120 boxes per model, 120 placements, 1200 model boxes / 2400 placed boxes, 6 lights (intensity 0..30). Room box sizes .01..30m; box-local coordinates -30..30m; placement/light coordinates -50..50m. Spawn coordinates -50..50m and inside the floor. Names 1..80 characters, IDs 1..40, description 1..1500. Input max 500 KB. Unknown fields and unsupported versions are rejected.


## Camera, rotation and wall cutaways

Positive placement yaw rotates local +Z toward world +X: yaw 90 maps [0,0,1] to [1,0,0]. Local +X maps to -Z. This matches Three.js rotation around +Y. Signs face +Z at yaw zero. Character forward is +Z.

During live play, the camera pans only when the player leaves a central dead zone (35% of viewport width, 30% of height), keeping the player at its boundary rather than continually recentering. It uses a fixed scale (about 9 meters vertically at default zoom, widened as needed on narrow screens), independent of room size. Players can zoom freely, left-drag to orbit, and right-drag or Shift+left-drag to pan. Manual panning holds the view while idle; starting movement outside the dead zone smoothly returns the camera to the player and resumes automatic tracking. Builder previews still frame the complete room. The preview orthographic camera sits at [11*s,11*s,15*s] and looks toward [0,0.65,0], where s=max(1,width/20,depth/20). The view fits the room dimensions and viewport aspect ratio. The player can orbit and zoom. `world_preview.yaw` rotates this camera around world Y; `time` selects the frozen animation time in seconds. Both default to zero. Try yaw 180 to inspect the opposite side. Preview PNGs are 1000x760 and include authored geometry, signs, NPCs and a neutral scale-reference character (or your supplied `character` JSON). They do not contain live visitors, interactive doorway nameplates, chat or sidebar UI. Previewing does not publish or execute scripts. Six renders per minute per authorized owner; keep the Activity open for authorization renewal.

A placement marked `wall:true` fades toward opacity 0.12 when `wall.position.x * camera.position.x + wall.position.z * camera.position.z > 0`; otherwise it becomes opaque. This is a room-center heuristic, not raycast occlusion or a test of face normals. Split separate walls into separate placements, positioned at their actual wall centers. Centering every wall placement at the origin defeats this heuristic. The entire placement fades, including every box in its model. It retains its collider and is not selectable. Avoid marking furniture, doors, or an entire building as one wall placement.

## Ordinary exits and home entrance spots

Ordinary named links initially appear in the Doorways sidebar. To make a staircase or door clickable in the scene, inspect the outgoing exit ID, then add `"exit":{"id":"123","approach":[0,0,1]}` to its placement. The ID must be an existing outgoing exit from this room. The game shows a label on hover. Clicking the geometry walks to its authored approach point before traveling through that connection. Sidebar doorways use the same approach; unplaced links use the room spawn. Clicking the floor or another target cancels the pending interaction. Each exit has at most one bound placement per room. Approach coordinates are local to the placement and must reach the floor and be navigable. This is a room transition; stairs are not walkable heightfields. An exit cannot share a placement with a seat, home entrance, scripted object or cutaway wall.

For new homes, admins instead add `"homeEntrance":{"approach":[0,0,1]}` to visible common-room geometry. Its placement ID is the stable spot ID. `world_inspect.entrance_spots` reports vacancies. `world_claim_home` requires `common_room_id`, `spot_id`, and `name`. No vacancy means no home can be created there. Claiming atomically binds the home and supplies its visible nameplate. Preserve occupied spot IDs when publishing or restoring; relocation within the same room is allowed with a reachable approach. Do not add a second exit binding to a claimed entrance. Inside a home, the return exit can be attached to an authored door using `exit`.

## Text signs

Optional `signs` is an array of up to 32 world-space text planes. Each has `id`, `text`, `position` (center), `yaw`, `width`, `height`, `color`, optional `background` and `emissive`. Sizes are meters (width .1..20, height .1..10). Text has at most 120 characters and four newline-separated lines, centered and fitted inside the plane. Transparent background is the default. Emissive makes a sign unlit; it does not cast light or create bloom. Use explicit lights for illumination. Signs have no collision and do not fade with separate wall placements. Place them just in front of geometry to avoid z-fighting. Both faces render; text appears mirrored from the back.

The bundled Noto Sans JP font supplies Latin, Japanese kana and kanji. No external font/texture URLs, HTML, or executable content are accepted. Text is static; animated code rain and programmable sign effects are not supported.

```json
{"id":"reception-sign","text":"WELCOME","position":[0,2.4,-3],"yaw":0,"width":3,"height":0.6,"color":"#66ffcc","background":"#101820","emissive":true}
```

## Decorative animated characters

Optional `npcs` contains up to 12 static character placements. Each has `id`, a full six-part `character` definition, `position`, `yaw`, and `animation` (`idle`, `talk`, or `wave`). Use your own authored character geometry. Their boxes count toward the room's 2400 rendered-box budget; each character still has its 400-box limit. Position is the rig's foot origin. They animate in place, with rigid cosmetics using the same player rig. They can speak through objectId-linked scripts. They do not move between rooms, claim seats, run AI, or imply a real player's presence. They have no automatic collision; model a counter or another explicit collider if needed.

## Community behavior and limits

Use `world_create_room` and `world_link_rooms` for property-internal links; `world_set_welcome` requires common-space admin authority. `world_publish_avatar` changes the paired owner's appearance. The character's display name comes from their community identity, not the model name. `world_set_home_routine` controls that owner's away-home walking points; decorative NPCs are independent.

Common-space publication requires a current Discord admin and a common-space agent grant. Home publication requires ownership. All references and revisions are rechecked server-side. Optional `objectId` on props or NPCs references a community scripted object in this room. Legacy zone tools do not apply. Publication preserves occupants' valid positions while cancelling stale paths/seats, moving invalid positions to spawn. Agent connections do not keep their owner online. There is no physics, jumping, deformable mesh, terrain heightfield or arbitrary script execution in scene data.

Live scripted props and NPCs are approached before their actions open or execute. Keep a reachable standing area beside them; the client finds a nearby navigable point outside their collision bounds. Invisible scripted objects have no physical approach. Clicking a seat walks to its authored approach and sits on arrival.

### Materials, moving props, and live signs

Box `material` is optional: `plain` (default), `asphalt`, `concrete`, `metal`, `wood`, `fabric`, or `glass`. These are renderer presets, not texture uploads. `color` remains the authored tint. `roughness` optionally overrides the preset (0..1); `wear` is opt-in (0..1, default 0). Emissive boxes retain their untextured glow. Glass is tinted transparent glass, not refraction. Surface detail follows rigid character parts/cosmetics. Existing boxes without a material are plain; there is no blanket grunge texture. The cool lighting and contact shading apply to every room. The runtime floor has 0.8m seams; cover it with authored asphalt boxes for roads.

Example road box: `{"position":[0,0.02,0],"size":[8,0.04,20],"color":"#292d31","material":"asphalt"}`. Keep road markings `plain`. Use `metal` for car body panels, `glass` for windows, `fabric` for seats. Preview the lit result rather than relying on hex swatches.

Decorative placements may include `motion`: `{"points":[[-4,0,0],[4,0,0]],"speed":2,"mode":"pingpong","offset":0}`. Points are offsets in the placement's local coordinates, transformed by its position and yaw. Models face +Z; runtime yaw follows the current path segment. Speed is meters/second (0.1..20). `loop` connects the last point back to the first, so author the entire return lane; `pingpong` reverses at the endpoints. Corners turn immediately; use extra waypoints for rounded routes. There are 2..24 points; transformed world X/Z coordinates may extend beyond the floor up to ±50m, with height 0..30m. Props fade over 2m outside the floor rectangle. `once` stops at the final point. Offset is seconds (0..3600) for staggering motion. These props cannot have collision, seats, home entrances, exits, or cutaway walls; they can have an `objectId` for server-controlled behavior. They do not carry players or run AI. Shared server time drives motion without reducers/timers per frame. `world_preview.time` samples the same path at a chosen time; it does not represent the current live phase. Inspect at multiple times before publishing.

Signs may bind their text to a home entrance: `"binding":{"kind":"homeName","entranceSpot":"apartment-door-3"}`. Keep `text` as the vacancy/draft fallback, such as `Available`. The spot must be an authored `homeEntrance` in the same room. The game resolves the destination property's current name and redraws the sign on claim/removal/name changes without republishing. Agents control sign geometry, size, colors and placement; the game controls bound text. `world_preview` resolves names using the inspected room's current community context; standalone previews use the supplied text fallback. Long text automatically shrinks to fit.

Signs can attach to a placement with `"attachTo":"station-wall"`. With attachTo, sign position and yaw are local to that placement; without it, they remain room coordinates. Attached signs follow the placement's motion and fade with cutaway walls. Convert existing world coordinates to parent-local coordinates when attaching; do not simply add attachTo to an existing world-space sign. Signs are now single-sided by default to prevent mirrored text from behind; set `doubleSided:true` only when mirrored backfaces are intentional. Binding a sign's text to a home and attaching it to geometry are independent features and can be combined.

Scripts may declare top-level `var` values (including arrays/objects) for per-event constants. Initializers run inside the interpreter budgets on every event. Use ctx.get/ctx.set for persistent state; globals do not persist between events.

### Close-up previews and guarded material edits

`world_preview` accepts optional `focus:[x,y,z]` in room/world coordinates (-100..100) and `zoom` (0.25..20, default 1). Focus is the camera target, not a crop or room edit. Zoom multiplies the normal whole-room framing; use e.g. `focus:[12,0.5,2], zoom:4` to inspect street detail. Yaw orbits around this focus. Keep the complete original source and room context. Omit both options for the normal overview.

Rooms accept `floorMaterial` (same seven box presets), `floorRoughness` and `floorWear` (0..1). Existing rooms default to plain. Runtime floor seams are shown for plain/concrete only; asphalt, wood, metal, fabric and glass floors have no automatic tile grid. Authored overlays still cover the runtime floor and need their own materials.

Glass is transparent, not an opaque mask: glass in front of emissive geometry exposes its glow and can read as a bright block. Use plain opaque boxes for dark frames/panels that must obscure neon; reserve glass for intentional see-through panes.

`world_validate` requires `kind:"room"` or `kind:"character"`, plus `source` JSON text. It does not accept community_id or room_id.

For retrofits, call `world_publish_room` with `appearance_only:true`. The server compares against the current `base_revision` and rejects all changes except box `color/material/roughness/wear/emissive` (including NPC character boxes), and room `floorColor/floorMaterial/floorRoughness/floorWear`. Preserve all other data, including array order, model IDs, signs, lights, geometry, scripts, names, descriptions, exits and motion. A successful guarded publish records history but does not stop walking or clear seats. This flag is optional; ordinary publishing remains available for intentional structural edits.

## Intelligent placements

Bind one scripted object to one placement with `objectId`. Optional `tags:["car"]` identify scripted placements to sensors (up to eight tags, each an identifier of at most 40 characters). These capabilities apply to `objects` placements, not six-part `npcs` entries. A stationary prop can be a sensor or control its own visibility. Moving props remain noncolliding: sensing does not provide physics or carry players.

- `ctx.motion.pause()` freezes the current position; `resume()` continues from it.
- `ctx.motion.restart()` returns to the first waypoint, clears completion and starts moving. It preserves speed and visibility.
- `ctx.motion.setSpeed(metersPerSecond)` changes speed without jumping (0.1..20).
- `ctx.motion.progress()` returns 0..1 along the path; looping/pingpong progress resets each complete cycle.
- `ctx.setVisible(boolean)` changes this placement's visibility. Hidden placements are excluded from other sensors; their own subscriptions remain active. Hiding does not pause motion.
- `on_motion_end(ctx)` runs once per completion of a `once` path. Call restart to enable another completion.
- `ctx.randomInt(min,max)` returns a server-deterministic inclusive integer. Use this instead of `Math.random`; bounds must be integers within ±1,000,000.

Declare views in `on_start` using `ctx.subscribe(name, definition)`. Reusing a name replaces its definition. `on_start` also runs when a placement is first bound or its motion definition changes; make initialization idempotent. Script publication replaces subscriptions and cancels existing ordinary script timers. Appearance-only changes preserve motion. A changed motion definition starts a fresh path.

```javascript
function on_start(ctx) {
  ctx.subscribe("nearby", {
    frame: "self",
    box: { center: [0, 0, 2], size: [3, 3] },
    include: ["player"]
  });
}
function on_view_enter(ctx, view, entity) {
  if (view === "nearby") ctx.tell("Welcome, " + ctx.actorName() + "!");
}
function on_view_exit(ctx, view, entity) {}
```

Views are horizontal rectangles: center is `[x,y,z]` (Y is ignored unless `box.height` is supplied), size is `[width,depth]`. Optional `box.height` (0.1..100m) adds vertical bounds centered on Y. `frame:"self"` follows the placement's position and current heading (+Z is forward); `frame:"room"` uses fixed room coordinates. Filters are ORed: `player` includes present player characters, including offline home avatars; `tag:car` includes visible scripted placements tagged car. An object never senses itself. Membership tests entity origins, not model bounds or line of sight. Configure clearances to account for geometry.

`ctx.unsubscribe(name)` removes a subscription. Optional `hysteresis` (0..5m, default 0.05m) expands a view for existing members until they leave that outer boundary; new members still enter at the original boundary. `ctx.view(name)` uses the same membership rule. This prevents immediate boundary reversals when a handler changes motion; larger behavioral stop/resume distances remain an authoring choice.

`ctx.view(name)` returns current members as `{id,kind,tags}` records; kind is `player` or `object`. Entry and exit handlers receive `(ctx,viewName,entity)`. Player events supply actorId/actorName and private tell; object events have no player actor. Already-present entities generate entries when a subscription becomes active. Position/path changes, pauses, restarts, visibility and room transitions invalidate pending predictions. The scheduler solves linear crossings and waypoints, rounded forward to milliseconds; actual event delivery can be delayed by server load. There is no per-frame reducer polling. Clients, including late joiners, derive positions from persisted motion state and server time. `world_inspect.object_motion` exposes current state to authorized builders.

Limits: four views per object; view centers within ±100 and dimensions 0.1..50; up to eight filters; 128 sensed entities per room; 64 delivered view/completion events per reconciliation and 128 scheduled room events/second. Existing interpreter budgets also apply. A runaway cascade disables the room's views, clears pending intelligence events and reports `lastError`; fix and republish scripts to restore subscriptions. Motion/visibility/subscription changes from a failing handler are discarded. Dry-run `world_test_object` checks API use but does not simulate live membership or motion; `world_preview` shows authored paths at `time`, never live script state.

For respawning props, test occupancy at the **spawn position**, not the previous endpoint: while hidden, restart then pause, query the forward view, and only show/resume when clear. Retrying via `ctx.after` must recheck occupancy. Choose sufficient view depth for geometry and scheduling latency. The builder authors routes, yielding rules, timers and visuals; Lantern supplies the general primitives.


## Spatial reservations and lifecycle guarantees

`ctx.reserve(name, {center:[x,y,z], size:[width,height,depth]}, seconds)` attempts an atomic, exclusive claim on a fixed, room-coordinate axis-aligned volume. It returns true on success, false if another object's unexpired reservation overlaps or a visible sensed entity origin is inside. The caller is excluded. Hidden objects remain covered by their reservations. Reservations do not move with their owner, block player movement, or test mesh bounds/walls; choose your region accordingly. All cooperating scripts must acquire a reservation before using a shared area.

Use `ctx.release(name)` when finished. Reusing a name renews/replaces that object's claim only if the new region is clear; a failed attempt retains the previous claim until release/expiry. Four reservations per object; center coordinates ?100m, size 0.1..50m per axis, lifetime 0.25..60 seconds. They expire automatically, and are released on unbinding, deletion or successful on_start initialization (including script replacement). All reservation changes are buffered with the event; failing scripts acquire nothing and release nothing. Unbound objects return false. Dry-run tests validate reservation arguments but return false, as they do not claim live space.

```javascript
function on_use(ctx) {
  if (!ctx.reserve("workArea", {center:[5,1,5],size:[2,2,2]}, 10)) {
    ctx.tell("This area is busy. Try again shortly.");
    return;
  }
  ctx.set("working", true);
  ctx.after(2.5, "finish");
}
function on_finish(ctx) {
  ctx.set("working", false);
  ctx.release("workArea");
}
```

When a room binds multiple objects, all new motion rows are initialized from authored speed/offset and the binding timestamp before any initializer runs. Initializers commit before spatial entry/completion events are delivered. Existing motion is preserved when its placement ID and motion definition are unchanged. Subscriptions declared by a successful on_start begin with fresh membership, so entities already inside receive entry events after initialization. Scripts should still initialize persistent business state idempotently.

Short timers retain the four-pending/four-effects limits. Each object is limited to eight timer callbacks per server second; exceeding that budget cancels its pending timers and sets lastError. A timer's delay is a minimum, not a frame-rate guarantee. Use motion paths for continuous animation rather than recurring timer movement. Invalid dry-run handlers return a validation error; names must be `on_NAME`.
