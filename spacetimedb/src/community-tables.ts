import { table, t } from "spacetimedb/server";

// Separate from the legacy world: no anonymous/public world metadata.
export const communityAuthority = table(
  {},
  {
    key: t.string().primaryKey(),
    identity: t.identity(),
  },
);
export const community = table(
  {},
  {
    id: t.string().primaryKey(),
    name: t.string(),
    welcomeRoom: t.u64(),
  },
);
export const communityMember = table(
  {},
  {
    key: t.string().primaryKey(),
    communityId: t.string().index("btree"),
    identity: t.identity(),
    discordUserId: t.string(),
    admin: t.bool(),
    active: t.bool(),
    verifiedAt: t.timestamp(),
  },
);
export const communityLease = table(
  {},
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    memberKey: t.string().index("btree"),
    verifiedAt: t.timestamp(),
  },
);
export const communityAgentGrant = table(
  {},
  {
    key: t.string().primaryKey(),
    communityId: t.string().index("btree"),
    agent: t.identity(),
    owner: t.identity(),
    commonSpace: t.bool(),
    createdAt: t.timestamp(),
  },
);
export const property = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    communityId: t.string().index("btree"),
    owner: t.identity(),
    name: t.string(),
    common: t.bool(),
    entrance: t.u64(),
  },
);
export const communityRoom = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    propertyId: t.u64().index("btree"),
    communityId: t.string().index("btree"),
    name: t.string(),
    description: t.string(),
    source: t.string(),
    revision: t.u32(),
  },
);
export const communityExit = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    communityId: t.string().index("btree"),
    fromRoom: t.u64().index("btree"),
    toRoom: t.u64(),
    label: t.string(),
    // A home door is system-managed and always traversable.
    homeProperty: t.u64(),
    reverseId: t.u64(),
    entranceSpot: t.string().default(""),
  },
);
export const communityCharacter = table(
  {},
  {
    key: t.string().primaryKey(),
    communityId: t.string().index("btree"),
    identity: t.identity(),
    name: t.string(),
    roomId: t.u64(),
    homeProperty: t.u64(),
    controller: t.string(),
    lifecycle: t.u32(),
    away: t.bool(),
    path: t.string(),
    startedAt: t.timestamp(),
    pose: t.string(),
    seat: t.string(),
    yaw: t.f64(),
    routine: t.string(),
    avatarSource: t.string(),
  },
);
export const communitySession = table(
  {},
  {
    id: t.connectionId().primaryKey(),
    characterKey: t.string().index("btree"),
  },
);
export const communityAway = table(
  {},
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    characterKey: t.string().index("btree"),
    lifecycle: t.u32(),
  },
);
export const communityRevision = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index("btree"),
    communityId: t.string(),
    revision: t.u32(),
    source: t.string(),
    author: t.identity(),
    createdAt: t.timestamp(),
  },
);
