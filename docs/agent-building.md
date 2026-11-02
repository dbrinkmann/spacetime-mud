# Agent-first creation

The player-facing Create page teaches setup and pairing. Creative conversation belongs in the player's chosen agent. The game does not spawn a model or relay prompts. The old editor is a developer surface at `?workshop=1`, not a normal tab.

## Standard MCP connection

Run `npm ci` and `npm run --silent agent:config` from the checkout. Add the resulting server configuration to a local MCP-compatible client. The generated Node command, TypeScript loader and server paths are absolute, so the client can run from another working directory. Clients with a different configuration format use the same command and argument array.

This release serves **stdio MCP**, not remote Streamable HTTP. The process is a tool server that talks to SpacetimeDB; it does not invoke Claude or require a particular inference provider. Your agent handles its own model credentials and usage. The game never asks for them.

`world_connect` returns a pairing URL. The player opens it in their existing game browser and approves the connection under Create. Credentials for the separate agent identity stay in `~/.spacetime-agent/`, keyed by host/database, or `MCP_STATE_DIR`. Keep this directory private. Revocation removes the grant and private views and immediately blocks future mutations.

Environment overrides: `SPACETIME_HOST`, `SPACETIME_DATABASE`, `GAME_URL`, and `MCP_STATE_DIR`. Defaults target the public game. `GAME_URL` sets the pairing link. Image previews are rendered locally from the shared renderer and do not contact the hosted site. Install Chromium once with `npx playwright install chromium` to enable that optional tool.

## Tools

| Tool | Result |
| --- | --- |
| `world_connect` | Pairing link and connection status |
| `world_guide` | Building skill, geometry contract and scripting reference |
| `world_inspect` | Visible rooms, editable zones, geometry, private drafts and script reports |
| `world_validate` | Local geometry/navigation validation without mutation |
| `world_create_zone` | New empty owned zone; moves its player there |
| `world_create_room` | Room and bidirectional passage in an editable zone |
| `world_save_visual` | Validated private room or avatar draft |
| `world_save_object` | Private scripted-object draft |
| `world_test_object` | Isolated server-side handler test and report |
| `world_render_preview` | PNG of private geometry in the isolated renderer |

The renderer's screenshot shows the authored geometry and character; it is not a live multiplayer snapshot. Script tests are separate from geometry previews. A missing browser or renderer failure produces a tool error, never a false claim of visual verification.

## Authoritative API

MCP mutations call the generated SDK reducer `agentBuild({operation, roomId, payload})`. `payload` is JSON. Supported operations are `create_zone`, `create_room`, `save_visual`, `save_object`, and `test_object`; their typed MCP input schemas document the payloads. Other integrations can call the same reducer through the SpacetimeDB client SDK using a separately paired agent identity.

The server derives the player from the authenticated sender's grant. It never trusts an owner ID in the payload. Existing ownership/collaborator checks, geometry budgets, script validation, and isolated preview machinery still apply. Pairing permits creating places immediately and preparing drafts; it does not permit publishing visuals or behavior as the player. The agent cannot choose a publication operation or call the player's publication reducer with its own identity.

## Player review

Visual drafts appear in the current room as **Review creation** or **Review character**. The preview replaces only that player's local geometry; movement/poses during review are local, and linked script actions are disabled in that preview. **Keep it** publishes the exact reviewed revision. Changed drafts require another review. **Discard** removes the selected draft. **Ask for changes** explains that revisions happen in the existing agent conversation; it does not silently send an inference request.

Script drafts appear as an interaction review with their intended actions and test report. **Keep behavior** is enabled only after a successful isolated test. Existing scripts continue running independently of any agent connection.

## Validation

`npm run test:agent` drives a generic MCP SDK client and actual Chromium. It checks pairing, denied unpaired writes, guidance, validation failures, draft privacy, screenshot output, denied agent publication, the Create UI, in-world keep/discard, script testing/review, mobile layout, and revoked writes. It needs a disposable database and matching frontend (`SPACETIME_HOST`, `SPACETIME_DATABASE`, `GAME_URL`). It does not consume model quota.

The downloadable [skill](../public/agent/SKILL.md) can also be given directly to an agent. The legacy Claude bridge remains for old integrations but is unnecessary for this workflow.

### Release verification — 2026-11-02

Deployed `a0e6452` to GitHub Pages with the updated Maincloud module. [Release checks](https://github.com/dbrinkmann/spacetime-mud/actions/runs/41543344738) passed, including multiplayer, timers, UI, MCP, desktop/mobile browsers, generated bindings, and production build.

The generic MCP client suite also passed against the public Pages site and production database: pairing, denied unpaired access, geometry validation, private drafts, local image rendering, denied agent publication, stale-review invalidation, player publication, avatar discard, script tests and publication, behavior discard, mobile layout, and revocation. This exercised the MCP protocol without invoking a model; individual agent products were not separately certified.

The production smoke check verified HTTPS availability, SHA-256 equality of every built JS/CSS asset, and private-view isolation for a fresh connection. Windows browser verification used local Chromium network compatibility flags for this machine's TLS routing; the hosted app was not intercepted or replaced.
