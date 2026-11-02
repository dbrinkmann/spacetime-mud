# Shared box-built world

The 3D renderer is now part of the main game. The local `?poc` workshop remains available for isolated authoring experiments. Rooms and avatars use the same geometry validator on the server, live client, and preview client.

## Data and authority

- Private `room_scene` and `avatar` tables hold published JSON and revisions. Views reveal room scenes to occupants and authorized builders, and avatars to the player and people sharing their room.
- Private `visual_draft` rows belong to the requesting player. A room requires zone ownership or collaborator permission; an avatar always belongs to its player. The consented bridge can produce a draft for its paired owner, never publish it.
- Publication revalidates geometry, reachable seat approaches, object references, permissions, and base revision. Conflicting publications are rejected. Room publication clears current movement and reservations, returning occupants to the new spawn.
- Private `presence` rows contain a server-generated path, server start timestamp, pose and reserved seat. Clients send destinations, never positions or velocities. The server samples an existing path before accepting a replacement and checks every route against oriented rectangular blockers. Movement speed is fixed at 1.8m/s.
- Seat reservation happens transactionally when a path to the seat is accepted. Leaving a room, script-driven travel, final disconnect, standing or choosing another destination releases it. Multiple connections for one identity share the same character.
- Clients periodically synchronize a monotonic clock against a lightweight server procedure, including on reconnect. Frames sample the authoritative path; no frame-by-frame database writes or repeating movement timers are required.

## Rendering and behavior

`client/world/Viewport.tsx` supplies the shared renderer. Geometry is cuboids with local transforms and solid colors. Six fixed pivots drive rigid limb animation; cosmetics attach to one pivot. No arbitrary client code or external model URLs execute from geometry JSON.

A placement's optional `objectId` links it to a scripted object in the same room. Picking that prop exposes its published actions. Actions still go through the existing authorization, request deduplication, bounded interpreter, state and timer machinery. A geometry definition does not replace script versioning or grant new script capabilities.

Blank rooms and neutral character silhouettes are fallbacks. The Lantern & Thorn is an authored demonstration published through the same player draft/publication APIs; it is not a required asset catalog. `scripts/publish-visual-demo.ts` provisions it on an explicitly named database and stores its owner token only in ignored `.bridge` storage.

## Verification

`npm run test:visual` exercises real database clients, permissions, private drafts, shared geometry, persistent avatars, paths, competing seats, room transition cleanup, conflicting publication and bridge proposals. `npm run test:visual:browser` exercises two real Chromium sessions, JSON preview/publication, avatar geometry, visible movement, seating, prop script actions, chat, reload, mobile layout and a deliberately skewed client clock. The original script/inventory/timer tests and local POC browser tests remain in the regression suite.

The live Claude bridge test now also requests an original avatar, validates its draft through the server and publishes it. It consumes the consenting machine's Claude usage and is run explicitly rather than in CI.

## Current limits

There is no avatar-to-avatar collision, terrain heightfield, physics simulation, skeletal deformation or custom animation import. Visual drafts keep one current revision per author/room or avatar, rather than an asset history; store exported JSON in source control. Navigation uses a quarter-meter grid and .23m clearance. Large crowds and maximum-budget scenes have not undergone load testing. This release establishes shared authoring and social play, not a general-purpose physics engine.

See [the authoring contract](../public/poc/AUTHORING.md) for schemas, pivots, budgets and the publication workflow.
