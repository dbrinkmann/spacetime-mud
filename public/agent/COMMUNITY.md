# Lantern community building

Use any MCP-compatible coding agent. Node.js 22 or newer is required on the creator's machine. No game repository clone, Discord secret, player token, or game-managed inference is needed.

Download https://lantern-staging.dbrinkmann.workers.dev/agent/lantern-agent.mjs to a stable local path. This is a self-contained Node MCP client; no npm install is needed. Configure your MCP client with `command: "node"` and `args: ["/absolute/path/to/lantern-agent.mjs"]`. On Windows the path can be `C:\\Users\\your-name\\.lantern-agent\\lantern-agent.mjs`. Use an absolute path suited to your machine and your client's configuration format.

Example MCP configuration:

```json
{
  "mcpServers": {
    "lantern": {
      "command": "node",
      "args": ["/absolute/path/to/lantern-agent.mjs"],
      "env": {
        "SPACETIME_HOST": "https://maincloud.spacetimedb.com",
        "SPACETIME_DATABASE": "dbrinkmann-lantern-staging"
      }
    }
  }
}
```

1. Call `world_connect`. Give the user its `agent_id` (a public identity, not a secret).
2. The user opens Create inside the Discord Activity, pastes that ID and clicks Connect agent. Server admins can explicitly enable common-space editing. Do not ask the user for their game token or Discord credentials.
3. Call `world_guide` for the bundled geometry contract, complete JSON schemas and examples. Call `world_inspect` with the `community_id` from the user's setup prompt. If the grant has not arrived yet, ask the user to complete the connection and inspect again.
4. Inspect `properties[].editable`. Common properties are editable only with a common-space grant from a current admin. The owner's home is separately editable. Inspect the target room's current source and revision before making changes.
5. Use `world_validate`, then `world_publish_room` with `base_revision`. Updates are live immediately; there is no mandatory review queue. The scene's name and description update the room's name and description. Preserve existing authored content unless the user asks for replacement.

## Tools

- `world_inspect`: community, current character/home, properties and edit rights, room metadata, selected room's full source, links and revision history metadata. Specify `room_id` to inspect another room.
- `world_claim_home`: attach the owner's first home to a common room.
- `world_create_room`: add a room inside an editable property, with named forward/return connections. Admin agents can expand common space with this same tool.
- `world_link_rooms`: connect existing rooms in the same editable property. Homes enter through their system-managed doorway; no arbitrary cross-property link permission is implied.
- `world_publish_room`: publish cuboid room geometry and metadata live, with revision conflict checks.
- `world_publish_avatar`: publish the owner's six-part character and rigid cosmetics.
- `world_set_home_routine`: set up to eight reachable ground-level points in the home's entrance room. The away character follows a closed walking route and pauses; no inference runs offline.
- `world_restore_room`: restore a history entry as a new scene revision, using the current base revision.
- `world_set_welcome`: with common-space admin authority, designate a common room as the community's arrival/fallback room.

Room connections form a graph. There are no competing map coordinates and home doorways consume no compass direction. Rooms and avatars use the existing box geometry, shared six-part animation and navigation contracts. `world_guide` returns these in full, including JSON schemas. Room scenes currently cannot reference legacy scripted-object IDs; scripted community objects are a separate implementation step.

Keep the Activity open while building. Discord membership is reverified there every minute and grants stop authorizing edits when membership expires or is revoked. Agent connections never keep the player online or control their avatar. Reconnect after a database upgrade if your MCP client reports a schema mismatch; download the current client after API changes.
