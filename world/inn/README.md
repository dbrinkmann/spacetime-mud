# The Lantern & Thorn

Production room 7 in The Lantern Above (zone 6). `room.json` preserves the authored inn and adds a hemp-rope ladder with oak rungs and an open loft hatch, positioned beside the left wall. The placement links to production object 20.

The object's `climb` action, labeled **Climb up**, runs `rope-ladder.js` and takes the player to The Cloudglass Study (room 9). The existing Up/Down passages remain available. IDs are production references; remap them when importing into another world.

Published through the paired player's MCP tools after geometry/navigation validation, script testing, and rendered inspection. The earlier inn furnishings and hearth interaction remain intact.

A blue, brass-trimmed portal in the back-right corner runs `return-portal.js`. Its **Enter the Nexus** action takes visitors to room 1. Return-to-Nexus travel is allowed from authored rooms; direct travel into unrelated zones remains blocked. The scene snapshot includes the production portal object binding.
