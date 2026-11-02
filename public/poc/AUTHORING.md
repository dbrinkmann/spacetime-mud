# Box-world authoring contract v1

This local prototype renders agent-authored rooms and characters from JSON. Examples are diagnostic fixtures, not a required model catalog. Supply your own geometry. Definitions cannot load code, URLs, textures, or executable expressions.

## Run and iterate

Run `npm ci`, then `npm run dev -- --port 5174`. Open http://localhost:5174/?poc. No database or Claude connection is required.

1. Copy `examples/room.json` and `examples/traveler.json` or `wizard.json`.
2. Ask your agent to edit them using this contract.
3. Open **Edit definitions**, select the appropriate tab, paste or import, then **Validate & apply**.
4. Test every pose, toggle cosmetics, walk around objects, and sit on furniture. Enable **Seat anchors & collision** to inspect navigation.
5. Download each JSON file, or save both applied definitions in this browser.

Invalid definitions leave the scene intact. Applying definitions resets placement and animation. JSON schemas describe structure; runtime validation additionally checks total budgets, model references, unique IDs, spawn, and reachable seat approaches. Unknown fields (including `$schema`) are rejected.

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

The six pivots are siblings under the animated body. Arms and legs extend downward; author feet near world Y=0. There are no elbows, knees, skin weights, imported skeletons, or custom animation code. Build around these pivots to share idle, walk, sit, wave, and talk. Animation buttons preview poses; floor clicks move the character.

Each cosmetic attaches rigidly to one part. Its transform is relative to that pivot; its boxes are relative to that transform. Hats, hair, backpacks, held objects, and rigid clothing use the same mechanism:

```json
{"name":"Crown","parent":"head","position":[0,0.5,0],"boxes":[{"position":[0,0,0],"size":[0.5,0.12,0.5],"color":"#cfab55"}]}
```

Character box centers and attachment offsets: -2..2m per axis; sizes .01..2m; rotations -360..360 degrees. Each part requires 1..80 boxes. Up to 24 cosmetics, up to 80 boxes each; 400 total boxes including cosmetics. Large skirts/capes can intersect limbs: check sit and walk poses.

## Rooms and props

Root fields: `version`, `name`, `description`, `width`, `depth`, `floorColor`, `spawn`, `models`, `objects`, `lights`. Width/depth are 4..20m. The renderer supplies the floor; spawn is a walkable [x,0,z].

`models` maps lowercase identifiers to `{ "boxes": [...] }`. `objects` places them using `id`, `name`, `model`, `position`, and `yaw`. Optional `collision: [width,depth]` defines a full-height navigation blocker centered on the placement, rotated by its yaw. Keep geometry centered around that footprint. Decorative rugs need no collision. Optional `wall: true` makes camera-facing walls fade. Walls still need a collider if they block movement.

Optional `seat` provides local `position` (top of seating surface), local `approach` (floor standing position), and `yaw` (facing relative to the prop). Placement yaw/position transform both points. Seating moves the rig root to seat-surface Y minus .76m and rotates legs forward. Surface world Y must be .3..1.1m. Approach world Y must be 0 and reachable from spawn with .23m navigation clearance. Stand returns to the approach. Check visual alignment; validation cannot detect every cosmetic intersection.

The second seat is occupied by the preview companion when available. This is a diagnostic convenience, not multiplayer occupancy. Movement uses a .25m grid and rectangular colliders, with no jumping, stairs, physics, or dynamic character collision.

`lights` contains `{ "position": [x,y,z], "color": "#RRGGBB", "intensity": 10 }`. Ambient and directional lighting are also supplied by the viewer.

Budgets: 64 models, 120 boxes per model, 120 placements, 1200 model boxes / 2400 placed boxes, 6 lights (intensity 0..30). Room box sizes .01..30m; box/placement/light coordinates -30..30m. Spawn coordinates -10..10m and inside the floor. Names 1..80 characters, IDs 1..40, description 1..1500. Input max 500 KB. Unknown fields and unsupported versions are rejected.

## Agent verification

Run `npm run test:poc` for contract, animation, and navigation tests. With the dev server running, run `npm run test:poc:browser` for actual WebGL rendering, movement, seating, geometry swaps, cosmetics, validation, persistence, and mobile layout. Screenshots go to `test-results/box-world-*.png`.

Read-only `window.boxWorld.inspect()` reports position, pose, selected/occupied seat, joint rotations, and cosmetic state. `window.boxWorld.project([x,y,z])` returns screen coordinates for interaction tests. Inspect screenshots too: valid JSON does not prove good composition.

## Scope

Local authoring and rendering only. The existing game is reachable without `?poc`. This preview does not connect to SpacetimeDB, the Claude bridge, shared movement, room exits, existing scripted objects, publication, or permissions. Those integrations follow evaluation of the geometry and animation contract.
