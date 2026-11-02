# Shared 3D release verification

Verified 2026-11-02. Application release: `a7172cc` on main (the original POC is preserved at `2e4b569`).

Live game: https://dbrinkmann.github.io/spacetime-mud/

Production database: `dbrinkmann-spacetime-mud`. Migration added four private tables and their scoped views; no existing world data was deleted. The Lantern & Thorn is an authored demo in zone 4 / room 7, accessible through its Nexus portal. Its hearth links to a published scripted object. Its owner credential is retained locally in ignored `.bridge` storage and is not part of the repository.

## Completed checks

- Eleven unit tests, server typecheck and production build passed.
- Existing multiplayer, script isolation, gate, inventory, timer, draft/publication, permission, consent and reconnect tests passed.
- React UI integration passed; WebGL is tested separately in actual Chromium.
- New visual database integration passed locally and on Maincloud staging: private drafts, publication authorization, persistent avatars, paths, competing seats, room-transition cleanup, conflicting publication, scene reset and bridge proposals.
- Two-browser authoring/social test passed: scene and character publication, visible movement, seating, linked prop actions, chat, reload and mobile. One client's clock was deliberately five minutes ahead.
- The local Claude Code bridge authored a new avatar, and the server accepted and published it. Existing agent-created room, scripted action and timer checks also passed.
- Local POC browser checks passed after moving its renderer and contracts into shared modules.
- Release workflow [41533869592](https://github.com/dbrinkmann/spacetime-mud/actions/runs/41533869592) passed all checks and deployed GitHub Pages.
- HTTPS responses and SHA-256 hashes of every deployed JavaScript/CSS bundle matched the local production build. Anonymous production subscriptions exposed no private or player-only visual data.
- Two fresh players on the public Pages URL entered The Lantern & Thorn and verified shared movement, sitting, chat, the linked hearth action, mobile layout and reload. Screenshots are in local `test-results/shared-world-live-desktop.png` and `test-results/shared-world-live-mobile.png`.

The local machine intermittently reset Chromium TLS connections to Pages. The final public browser check succeeded with IPv4 host resolution and Chromium TLS compatibility flags; asset checks used platform curl. No game code or server behavior was bypassed.

## Scope of evidence

These are functional checks with a few simultaneous players, not a large-crowd load test. Geometry is rigid cuboids, movement uses a flat navigation grid, and visual drafts do not yet have a version-history UI. See [architecture and limits](shared-world.md).
