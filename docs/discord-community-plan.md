# Discord community worlds

Updated November 3, 2026. Status: agreed product direction and implementation plan; not a description of shipped Discord functionality.

Implementation has started on `feature/discord-community-worlds`. See [development status and setup](discord-development.md) for implemented slices, verification and remaining work. A separate hosted staging deployment is available; the original production game is unchanged.

## Product

A persistent visual world for each Discord server, built by its members, where your character lives even when you are away. Members hang out in shared spaces, visit each other's homes, and use their preferred coding agents to build rooms, characters, cosmetics and interactive objects.

The product is a Discord Activity backed by our hosted web client and SpacetimeDB. Discord supplies the community context and authentication; our application owns the persistent world. The existing browser game remains useful for development, but browser access must not bypass community membership checks.

The first useful experience is: join your community, claim a home, have your agent build it, invite someone over, leave your character living there, and return to take control in place.

## Settled design decisions

- Each Discord server has one persistent world. Different Activity instances do not create separate copies of that world.
- Server admins build and manage common spaces. Every member can build their own home and expand it with additional rooms and content.
- Connections define the world. Rooms do not compete for globally occupied grid coordinates.
- Members can attach a named home entrance to any common room. Admins do not need to predesignate residential rooms.
- Home entrances are not cardinal exits. Several named homes can attach to the same common room without consuming north/south/east/west/up/down connections.
- A home has its own interior map. Entering its doorway changes the map view to that home's connected rooms; leaving returns to the common room where its entrance is attached.
- These map views belong to the same shared world, not private instances. Visitors occupy the same rooms as their hosts and other visitors.
- Home entrances remain open to community members. Interior locks are a possible later feature.
- Members with homes automatically become away characters when they disconnect from the world. This is not optional.
- Returning members resume control wherever their away character currently is.
- There is no global Nexus and no cross-community portal hub. Communities are selected through Discord.
- Agents publish directly to the live world within their owner's permissions. There is no mandatory player review step.
- Authoring is agent-neutral. The game does not require Claude, run a player's inference, or supply a built-in conversation with an agent.

## Arrival, navigation and maps

Each community configures a welcome room in its common space. New members arrive there. Returning members resume their existing character; the welcome room is also the safe fallback when a saved location no longer exists or cannot be used.

The common map displays common rooms, their connections, and named home entrances. Inside a home, the map displays that property's rooms, connections, and return entrance. Layout coordinates are presentation data, not exclusive land claims. Directional labels can still make individual connections understandable without forcing a global grid.

Members choose the common room to which their home attaches. Claiming a home atomically creates the property, initial room, home anchor, and entrance/return connection. Concurrent claims must not overwrite one another.

Every entrance needs a visible, clickable representation in the 3D common room. Use a system-managed entrance layer separate from the admin's authored geometry. Members can identify and customize their own entrance within the allowed schema without editing the surrounding common room or other members' doors. The placement system must keep entrances reachable and handle growth without exhausting six directional slots; crowded rooms can use a grouped entrance interaction that lists named homes.

Removing or moving an entrance must update both sides of the connection. Common-room deletion must first relocate attached entrances and resolve occupants; it cannot silently orphan members' homes. A server-authoritative return-to-welcome action provides an escape from broken content and replaces Return to Nexus.

## World model and permissions

Separate concepts currently combined by `zone`:

| Concept | Responsibility |
| --- | --- |
| Community | Discord guild identity, membership, admin authority, welcome room |
| Property | Ownership/edit permissions for a collection of rooms; common space or member home |
| Room | Shared scene, navigation, objects and occupants within a property |
| Exit | Explicit connection, label, travel rules and entrance representation |
| Home | Member's designated property and valid away-character anchor |
| Character | Member identity, appearance, location and control state within one community |
| Session | Authenticated player connection, distinct from an agent connection |

Use one character per member per community. Reuse appearance definitions where useful, but do not merge locations, permissions or inventories across communities.

Admins manage common space and community moderation. Members edit their property and character. Adding a home entrance grants only the narrowly defined operation on a common room, not general common-room edit access. Administrative repair/removal actions must be explicit and recorded.

Membership, roles, ownership and agent grants are verified on the server. Views and reducers must enforce community isolation; identifiers supplied by a browser or agent do not establish authority. Script authority follows property boundaries, not map connectivity. A doorway to another property does not grant access to its object state or inventory.

Replace hardcoded Nexus/room-1 authorization, travel, spawn and cleanup exceptions with explicit community and connection rules. Agent grants must be bound to the member and community and cannot silently carry admin authority into another server.

## Discord integration

Register a Discord application and configure the Activity, OAuth flow and networking. A backend exchanges/verifies credentials and establishes a trusted association between Discord identity, community membership and the SpacetimeDB session. Never expose a Discord client secret in the web client.

Persist by community/guild ID, not Activity instance ID. Instance information is session context only. Two Activity launches for the same guild must see the same world, while duplicate sessions for one member must not create duplicate characters.

Validate the actual SpacetimeDB WebSocket connection through Discord's networking/proxy configuration early. Test Activity launch, authentication, reconnect and membership failure inside Discord, not only in a standalone browser.

Voice stays in Discord for the initial release. Changing visual rooms does not move members between voice channels. Presence UI must not imply that everyone visible in the world shares the same call. A bot is added only if required by the chosen membership/role synchronization design or a later feature.

Membership removal and role revocation must withdraw access and editing authority. The long-term retention of a departed member's buildings is deferred; access revocation is not. The implementation must define bounded credential/membership freshness and fail safely when it cannot establish authorization.

## Persistent away characters

Away means disconnected from our world, not Discord's online, invisible or idle status. Track player sessions independently of MCP/agent connections.

On the last player-session disconnect, allow a short reconnect grace period. If the member has a home, transfer the same character to its valid home anchor and start its routine. Members without a home do not create an away NPC. Multiple tabs must not cause duplicate characters or premature away transitions.

Routines are bounded declarative activities: walk to an authored spot, sit, wait, read, or tend something. They stay inside the owner's property and use the shared movement, seat and animation contracts. They require no model inference while the owner is away. Any greeting is explicitly owner-authored; the character does not invent conversations or act as if the owner is present.

Render a clear Away/At home state. Away characters must not automatically trigger ordinary player rewards, chat spam or arbitrary scripted farming loops. Use explicit routine events/capabilities rather than treating every NPC step as a human interaction.

Store authoritative routine state and timing. Clients interpolate animation and movement; do not write every frame or run frequent timers for every empty home. Observation, restart and reconnect must resolve the same valid current state. Seat occupancy and path validity remain server-authoritative.

On reconnect, atomically resolve the NPC's current position, stop its routine and transfer control to the returning member. One session controls the character at a time. If a routine target or room was edited/deleted, choose a valid home position, then the community welcome room as a final fallback.

## Agent-built visuals and behavior

Keep the existing cuboid geometry model: transformed boxes, solid colors and a small fixed set of character pivots. Cosmetics attach rigidly to one pivot. The platform provides the animation and validation contract, not a required catalog of character or room models.

Continue using the bounded existing script interpreter for object behavior in authoritative reducers. Extend its permission checks for communities and properties. Validate timer ownership and revocation as well as direct interactions. Geometry cannot embed arbitrary client execution.

Package the MCP server and authoring documentation so creators do not need to clone the game repository. Setup should be: install/configure MCP, connect to a community, approve the agent grant, and describe what to build in the agent's own interface. The in-game Create area supplies these instructions, grant status and revocation.

Agents need tools for inspecting the community/property graph, claiming a home, adding interior rooms, publishing scenes and objects, defining routine spots, rendering previews, and repairing/deleting their own content. Keep server validation, script tests and revision checks while allowing immediate live publication.

Add publication history, restore, audit records and a way to disable broken scripted objects. A scene edit should preserve valid occupant positions and relocate only occupants whose positions became invalid. Do not reset everyone to spawn for every cosmetic revision.

## Delivery sequence and acceptance criteria

### 1. Prove the Discord connection

Build the smallest real Activity with verified identity, community context and a live SpacetimeDB connection. Establish the backend hosting and membership verification approach here.

Accept when two members can launch inside a test Discord server, see each other, reconnect, and share state across separate Activity instances. Invalid identity/community claims and unauthorized members are rejected. Exercise supported desktop and mobile paths before committing to the deployment setup.

### 2. Establish communities and properties

Introduce the data model and permission boundaries, community provisioning, a configured welcome room, and community-scoped character identity. Replace Nexus assumptions in reducers, views, scripts, UI, MCP and tests.

Accept when two test communities cannot read or modify each other's private world state; members cannot edit common geometry or another member's property; admins can manage their common space; revoked grants and roles stop authorizing mutations.

### 3. Deliver connected homes

Implement atomic home claims, named common-room entrances, visible entrance placement, return travel and separate common/home map views. Allow agents to expand home interiors without coordinate competition.

Accept when several members attach homes to the same common room, visit one another, and expand independently. Concurrent claims preserve all entrances. Common-room edits and deletion cannot strand homes. All entrances remain reachable and the home entry cannot be locked.

### 4. Deliver the persistent character lifecycle

Implement player-session tracking, disconnect grace, home anchors, bounded routines, away labels and atomic takeover. Support recovery after server restart and geometry changes.

Accept when a visitor observes an owner's character at home after logout, the owner reconnects at its current position, a second tab does not duplicate it, and agent-only activity does not keep the owner online. Test deletion, invalid paths, occupied seats, disconnect races and a server restart.

### 5. Make live building resilient

Add revision history/restore, audit and object-disable actions; preserve valid occupants during scene edits; update authoring guides/tools for homes and routines. Package creator setup without a source checkout.

Accept when a fresh creator can connect a compatible agent, build and revise a home live, render a preview, recover a bad revision and revoke access. Verify behavior boundaries across connected properties and bounded failures for scripts/timers.

### 6. Run a real community pilot

Choose a pilot server and deploy the complete loop. Test multiple concurrent builders, busy common rooms, many visible entrances, mobile interaction and many unobserved away characters. Measure server work, subscription size and rendering performance to set practical budgets.

Accept only after testing the deployed Discord Activity with real accounts: arrival, claim, build, visit, leave, observe away character, return, and recover an edited/deleted location. Record deployment versions and results. Do not treat a passing standalone browser smoke test as proof of Discord integration.

## Migration and scope

Keep existing renderer, movement, seating, script runtime and agent tools where they fit. Existing zones may supply migration input, but they are not the new community/property abstraction.

The Lantern Above content can become a test community's authored space. The Nexus scene may be reused as a welcome room with no global privileges. Remove global portal lists and Nexus travel behavior from the community experience. Inventory existing data and prepare a migration/reset procedure before deployment; this design update itself does not authorize deleting production content.

Initially exclude cross-server travel, voice-channel automation, economic systems, offline generative conversations, arbitrary avatar rigs and a model marketplace. Interior locks and departed-member content retention are future work. Expansion has no progression gate, but technical resource budgets remain necessary and should be measured rather than presented as scarce map land.

Remaining implementation investigation: Discord credential/session binding, membership freshness, deployment hosting, entrance placement under crowding, and measured routine/scene budgets. These have engineering defaults to evaluate in the early milestones; they do not reopen the settled product decisions. A pilot server still needs to be selected.

## References

- [Current runtime architecture](architecture.md) and [shared renderer](shared-world.md) describe existing implementation, not this future product contract.
- [Current agent authoring](agent-building.md) and [geometry contract](../public/poc/AUTHORING.md).
- Discord documentation consulted during design review: [Activities](https://docs.discord.com/developers/activities/how-activities-work), [building an Activity](https://docs.discord.com/developers/activities/building-an-activity), [networking](https://docs.discord.com/developers/activities/development-guides/networking), and [multiplayer instances](https://docs.discord.com/developers/activities/development-guides/multiplayer-experience).
