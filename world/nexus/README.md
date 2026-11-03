# The Nexus

Authored arrival hall: marble pillars, midnight-blue path and compass, two usable benches, moonflower planters, welcome flames and a lantern-crowned portal. Geometry uses the standard box-world contract, with no special renderer or imported models.

Regenerate `room.json` with `npx tsx world/nexus/build.ts`. The generator validates geometry and navigation. The portal object ID is bound at publication, not hard-coded into this reusable definition.

To publish as the authenticated world operator, explicitly set `SPACETIME_DATABASE`, `SPACETIME_HOST`, and optionally `SPACETIME_CLI`, then run `npx tsx scripts/publish-nexus.ts`. `NEXUS_DESTINATION_ROOM` defaults to production's inn (room 7). The script stages/tests/publishes the portal behavior, validates the linked scene, and publishes it. It reuses the existing named portal object on subsequent runs.

In production the portal's **Enter The Lantern Above** action takes the visitor into **The Lantern & Thorn**. From there, Up leads to **The Cloudglass Study**. Ordinary user scripts remain restricted to their own zones; only objects in the operator-controlled Nexus may use `ctx.movePlayer` to reach a different zone's entrance. `tests/nexus-portal.ts` checks this boundary.
