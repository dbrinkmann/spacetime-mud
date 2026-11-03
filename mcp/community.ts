import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { DbConnection } from "../client/module_bindings/index.ts";
import { parseDefinition } from "../shared/geometry.ts";
import { validateNavigation } from "../shared/navigation.ts";
import { emptyRoom, neutralCharacter } from "../shared/world.ts";
declare const COMMUNITY_AUTHORING: string;
declare const COMMUNITY_ROOM_SCHEMA: string;
declare const COMMUNITY_CHARACTER_SCHEMA: string;

console.log = (...args) => console.error(...args);
const host = process.env.SPACETIME_HOST ?? "https://maincloud.spacetimedb.com";
const database = process.env.SPACETIME_DATABASE ?? "dbrinkmann-lantern-staging";
const site =
  process.env.GAME_URL ?? "https://lantern-staging.dbrinkmann.workers.dev";
const dir = process.env.MCP_STATE_DIR ?? join(homedir(), ".lantern-agent");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = join(
  dir,
  createHash("sha256")
    .update(host + "/" + database)
    .digest("hex")
    .slice(0, 20) + ".json",
);
const token = existsSync(file)
  ? JSON.parse(readFileSync(file, "utf8")).token
  : undefined;
let connection: DbConnection | undefined;
const connected = new Promise<DbConnection>((resolve, reject) => {
  const timeout = setTimeout(() => {
    connection?.disconnect();
    reject(new Error("World connection timed out."));
  }, 20000);
  connection = DbConnection.builder()
    .withUri(host)
    .withDatabaseName(database)
    .withToken(token)
    .withAutomaticReconnect()
    .onConnect((c, _id, token) => {
      writeFileSync(file, JSON.stringify({ token }), { mode: 0o600 });
      c.subscriptionBuilder()
        .onApplied(() => {
          clearTimeout(timeout);
          resolve(c);
        })
        .onError((ctx) => {
          clearTimeout(timeout);
          reject(ctx.event);
        })
        .subscribe(
          [
            "my_communities",
            "my_community_roles",
            "my_community_agents",
            "community_properties",
            "community_rooms",
            "community_exits",
            "community_characters",
            "community_history",
          ].map((n) => `SELECT * FROM ${n}`),
        );
    })
    .onConnectError((_c, e) => {
      clearTimeout(timeout);
      reject(e);
    })
    .build();
});
void connected.catch(() => {});
const server = new McpServer({
  name: "lantern-community-builder",
  version: "1.0.0",
});
const json = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(
        value,
        (_k, v) => (typeof v === "bigint" ? String(v) : v),
        2,
      ),
    },
  ],
});
const guard =
  <T>(fn: (a: T) => Promise<unknown>) =>
  async (a: T) => {
    try {
      return json(await fn(a));
    } catch (e) {
      return {
        ...json({ error: e instanceof Error ? e.message : String(e) }),
        isError: true,
      };
    }
  };
const id = z.string().regex(/^[1-9][0-9]{0,23}$/);
const source = z.string().max(500000);
const scope = { community_id: id };
function inspect(c: DbConnection, guild: string, roomId?: string) {
  const grant = [...c.db.myCommunityAgents.iter()].find(
    (g) => g.communityId === guild && g.agent.equals(c.identity!),
  );
  if (!grant)
    throw new Error(
      "Not paired or membership expired. Paste the world_connect agent ID into Create inside Discord. Keep the Activity open while building.",
    );
  const role = [...c.db.myCommunityRoles.iter()].find(
    (m) => m.communityId === guild && m.identity.equals(grant.owner),
  );
  if (!role)
    throw new Error("Community access is not active. Reopen the Activity.");
  const character = [...c.db.communityCharacters.iter()].find(
    (p) => p.communityId === guild && p.identity.equals(grant.owner),
  );
  const properties = [...c.db.communityProperties.iter()]
    .filter((p) => p.communityId === guild)
    .map((p) => ({
      ...p,
      editable: p.common
        ? role.admin && grant.commonSpace
        : p.owner.equals(grant.owner),
    }));
  const rooms = [...c.db.communityRooms.iter()].filter(
    (r) => r.communityId === guild,
  );
  const selected = roomId ? BigInt(roomId) : character?.roomId;
  const room = rooms.find((r) => r.id === selected);
  if (roomId && !room) throw new Error("Room is not in this community.");
  return {
    community: c.db.myCommunities.id.find(guild),
    player: character,
    common_space_editing: role.admin && grant.commonSpace,
    properties,
    rooms: rooms.map(({ source: _source, ...r }) => r),
    room,
    entrance_spots: room
      ? parseDefinition(room.source, "room")
          .objects.filter((o) => o.homeEntrance)
          .map((o) => ({
            spot_id: o.id,
            name: o.name,
            position: o.position,
            approach: o.homeEntrance!.approach,
            available: ![...c.db.communityExits.iter()].some(
              (e) => e.fromRoom === room.id && e.entranceSpot === o.id,
            ),
          }))
      : [],
    exits: [...c.db.communityExits.iter()].filter(
      (e) => e.communityId === guild,
    ),
    history: [...c.db.communityHistory.iter()]
      .filter((v) => v.roomId === selected)
      .map(({ source: _source, ...v }) => v),
  };
}
function checkRoom(c: DbConnection, guild: string, roomId: string) {
  inspect(c, guild, roomId);
}
server.registerTool(
  "world_connect",
  {
    description:
      "Get this agent's public pairing ID and approval instructions for Discord. No player token is requested.",
    inputSchema: { community_id: id.optional() },
  },
  guard(async (a) => {
    const c = await connected;
    return {
      agent_id: c.identity!.toHexString(),
      community_id: a.community_id,
      grants: [...c.db.myCommunityAgents.iter()].map((g) => ({
        community_id: g.communityId,
        common_space: g.commonSpace,
      })),
      instructions:
        "In the Discord Activity open Create, paste agent_id and approve. Server admins can enable common-space editing. Keep the Activity open while building, then call world_inspect. Agent connections do not count as player presence.",
    };
  }),
);
server.registerTool(
  "world_guide",
  {
    description:
      "Read the complete cuboid geometry/character contract, schemas, examples and community building workflow.",
    inputSchema: {},
  },
  guard(async () => ({
    workflow:
      "Call world_connect; player pairs inside Discord Create. Call world_inspect with community_id. Editable common properties require an admin grant; home properties belong to the paired member. Read current scene/revision before editing. Validate then publish directly; there is no review queue. Do not call legacy zone tools. Do not request player tokens, Discord secrets or model credentials. Existing scripted-object IDs cannot be attached to community scenes yet. Rooms use named links and no exclusive grid coordinates. Preserve existing room geometry and placements unless the requested change replaces them. Self avatar names come from the character, not the asset name.",
    contract:
      typeof COMMUNITY_AUTHORING === "undefined"
        ? readFileSync(
            new URL("../public/poc/AUTHORING.md", import.meta.url),
            "utf8",
          )
        : COMMUNITY_AUTHORING,
    room_schema: JSON.parse(
      typeof COMMUNITY_ROOM_SCHEMA === "undefined"
        ? readFileSync(
            new URL("../public/poc/room.schema.json", import.meta.url),
            "utf8",
          )
        : COMMUNITY_ROOM_SCHEMA,
    ),
    character_schema: JSON.parse(
      typeof COMMUNITY_CHARACTER_SCHEMA === "undefined"
        ? readFileSync(
            new URL("../public/poc/character.schema.json", import.meta.url),
            "utf8",
          )
        : COMMUNITY_CHARACTER_SCHEMA,
    ),
    empty_room: emptyRoom(),
    character_example: neutralCharacter("Example"),
    site,
  })),
);
server.registerTool(
  "world_inspect",
  {
    description:
      "Inspect a community, editable properties, current room source/revision, home and room links.",
    inputSchema: { ...scope, room_id: id.optional() },
  },
  guard(async (a) => inspect(await connected, a.community_id, a.room_id)),
);
server.registerTool(
  "world_validate",
  {
    description:
      "Validate a room or character, including geometry budgets and reachable navigation, without publishing.",
    inputSchema: { kind: z.enum(["room", "character"]), source },
  },
  guard(async (a) => {
    const value =
      a.kind === "room"
        ? parseDefinition(a.source, "room")
        : parseDefinition(a.source, "character");
    if (a.kind === "room")
      validateNavigation(value as ReturnType<typeof emptyRoom>);
    return { valid: true, definition: value };
  }),
);
server.registerTool(
  "world_publish_room",
  {
    description:
      "Publish validated 3D room geometry live. Requires owner/common-space authority and current base_revision. Also updates room name/description.",
    inputSchema: {
      ...scope,
      room_id: id,
      base_revision: z.number().int().nonnegative(),
      source,
    },
  },
  guard(async (a) => {
    const c = await connected;
    checkRoom(c, a.community_id, a.room_id);
    await c.reducers.publishCommunityRoom({
      roomId: BigInt(a.room_id),
      source: a.source,
      baseRevision: a.base_revision,
    });
    return inspect(c, a.community_id, a.room_id);
  }),
);
server.registerTool(
  "world_create_room",
  {
    description:
      "Add a connected room to an editable home or common property. No map coordinates are reserved.",
    inputSchema: {
      ...scope,
      from_room_id: id,
      name: z.string().min(1).max(80),
      label: z.string().min(1).max(80),
      back_label: z.string().min(1).max(80),
    },
  },
  guard(async (a) => {
    const c = await connected;
    checkRoom(c, a.community_id, a.from_room_id);
    await c.reducers.addPropertyRoom({
      fromRoomId: BigInt(a.from_room_id),
      name: a.name,
      label: a.label,
      backLabel: a.back_label,
    });
    return inspect(c, a.community_id, a.from_room_id);
  }),
);
server.registerTool(
  "world_link_rooms",
  {
    description: "Connect two existing rooms in the same editable property.",
    inputSchema: {
      ...scope,
      from_room_id: id,
      to_room_id: id,
      label: z.string().min(1).max(80),
      back_label: z.string().min(1).max(80),
    },
  },
  guard(async (a) => {
    const c = await connected;
    checkRoom(c, a.community_id, a.from_room_id);
    checkRoom(c, a.community_id, a.to_room_id);
    await c.reducers.linkPropertyRooms({
      fromRoomId: BigInt(a.from_room_id),
      toRoomId: BigInt(a.to_room_id),
      label: a.label,
      backLabel: a.back_label,
    });
    return inspect(c, a.community_id, a.from_room_id);
  }),
);
server.registerTool(
  "world_claim_home",
  {
    description:
      "Claim an unoccupied authored homeEntrance placement by spot_id. No home can be created without an available entrance in a common room.",
    inputSchema: {
      ...scope,
      common_room_id: id,
      spot_id: z.string().min(1).max(40),
      name: z.string().min(1).max(80),
    },
  },
  guard(async (a) => {
    const c = await connected;
    checkRoom(c, a.community_id, a.common_room_id);
    await c.reducers.claimHome({
      commonRoomId: BigInt(a.common_room_id),
      spotId: a.spot_id,
      name: a.name,
    });
    return inspect(c, a.community_id);
  }),
);
server.registerTool(
  "world_publish_avatar",
  {
    description:
      "Publish the paired member's character/cosmetics using the fixed six-part animation contract.",
    inputSchema: { ...scope, source },
  },
  guard(async (a) => {
    const c = await connected;
    inspect(c, a.community_id);
    await c.reducers.publishCommunityAvatar({
      communityId: a.community_id,
      source: a.source,
    });
    return inspect(c, a.community_id);
  }),
);
server.registerTool(
  "world_set_home_routine",
  {
    description:
      "Define up to eight reachable ground-level waypoints in the home entrance room for the automatic away routine.",
    inputSchema: {
      ...scope,
      points: z.array(z.tuple([z.number(), z.literal(0), z.number()])).max(8),
    },
  },
  guard(async (a) => {
    const c = await connected;
    inspect(c, a.community_id);
    await c.reducers.setHomeRoutine({
      communityId: a.community_id,
      points: JSON.stringify(a.points),
    });
    return inspect(c, a.community_id);
  }),
);
server.registerTool(
  "world_restore_room",
  {
    description:
      "Restore a prior room scene as a new live revision, checking current permissions and revision.",
    inputSchema: {
      ...scope,
      revision_id: id,
      base_revision: z.number().int().nonnegative(),
    },
  },
  guard(async (a) => {
    const c = await connected;
    inspect(c, a.community_id);
    const revision = c.db.communityHistory.id.find(BigInt(a.revision_id));
    if (!revision || revision.communityId !== a.community_id)
      throw new Error("Revision not available in this community.");
    await c.reducers.restoreCommunityRoom({
      revisionId: revision.id,
      baseRevision: a.base_revision,
    });
    return inspect(c, a.community_id, String(revision.roomId));
  }),
);
server.registerTool(
  "world_set_welcome",
  {
    description:
      "Admin only: designate an existing common room as this community's arrival/fallback room.",
    inputSchema: { ...scope, room_id: id },
  },
  guard(async (a) => {
    const c = await connected;
    checkRoom(c, a.community_id, a.room_id);
    await c.reducers.setWelcomeRoom({ roomId: BigInt(a.room_id) });
    return inspect(c, a.community_id, a.room_id);
  }),
);
await server.connect(new StdioServerTransport());
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    connection?.disconnect();
    process.exit(0);
  });
process.stdin.on("end", () => {
  connection?.disconnect();
  process.exit(0);
});
