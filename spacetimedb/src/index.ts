import {
  schema,
  table,
  t,
  SenderError,
  type ReducerCtx,
  type InferSchema,
  type ViewCtx,
} from "spacetimedb/server";
import { ScheduleAt, type Identity } from "spacetimedb";
import { executeScript, type Scalar } from "./scripts";
import { seedWorld } from "./showcase";

import { roomScene, avatar, visualDraft, presence } from "./visual-tables";
import {
  communityAuthority,
  community,
  communityMember,
  property,
  communityRoom,
  communityExit,
  communityCharacter,
  communityRevision,
  communitySession,
  communityAway,
  communityLease,
  communityAgentGrant,
} from "./community-tables";
import {
  parseDefinition,
  worldPoint,
  type Room as SceneRoom,
  type Vec3,
} from "../../shared/geometry";
import { validateNavigation, route, walkable } from "../../shared/navigation";
import { routineMotion } from "../../shared/community-motion";
import { emptyRoom, sampleMotion, type Motion } from "../../shared/world";

const Action = t.object("Action", { id: t.string(), label: t.string() });
const Exit = t.object("Exit", {
  direction: t.string(),
  destination: t.u64(),
  gateId: t.u64(),
  secret: t.bool(),
});
const zone = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    owner: t.identity(),
    entrance: t.u64(),
  },
);
const member = table(
  {},
  {
    key: t.string().primaryKey(),
    zoneId: t.u64().index("btree"),
    identity: t.identity(),
  },
);
const room = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    zoneId: t.u64().index("btree"),
    name: t.string(),
    description: t.string(),
    exits: t.array(Exit),
    creator: t.identity(),
    x: t.i32(),
    y: t.i32(),
    floor: t.i32(),
  },
);
const player = table(
  {},
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    nameKey: t.string().unique(),
    roomId: t.u64().index("btree"),
    online: t.bool(),
  },
);
const connection = table(
  {},
  { id: t.connectionId().primaryKey(), identity: t.identity().index("btree") },
);
const discovery = table(
  {},
  {
    key: t.string().primaryKey(),
    owner: t.identity().index("btree"),
    roomId: t.u64(),
  },
);
const object = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    zoneId: t.u64().index("btree"),
    roomId: t.u64().index("btree"),
    owner: t.identity(),
    kind: t.string(),
    name: t.string(),
    description: t.string(),
    actions: t.array(Action),
    versionId: t.u64(),
    active: t.bool(),
  },
);
const version = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    objectId: t.u64().index("btree"),
    author: t.identity(),
    name: t.string(),
    description: t.string(),
    actions: t.array(Action),
    source: t.string(),
    tested: t.bool(),
    report: t.string(),
    createdAt: t.timestamp(),
  },
);
const state = table(
  {},
  {
    key: t.string().primaryKey(),
    objectId: t.u64().index("btree"),
    scope: t.string(),
    name: t.string(),
    value: t.string(),
  },
);
const inventory = table(
  {},
  {
    key: t.string().primaryKey(),
    owner: t.identity().index("btree"),
    objectId: t.u64(),
    name: t.string(),
    quantity: t.u32(),
  },
);
const timer = table(
  {},
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    objectId: t.u64().index("btree"),
    versionId: t.u64(),
    name: t.string(),
    payload: t.string(),
    actor: t.identity(),
    repeatSeconds: t.u32(),
  },
);
const trace = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    zoneId: t.u64().index("btree"),
    objectId: t.u64(),
    event: t.string(),
    result: t.string(),
    timestamp: t.timestamp(),
  },
);
const chat = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index("btree"),
    author: t.string(),
    text: t.string(),
    kind: t.string(),
    timestamp: t.timestamp(),
  },
);
const inbox = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index("btree"),
    author: t.string(),
    text: t.string(),
    timestamp: t.timestamp(),
  },
);
const grant = table(
  {},
  {
    owner: t.identity().primaryKey(),
    bridge: t.identity().unique(),
    createdAt: t.timestamp(),
  },
);
const job = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index("btree"),
    bridge: t.identity().index("btree"),
    roomId: t.u64(),
    npcId: t.u64(),
    prompt: t.string(),
    status: t.string(),
    result: t.string(),
    createdAt: t.timestamp(),
  },
);
const request = table(
  {},
  {
    key: t.string().primaryKey(),
    owner: t.identity().index("btree"),
    timestamp: t.timestamp(),
  },
);
const db = schema({
  communityAuthority,
  community,
  communityMember,
  property,
  communityRoom,
  communityExit,
  communityCharacter,
  communityRevision,
  communitySession,
  communityAway,
  communityLease,
  communityAgentGrant,
  roomScene,
  avatar,
  visualDraft,
  presence,
  zone,
  member,
  room,
  player,
  connection,
  discovery,
  object,
  version,
  state,
  inventory,
  timer,
  trace,
  chat,
  inbox,
  grant,
  job,
  request,
});
export default db;
export const serverTime = db.procedure(
  {},
  t.u64(),
  (ctx) => ctx.timestamp.microsSinceUnixEpoch,
);
function communityKey(id: string, actor: Identity) {
  return `${id}:${actor.toHexString()}`;
}
function communityScene(ctx: Ctx, roomId: bigint) {
  const r = ctx.db.communityRoom.id.find(roomId) ?? fail("Room not found.");
  return parseDefinition(r.source, "room");
}
function communityMotionAt(
  p: ReturnType<Ctx["db"]["communityCharacter"]["insert"]>,
  now: number,
) {
  const m: Motion = {
    path: JSON.parse(p.path),
    started: Number(p.startedAt.microsSinceUnixEpoch / 1000n),
    pose: p.pose,
    seat: p.seat,
    yaw: p.yaw,
  };
  return p.away ? routineMotion(m, now) : m;
}
function placeCommunityCharacter(
  ctx: Ctx,
  p: ReturnType<Ctx["db"]["communityCharacter"]["insert"]>,
  roomId: bigint,
) {
  ctx.db.communityCharacter.key.update({
    ...p,
    roomId,
    path: JSON.stringify([communityScene(ctx, roomId).spawn]),
    startedAt: ctx.timestamp,
    pose: "idle",
    seat: "",
    yaw: 0,
  });
}
function requireCharacterControl(ctx: Ctx, id: string) {
  requireCommunity(ctx, id);
  const p =
    ctx.db.communityCharacter.key.find(communityKey(id, ctx.sender)) ??
    fail("Enter first.");
  if (!ctx.connectionId || p.controller !== ctx.connectionId.toHexString())
    fail("Another session controls this character. Re-enter to take control.");
  return p;
}
function leaveCommunitySession(ctx: Ctx) {
  if (!ctx.connectionId) return;
  const s = ctx.db.communitySession.id.find(ctx.connectionId);
  if (!s) return;
  ctx.db.communitySession.id.delete(s.id);
  const p = ctx.db.communityCharacter.key.find(s.characterKey);
  if (!p) return;
  const remaining = [...ctx.db.communitySession.characterKey.filter(p.key)];
  if (remaining.length) {
    if (p.controller === s.id.toHexString())
      ctx.db.communityCharacter.key.update({
        ...p,
        controller: remaining[0].id.toHexString(),
      });
    return;
  }
  const lifecycle = p.lifecycle + 1;
  ctx.db.communityCharacter.key.update({ ...p, controller: "", lifecycle });
  ctx.db.communityAway.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(
      ctx.timestamp.microsSinceUnixEpoch + 10_000_000n,
    ),
    characterKey: p.key,
    lifecycle,
  });
}
export const beginCommunityAway = db.reducer(
  { onSchedule: communityAway },
  { timer: communityAway.rowType },
  (ctx, { timer }) => {
    const p = ctx.db.communityCharacter.key.find(timer.characterKey);
    if (
      !p ||
      p.lifecycle !== timer.lifecycle ||
      [...ctx.db.communitySession.characterKey.filter(p.key)].length
    )
      return;
    const home = ctx.db.property.id.find(p.homeProperty);
    if (!home) return;
    const scene = communityScene(ctx, home.entrance);
    const points: Vec3[] = JSON.parse(p.routine);
    let path: Vec3[] = [scene.spawn];
    for (const point of [...points, scene.spawn]) {
      const leg = route(scene, path[path.length - 1], point);
      if (!leg) {
        path = [scene.spawn];
        break;
      }
      path.push(...leg);
    }
    ctx.db.communityCharacter.key.update({
      ...p,
      roomId: home.entrance,
      away: true,
      path: JSON.stringify(path),
      startedAt: ctx.timestamp,
      pose: "idle",
      seat: "",
      yaw: 0,
    });
  },
);
function requireCommunityOperator(ctx: Ctx) {
  if (
    !["operator", "gateway"].some((key) =>
      ctx.db.communityAuthority.key.find(key)?.identity.equals(ctx.sender),
    )
  )
    fail(
      "Only the community authentication authority can provision membership.",
    );
}
export const setCommunityGateway = db.reducer(
  { identity: t.identity() },
  (ctx, a) => {
    if (
      !ctx.db.communityAuthority.key
        .find("operator")
        ?.identity.equals(ctx.sender)
    )
      fail("Operator required.");
    const row = { key: "gateway", identity: a.identity };
    if (ctx.db.communityAuthority.key.find("gateway"))
      ctx.db.communityAuthority.key.update(row);
    else ctx.db.communityAuthority.insert(row);
  },
);
function scheduleMembershipExpiry(ctx: Ctx, key: string) {
  for (const lease of ctx.db.communityLease.memberKey.filter(key))
    ctx.db.communityLease.scheduledId.delete(lease.scheduledId);
  ctx.db.communityLease.insert({
    scheduledId: 0n,
    memberKey: key,
    verifiedAt: ctx.timestamp,
    scheduledAt: ScheduleAt.time(
      ctx.timestamp.microsSinceUnixEpoch + 180_000_000n,
    ),
  });
}
function withdrawCommunitySessions(ctx: Ctx, key: string) {
  for (const s of ctx.db.communitySession.characterKey.filter(key))
    ctx.db.communitySession.id.delete(s.id);
  const p = ctx.db.communityCharacter.key.find(key);
  if (p && !p.away) {
    const lifecycle = p.lifecycle + 1;
    ctx.db.communityCharacter.key.update({ ...p, controller: "", lifecycle });
    ctx.db.communityAway.insert({
      scheduledId: 0n,
      characterKey: key,
      lifecycle,
      scheduledAt: ScheduleAt.time(
        ctx.timestamp.microsSinceUnixEpoch + 10_000_000n,
      ),
    });
  }
}
export const expireCommunityMembership = db.reducer(
  { onSchedule: communityLease },
  { timer: communityLease.rowType },
  (ctx, { timer }) => {
    const m = ctx.db.communityMember.key.find(timer.memberKey);
    if (
      m &&
      m.verifiedAt.microsSinceUnixEpoch ===
        timer.verifiedAt.microsSinceUnixEpoch
    ) {
      ctx.db.communityMember.key.update({ ...m, active: false, admin: false });
      withdrawCommunitySessions(ctx, m.key);
    }
  },
);
function communityAccess(ctx: ReadCtx, id: string, actor: Identity) {
  const m = ctx.db.communityMember.key.find(communityKey(id, actor));
  return m?.active ? m : undefined;
}
function communityBuildAccess(ctx: ReadCtx, id: string, actor: Identity) {
  const own = communityAccess(ctx, id, actor);
  if (own) return own;
  const grant = ctx.db.communityAgentGrant.key.find(communityKey(id, actor));
  if (!grant) return undefined;
  const owner = communityAccess(ctx, id, grant.owner);
  return owner
    ? { ...owner, admin: owner.admin && grant.commonSpace }
    : undefined;
}
function requireCommunityBuilder(ctx: Ctx, id: string) {
  return (
    communityBuildAccess(ctx, id, ctx.sender) ??
    fail(
      "Active membership and an approved community agent grant are required.",
    )
  );
}
function communityBuildRoom(ctx: Ctx, id: bigint) {
  const r = ctx.db.communityRoom.id.find(id) ?? fail("Room not found.");
  requireCommunityBuilder(ctx, r.communityId);
  return r;
}
export const authorizeCommunityAgent = db.reducer(
  { communityId: t.string(), agent: t.identity(), commonSpace: t.bool() },
  (ctx, a) => {
    const member = requireCommunity(ctx, a.communityId);
    if (a.agent.equals(ctx.sender))
      fail("Use your agent's pairing ID, not your player identity.");
    if (!ctx.db.communityCharacter.key.find(member.key))
      fail("Enter the community first.");
    if (a.commonSpace && !member.admin)
      fail("Only server admins can delegate common-space editing.");
    const key = communityKey(a.communityId, a.agent);
    const existing = ctx.db.communityAgentGrant.key.find(key);
    if (existing && !existing.owner.equals(ctx.sender))
      fail("This agent is already paired to another member in this community.");
    const row = {
      key,
      communityId: a.communityId,
      agent: a.agent,
      owner: ctx.sender,
      commonSpace: a.commonSpace,
      createdAt: ctx.timestamp,
    };
    if (existing) ctx.db.communityAgentGrant.key.update(row);
    else ctx.db.communityAgentGrant.insert(row);
  },
);
export const revokeCommunityAgent = db.reducer(
  { communityId: t.string(), agent: t.identity() },
  (ctx, a) => {
    const m = requireCommunity(ctx, a.communityId);
    const key = communityKey(a.communityId, a.agent);
    const grant = ctx.db.communityAgentGrant.key.find(key);
    if (!grant) return;
    if (!grant.owner.equals(ctx.sender) && !m.admin)
      fail("Only the owner or a server admin can revoke this grant.");
    ctx.db.communityAgentGrant.key.delete(key);
  },
);
export const myCommunityAgents = db.view(
  { name: "my_community_agents", public: true },
  t.array(communityAgentGrant.rowType),
  (ctx) =>
    [...ctx.db.communityAgentGrant.iter()].filter(
      (g) =>
        !!communityAccess(ctx, g.communityId, g.owner) &&
        (g.agent.equals(ctx.sender) || g.owner.equals(ctx.sender)),
    ),
);
function requireCommunity(ctx: Ctx, id: string) {
  return (
    communityAccess(ctx, id, ctx.sender) ??
    fail("Community membership required.")
  );
}
function communityRoomFor(ctx: Ctx, id: bigint) {
  const r = ctx.db.communityRoom.id.find(id) ?? fail("Room not found.");
  requireCommunity(ctx, r.communityId);
  return r;
}
function requirePropertyEdit(ctx: Ctx, id: bigint) {
  const p = ctx.db.property.id.find(id) ?? fail("Property not found.");
  const m = requireCommunityBuilder(ctx, p.communityId);
  if (!(p.common ? m.admin : p.owner.equals(m.identity)))
    fail("You cannot edit this property.");
  return p;
}
function addCommunityRoom(
  ctx: Ctx,
  p: ReturnType<Ctx["db"]["property"]["insert"]>,
  name: string,
) {
  return ctx.db.communityRoom.insert({
    id: 0n,
    propertyId: p.id,
    communityId: p.communityId,
    name: text(name, "Room name", 80),
    description: "",
    source: JSON.stringify(emptyRoom(name)),
    revision: 0,
  });
}
function connectCommunityRooms(
  ctx: Ctx,
  from: bigint,
  to: bigint,
  communityId: string,
  label: string,
  backLabel: string,
  homeProperty = 0n,
  entranceSpot = "",
) {
  const a = ctx.db.communityExit.insert({
    id: 0n,
    communityId,
    fromRoom: from,
    toRoom: to,
    label: text(label, "Entrance label", 80),
    homeProperty,
    reverseId: 0n,
    entranceSpot,
  });
  const b = ctx.db.communityExit.insert({
    id: 0n,
    communityId,
    fromRoom: to,
    toRoom: from,
    label: text(backLabel, "Return label", 80),
    homeProperty,
    reverseId: a.id,
    entranceSpot: "",
  });
  ctx.db.communityExit.id.update({ ...a, reverseId: b.id });
}

// Provisioning is deliberately not a browser-trusted join/create-server API.
// The operator is the database initializer on this isolated development module.
// A Discord gateway must verify membership before invoking this reducer.
export const provisionCommunity = db.reducer(
  {
    communityId: t.string(),
    name: t.string(),
    admin: t.identity(),
    discordUserId: t.string(),
  },
  (ctx, a) => {
    requireCommunityOperator(ctx);
    if (
      !/^[0-9]{1,24}$/.test(a.communityId) ||
      !/^[0-9]{1,24}$/.test(a.discordUserId)
    )
      fail("Discord identifiers must be numeric strings.");
    if (ctx.db.community.id.find(a.communityId))
      fail("Community already exists.");
    const p = ctx.db.property.insert({
      id: 0n,
      communityId: a.communityId,
      owner: a.admin,
      name: "Common spaces",
      common: true,
      entrance: 0n,
    });
    const r = addCommunityRoom(ctx, p, "Welcome");
    ctx.db.property.id.update({ ...p, entrance: r.id });
    ctx.db.community.insert({
      id: a.communityId,
      name: text(a.name, "Community name", 80),
      welcomeRoom: r.id,
    });
    ctx.db.communityMember.insert({
      key: communityKey(a.communityId, a.admin),
      communityId: a.communityId,
      identity: a.admin,
      discordUserId: a.discordUserId,
      admin: true,
      active: true,
      verifiedAt: ctx.timestamp,
    });
    scheduleMembershipExpiry(ctx, communityKey(a.communityId, a.admin));
  },
);
export const setCommunityMember = db.reducer(
  {
    communityId: t.string(),
    identity: t.identity(),
    discordUserId: t.string(),
    admin: t.bool(),
    active: t.bool(),
  },
  (ctx, a) => {
    requireCommunityOperator(ctx);
    if (!ctx.db.community.id.find(a.communityId)) fail("Community not found.");
    const key = communityKey(a.communityId, a.identity);
    if (!/^[0-9]{1,24}$/.test(a.discordUserId))
      fail("Invalid Discord user ID.");
    const old = ctx.db.communityMember.key.find(key);
    if (old && old.discordUserId !== a.discordUserId)
      fail("Identity is already bound.");
    if (
      [...ctx.db.communityMember.communityId.filter(a.communityId)].some(
        (m) =>
          m.discordUserId === a.discordUserId && !m.identity.equals(a.identity),
      )
    )
      fail("Discord member already has an identity in this community.");
    const next = {
      key,
      communityId: a.communityId,
      identity: a.identity,
      discordUserId: a.discordUserId,
      admin: a.admin,
      active: a.active,
      verifiedAt: ctx.timestamp,
    };
    if (old) ctx.db.communityMember.key.update(next);
    else ctx.db.communityMember.insert(next);
    scheduleMembershipExpiry(ctx, key);
    if (!a.active) withdrawCommunitySessions(ctx, key);
  },
);
export const enterCommunity = db.reducer(
  { communityId: t.string(), name: t.string() },
  (ctx, a) => {
    requireCommunity(ctx, a.communityId);
    const key = communityKey(a.communityId, ctx.sender);
    const c =
      ctx.db.community.id.find(a.communityId) ?? fail("Community not found.");
    if (!ctx.connectionId) fail("A player connection is required.");
    const session = ctx.db.communitySession.id.find(ctx.connectionId);
    if (session?.characterKey !== key) leaveCommunitySession(ctx);
    if (!ctx.db.communitySession.id.find(ctx.connectionId))
      ctx.db.communitySession.insert({
        id: ctx.connectionId,
        characterKey: key,
      });
    const old = ctx.db.communityCharacter.key.find(key);
    if (old) {
      const now = Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
      const scene = communityScene(ctx, old.roomId);
      const position = sampleMotion(communityMotionAt(old, now), scene, now);
      ctx.db.communityCharacter.key.update({
        ...old,
        controller: ctx.connectionId.toHexString(),
        lifecycle: old.lifecycle + 1,
        away: false,
        path: JSON.stringify([position.position]),
        startedAt: ctx.timestamp,
        yaw: position.yaw,
      });
    } else
      ctx.db.communityCharacter.insert({
        key,
        communityId: c.id,
        identity: ctx.sender,
        name: text(a.name, "Character name", 40),
        roomId: c.welcomeRoom,
        homeProperty: 0n,
        controller: ctx.connectionId.toHexString(),
        lifecycle: 0,
        away: false,
        path: JSON.stringify([communityScene(ctx, c.welcomeRoom).spawn]),
        startedAt: ctx.timestamp,
        pose: "idle",
        seat: "",
        yaw: 0,
        routine: "[]",
        avatarSource: "",
      });
  },
);
export const claimHome = db.reducer(
  { commonRoomId: t.u64(), name: t.string(), spotId: t.string() },
  (ctx, a) => {
    const r = communityBuildRoom(ctx, a.commonRoomId);
    if (!ctx.db.property.id.find(r.propertyId)?.common)
      fail("Attach homes to common rooms.");
    const spot = communityScene(ctx, r.id).objects.find(
      (o) => o.id === a.spotId && o.homeEntrance,
    );
    if (!spot) fail("Choose an available authored home entrance.");
    if (
      [...ctx.db.communityExit.fromRoom.filter(r.id)].some(
        (e) => e.entranceSpot === a.spotId,
      )
    )
      fail("This entrance already belongs to a home.");
    const actor = requireCommunityBuilder(ctx, r.communityId).identity;
    const key = communityKey(r.communityId, actor);
    const character =
      ctx.db.communityCharacter.key.find(key) ??
      fail("Enter the community first.");
    if (character.homeProperty)
      fail("You already have a home; expand it with more rooms.");
    const p = ctx.db.property.insert({
      id: 0n,
      communityId: r.communityId,
      owner: actor,
      name: text(a.name, "Home name", 80),
      common: false,
      entrance: 0n,
    });
    const home = addCommunityRoom(ctx, p, p.name);
    ctx.db.property.id.update({ ...p, entrance: home.id });
    connectCommunityRooms(
      ctx,
      r.id,
      home.id,
      r.communityId,
      p.name,
      `Outside: ${r.name}`,
      p.id,
      a.spotId,
    );
    placeCommunityCharacter(ctx, { ...character, homeProperty: p.id }, home.id);
  },
);
export const removeCommunityHome = db.reducer(
  { propertyId: t.u64() },
  (ctx, a) => {
    if (
      !ctx.db.communityAuthority.key
        .find("operator")
        ?.identity.equals(ctx.sender)
    )
      fail("World operator only.");
    const p = ctx.db.property.id.find(a.propertyId) ?? fail("Home not found.");
    if (p.common) fail("Cannot remove common property.");
    const c = ctx.db.community.id.find(p.communityId)!;
    const rooms = [...ctx.db.communityRoom.propertyId.filter(p.id)];
    const ids = new Set(rooms.map((r) => r.id));
    for (const character of ctx.db.communityCharacter.communityId.filter(
      p.communityId,
    )) {
      if (character.homeProperty === p.id || ids.has(character.roomId)) {
        const next =
          character.homeProperty === p.id
            ? {
                ...character,
                homeProperty: 0n,
                routine: "[]",
                away: false,
                lifecycle: character.lifecycle + 1,
              }
            : character;
        placeCommunityCharacter(ctx, next, c.welcomeRoom);
      }
    }
    for (const e of ctx.db.communityExit.communityId.filter(p.communityId))
      if (ids.has(e.fromRoom) || ids.has(e.toRoom))
        ctx.db.communityExit.id.delete(e.id);
    for (const r of rooms) {
      for (const h of ctx.db.communityRevision.roomId.filter(r.id))
        ctx.db.communityRevision.id.delete(h.id);
      ctx.db.communityRoom.id.delete(r.id);
    }
    ctx.db.property.id.delete(p.id);
  },
);
export const addPropertyRoom = db.reducer(
  {
    fromRoomId: t.u64(),
    name: t.string(),
    label: t.string(),
    backLabel: t.string(),
  },
  (ctx, a) => {
    const r = communityBuildRoom(ctx, a.fromRoomId);
    const p = requirePropertyEdit(ctx, r.propertyId);
    if ([...ctx.db.communityRoom.propertyId.filter(p.id)].length >= 100)
      fail("Property room budget reached.");
    const next = addCommunityRoom(ctx, p, a.name);
    connectCommunityRooms(
      ctx,
      r.id,
      next.id,
      r.communityId,
      a.label,
      a.backLabel,
    );
  },
);
export const travelCommunity = db.reducer({ exitId: t.u64() }, (ctx, a) => {
  const e =
    ctx.db.communityExit.id.find(a.exitId) ?? fail("Entrance not found.");
  requireCommunity(ctx, e.communityId);
  const p = requireCharacterControl(ctx, e.communityId);
  if (p.roomId !== e.fromRoom) fail("You must be at this entrance.");
  const dest = communityRoomFor(ctx, e.toRoom);
  if (dest.communityId !== e.communityId)
    fail("Cross-community travel is not allowed.");
  placeCommunityCharacter(ctx, p, dest.id);
});
export const returnToWelcome = db.reducer(
  { communityId: t.string() },
  (ctx, a) => {
    requireCommunity(ctx, a.communityId);
    const c =
      ctx.db.community.id.find(a.communityId) ?? fail("Community not found.");
    const p = requireCharacterControl(ctx, c.id);
    placeCommunityCharacter(ctx, p, c.welcomeRoom);
  },
);
export const setWelcomeRoom = db.reducer({ roomId: t.u64() }, (ctx, a) => {
  const r = communityBuildRoom(ctx, a.roomId);
  if (!requireCommunityBuilder(ctx, r.communityId).admin)
    fail("Community administrator required.");
  if (!ctx.db.property.id.find(r.propertyId)?.common)
    fail("Welcome room must be common space.");
  const c = ctx.db.community.id.find(r.communityId)!;
  ctx.db.community.id.update({ ...c, welcomeRoom: r.id });
});
export const moveCommunityCharacter = db.reducer(
  {
    communityId: t.string(),
    x: t.f64(),
    z: t.f64(),
    seat: t.string(),
    pose: t.string(),
  },
  (ctx, a) => {
    const p = requireCharacterControl(ctx, a.communityId);
    if (
      !Number.isFinite(a.x) ||
      !Number.isFinite(a.z) ||
      !["idle", "wave", "talk", "stand"].includes(a.pose)
    )
      fail("Invalid movement.");
    const scene = communityScene(ctx, p.roomId);
    const now = Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
    const sampled = sampleMotion(communityMotionAt(p, now), scene, now);
    const oldSeat = scene.objects.find((o) => o.id === p.seat);
    const start =
      sampled.animation === "sit" && oldSeat?.seat
        ? worldPoint(oldSeat, oldSeat.seat.approach)
        : sampled.position;
    let target: Vec3 = a.pose === "idle" ? [a.x, 0, a.z] : start;
    if (a.seat) {
      const seat = scene.objects.find((o) => o.id === a.seat);
      if (!seat?.seat) fail("Seat not found.");
      if (
        [...ctx.db.communityCharacter.communityId.filter(a.communityId)].some(
          (other) =>
            other.key !== p.key &&
            other.roomId === p.roomId &&
            other.seat === a.seat,
        )
      )
        fail("Seat occupied.");
      target = worldPoint(seat, seat.seat.approach);
    }
    const path =
      route(scene, start, target) ?? fail("Unreachable destination.");
    ctx.db.communityCharacter.key.update({
      ...p,
      path: JSON.stringify([start, ...path]),
      startedAt: ctx.timestamp,
      pose: a.pose === "stand" ? "idle" : a.pose,
      seat: a.seat,
      yaw: sampled.yaw,
    });
  },
);
export const setHomeRoutine = db.reducer(
  { communityId: t.string(), points: t.string() },
  (ctx, a) => {
    const actor = requireCommunityBuilder(ctx, a.communityId).identity;
    const p =
      ctx.db.communityCharacter.key.find(communityKey(a.communityId, actor)) ??
      fail("Enter first.");
    const home =
      ctx.db.property.id.find(p.homeProperty) ?? fail("Claim a home first.");
    if (a.points.length > 4000) fail("Routine too large.");
    const points: unknown = JSON.parse(a.points);
    if (
      !Array.isArray(points) ||
      points.length > 8 ||
      points.some(
        (point) =>
          !Array.isArray(point) ||
          point.length !== 3 ||
          point.some((v) => typeof v !== "number" || !Number.isFinite(v)) ||
          point[1] !== 0,
      )
    )
      fail("Use at most eight ground-level points.");
    const scene = communityScene(ctx, home.entrance);
    let start = scene.spawn;
    for (const point of [...(points as Vec3[]), scene.spawn]) {
      if (!route(scene, start, point)) fail("Routine point unreachable.");
      start = point;
    }
    ctx.db.communityCharacter.key.update({
      ...p,
      routine: JSON.stringify(points),
    });
  },
);
export const publishCommunityAvatar = db.reducer(
  { communityId: t.string(), source: t.string() },
  (ctx, a) => {
    const actor = requireCommunityBuilder(ctx, a.communityId).identity;
    const p =
      ctx.db.communityCharacter.key.find(communityKey(a.communityId, actor)) ??
      fail("Enter first.");
    const avatar = parseDefinition(a.source, "character");
    ctx.db.communityCharacter.key.update({
      ...p,
      avatarSource: JSON.stringify(avatar),
    });
  },
);
function publishCommunityScene(
  ctx: Ctx,
  roomId: bigint,
  source: string,
  baseRevision: number,
) {
  const r = communityBuildRoom(ctx, roomId);
  requirePropertyEdit(ctx, r.propertyId);
  if (r.revision !== baseRevision)
    fail("Room changed; inspect its latest revision before publishing.");
  const scene = parseDefinition(source, "room");
  validateNavigation(scene);
  // Legacy object IDs cannot cross into the community runtime.
  if (scene.objects.some((o) => o.objectId))
    fail("Community scripted objects are not connected yet.");
  if (
    scene.objects.some((o) => o.homeEntrance) &&
    !ctx.db.property.id.find(r.propertyId)?.common
  )
    fail("Home entrance spots belong in common rooms only.");
  for (const e of ctx.db.communityExit.fromRoom.filter(r.id)) {
    if (
      e.entranceSpot &&
      !scene.objects.some((o) => o.id === e.entranceSpot && o.homeEntrance)
    )
      fail(
        `Occupied entrance ${e.entranceSpot} must be preserved. Move it within the room instead.`,
      );
  }
  const canonical = JSON.stringify(scene);
  ctx.db.communityRevision.insert({
    id: 0n,
    roomId,
    communityId: r.communityId,
    revision: r.revision,
    source: r.source,
    author: ctx.sender,
    createdAt: ctx.timestamp,
  });
  ctx.db.communityRoom.id.update({
    ...r,
    name: scene.name,
    description: scene.description,
    source: canonical,
    revision: r.revision + 1,
  });
  const now = Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
  const oldScene = parseDefinition(r.source, "room");
  for (const p of ctx.db.communityCharacter.communityId.filter(r.communityId)) {
    if (p.roomId !== r.id) continue;
    const current = sampleMotion(communityMotionAt(p, now), oldScene, now);
    const position = walkable(scene, current.position[0], current.position[2])
      ? current.position
      : scene.spawn;
    // Cancel paths invalidated by an edit, retaining each valid location.
    ctx.db.communityCharacter.key.update({
      ...p,
      path: JSON.stringify([position]),
      startedAt: ctx.timestamp,
      seat: "",
      pose: "idle",
      yaw: current.yaw,
    });
  }
}
export const publishCommunityRoom = db.reducer(
  { roomId: t.u64(), source: t.string(), baseRevision: t.u32() },
  (ctx, a) => publishCommunityScene(ctx, a.roomId, a.source, a.baseRevision),
);
export const linkPropertyRooms = db.reducer(
  {
    fromRoomId: t.u64(),
    toRoomId: t.u64(),
    label: t.string(),
    backLabel: t.string(),
  },
  (ctx, a) => {
    const from = communityBuildRoom(ctx, a.fromRoomId),
      to = communityBuildRoom(ctx, a.toRoomId);
    requirePropertyEdit(ctx, from.propertyId);
    if (from.propertyId !== to.propertyId)
      fail(
        "Link rooms within the same property; home entrances are managed separately.",
      );
    if (from.id === to.id) fail("Choose different rooms.");
    if (
      [...ctx.db.communityExit.fromRoom.filter(from.id)].some(
        (e) => e.toRoom === to.id,
      )
    )
      fail("These rooms are already connected.");
    connectCommunityRooms(
      ctx,
      from.id,
      to.id,
      from.communityId,
      a.label,
      a.backLabel,
    );
  },
);
export const restoreCommunityRoom = db.reducer(
  { revisionId: t.u64(), baseRevision: t.u32() },
  (ctx, a) => {
    const old =
      ctx.db.communityRevision.id.find(a.revisionId) ??
      fail("Revision not found.");
    publishCommunityScene(ctx, old.roomId, old.source, a.baseRevision);
  },
);
export const myCommunities = db.view(
  { name: "my_communities", public: true },
  t.array(community.rowType),
  (ctx) =>
    [...ctx.db.community.iter()].filter((c) =>
      communityBuildAccess(ctx, c.id, ctx.sender),
    ),
);
export const communityProperties = db.view(
  { name: "community_properties", public: true },
  t.array(property.rowType),
  (ctx) =>
    [...ctx.db.property.iter()].filter((p) =>
      communityBuildAccess(ctx, p.communityId, ctx.sender),
    ),
);
export const communityRooms = db.view(
  { name: "community_rooms", public: true },
  t.array(communityRoom.rowType),
  (ctx) =>
    [...ctx.db.communityRoom.iter()].filter((r) =>
      communityBuildAccess(ctx, r.communityId, ctx.sender),
    ),
);
export const communityExits = db.view(
  { name: "community_exits", public: true },
  t.array(communityExit.rowType),
  (ctx) =>
    [...ctx.db.communityExit.iter()].filter((e) =>
      communityBuildAccess(ctx, e.communityId, ctx.sender),
    ),
);
export const communityCharacters = db.view(
  { name: "community_characters", public: true },
  t.array(communityCharacter.rowType),
  (ctx) =>
    [...ctx.db.communityCharacter.iter()].filter((p) =>
      communityBuildAccess(ctx, p.communityId, ctx.sender),
    ),
);
export const myCommunityRoles = db.view(
  { name: "my_community_roles", public: true },
  t.array(communityMember.rowType),
  (ctx) =>
    [...ctx.db.communityMember.iter()]
      .filter(
        (m) =>
          m.active &&
          !!communityBuildAccess(
            ctx,
            m.communityId,
            ctx.sender,
          )?.identity.equals(m.identity),
      )
      .map((m) => ({
        ...m,
        admin: !!communityBuildAccess(ctx, m.communityId, ctx.sender)?.admin,
      })),
);
export const communityHistory = db.view(
  { name: "community_history", public: true },
  t.array(communityRevision.rowType),
  (ctx) =>
    [...ctx.db.communityRevision.iter()].filter((r) => {
      const m = communityBuildAccess(ctx, r.communityId, ctx.sender);
      const room = ctx.db.communityRoom.id.find(r.roomId);
      const p = room && ctx.db.property.id.find(room.propertyId);
      return !!m && !!p && (p.common ? m.admin : p.owner.equals(m.identity));
    }),
);

function sceneFor(ctx: ReadCtx, roomId: bigint): SceneRoom {
  const row = ctx.db.roomScene.roomId.find(roomId);
  return row ? parseDefinition(row.source, "room") : emptyRoom();
}
function validateVisual(
  ctx: Ctx,
  roomId: bigint,
  kind: string,
  source: string,
) {
  try {
    if (kind === "avatar")
      return JSON.stringify(parseDefinition(source, "character"));
    if (kind !== "scene") fail("Unknown visual kind.");
    const scene = parseDefinition(source, "room");
    validateNavigation(scene);
    for (const placement of scene.objects)
      if (placement.objectId) {
        const obj = ctx.db.object.id.find(BigInt(placement.objectId));
        if (!obj || obj.roomId !== roomId)
          fail(
            `Placement ${placement.id}: linked object must belong to this room.`,
          );
      }
    return JSON.stringify(scene);
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}
function saveVisual(
  ctx: Ctx,
  actor: Identity,
  roomId: bigint,
  kind: string,
  source: string,
) {
  const r = getRoom(ctx, roomId);
  if (kind === "scene") requireEdit(ctx, r.zoneId, actor);
  if (!ctx.db.player.identity.find(actor)) fail("Create your character first.");
  const validated = validateVisual(ctx, roomId, kind, source);
  const key = `${actor.toHexString()}:${kind}:${kind === "avatar" ? "self" : roomId}`;
  const old = ctx.db.visualDraft.key.find(key);
  const baseRevision =
    kind === "scene"
      ? (ctx.db.roomScene.roomId.find(roomId)?.revision ?? 0)
      : (ctx.db.avatar.identity.find(actor)?.revision ?? 0);
  const row = {
    key,
    owner: actor,
    roomId,
    kind,
    source: validated,
    revision: (old?.revision ?? 0) + 1,
    baseRevision,
  };
  if (old) ctx.db.visualDraft.key.update(row);
  else ctx.db.visualDraft.insert(row);
}
export const saveVisualDraft = db.reducer(
  { roomId: t.u64(), kind: t.string(), source: t.string() },
  (ctx, a) => saveVisual(ctx, ctx.sender, a.roomId, a.kind, a.source),
);
function publishVisualFor(
  ctx: Ctx,
  actor: Identity,
  a: { key: string; revision: number },
) {
  const draft = ctx.db.visualDraft.key.find(a.key) ?? fail("Draft not found.");
  if (!draft.owner.equals(actor)) fail("This is not your draft.");
  if (draft.revision !== a.revision)
    fail("Draft changed. Preview the latest revision.");
  const source = validateVisual(ctx, draft.roomId, draft.kind, draft.source);
  if (draft.kind === "scene") {
    requireEdit(ctx, getRoom(ctx, draft.roomId).zoneId, actor);
    const old = ctx.db.roomScene.roomId.find(draft.roomId);
    if ((old?.revision ?? 0) !== draft.baseRevision)
      fail(
        "Room changed since this draft. Reload and merge before saving again.",
      );
    const row = {
      roomId: draft.roomId,
      source,
      revision: (old?.revision ?? 0) + 1,
    };
    if (old) ctx.db.roomScene.roomId.update(row);
    else ctx.db.roomScene.insert(row);
    for (const p of ctx.db.presence.roomId.filter(draft.roomId))
      ctx.db.presence.identity.delete(p.identity);
  } else {
    const old = ctx.db.avatar.identity.find(actor);
    if ((old?.revision ?? 0) !== draft.baseRevision)
      fail("Avatar changed. Reload and save again.");
    const row = {
      identity: actor,
      source,
      revision: (old?.revision ?? 0) + 1,
    };
    if (old) ctx.db.avatar.identity.update(row);
    else ctx.db.avatar.insert(row);
  }
  ctx.db.visualDraft.key.delete(a.key);
}
export const publishVisual = db.reducer(
  { key: t.string(), revision: t.u32() },
  (ctx, a) => publishVisualFor(ctx, ctx.sender, a),
);
export const moveWithinRoom = db.reducer(
  { x: t.f64(), z: t.f64(), seat: t.string(), pose: t.string() },
  (ctx, a) => {
    const p = me(ctx),
      scene = sceneFor(ctx, p.roomId),
      now = Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
    const old = ctx.db.presence.identity.find(ctx.sender);
    if (
      old &&
      Number(
        ctx.timestamp.microsSinceUnixEpoch - old.startedAt.microsSinceUnixEpoch,
      ) < 100000
    )
      fail("Please wait a moment.");
    if (
      !Number.isFinite(a.x) ||
      !Number.isFinite(a.z) ||
      a.seat.length > 40 ||
      !["idle", "wave", "talk", "stand"].includes(a.pose)
    )
      fail("Invalid movement.");
    const motion: Motion =
      old && old.roomId === p.roomId
        ? {
            path: JSON.parse(old.path),
            started: Number(old.startedAt.microsSinceUnixEpoch / 1000n),
            seat: old.seat,
            pose: old.pose,
            yaw: old.yaw,
          }
        : { path: [scene.spawn], started: now, seat: "", pose: "idle", yaw: 0 };
    const sampled = sampleMotion(motion, scene, now);
    let start = sampled.position;
    const oldSeat = scene.objects.find((o) => o.id === motion.seat);
    if (sampled.animation === "sit" && oldSeat?.seat)
      start = worldPoint(oldSeat, oldSeat.seat.approach);
    let destination: Vec3 = [a.x, 0, a.z];
    if (a.pose !== "idle") destination = start;
    if (a.seat) {
      const seat = scene.objects.find((o) => o.id === a.seat);
      if (!seat?.seat) fail("Seat not found.");
      for (const other of ctx.db.presence.roomId.filter(p.roomId))
        if (
          other.seat === a.seat &&
          !other.identity.equals(ctx.sender) &&
          ctx.db.player.identity.find(other.identity)?.online
        )
          fail("That seat is occupied.");
      destination = worldPoint(seat, seat.seat!.approach);
    }
    const path =
      route(scene, start, destination) ??
      fail("That position is blocked or unreachable.");
    const row = {
      identity: ctx.sender,
      roomId: p.roomId,
      path: JSON.stringify([start, ...path]),
      startedAt: ctx.timestamp,
      seat: a.seat,
      pose: a.pose === "stand" ? "idle" : a.pose,
      yaw: sampled.yaw,
    };
    if (old) ctx.db.presence.identity.update(row);
    else ctx.db.presence.insert(row);
  },
);
export const visibleScenes = db.view(
  { name: "visible_scenes", public: true },
  t.array(roomScene.rowType),
  (ctx) => {
    const actor = viewer(ctx),
      p = ctx.db.player.identity.find(actor);
    return [...ctx.db.roomScene.iter()].filter(
      (s) =>
        s.roomId === p?.roomId ||
        editable(ctx, ctx.db.room.id.find(s.roomId)?.zoneId ?? 0n, actor),
    );
  },
);
export const visibleAvatars = db.view(
  { name: "visible_avatars", public: true },
  t.array(avatar.rowType),
  (ctx) => {
    const actor = viewer(ctx),
      p = ctx.db.player.identity.find(actor);
    return [...ctx.db.avatar.iter()].filter(
      (a) =>
        a.identity.equals(actor) ||
        (p && ctx.db.player.identity.find(a.identity)?.roomId === p.roomId),
    );
  },
);
export const visiblePresence = db.view(
  { name: "visible_presence", public: true },
  t.array(presence.rowType),
  (ctx) => {
    const p = ctx.db.player.identity.find(viewer(ctx));
    return p ? [...ctx.db.presence.roomId.filter(p.roomId)] : [];
  },
);
export const myVisualDrafts = db.view(
  { name: "my_visual_drafts", public: true },
  t.array(visualDraft.rowType),
  (ctx) => {
    const actor = viewer(ctx);
    return [...ctx.db.visualDraft.owner.filter(actor)].filter(
      (d) =>
        d.kind === "avatar" ||
        editable(ctx, ctx.db.room.id.find(d.roomId)?.zoneId ?? 0n, actor),
    );
  },
);
export type Ctx = ReducerCtx<InferSchema<typeof db>>;
type ReadCtx = Pick<ViewCtx<InferSchema<typeof db>>, "db">;
type Obj = ReturnType<Ctx["db"]["object"]["insert"]>;
const opposite: Record<string, string> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
  up: "down",
  down: "up",
};
const delta: Record<string, number[]> = {
  north: [0, -1, 0],
  south: [0, 1, 0],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 0, 1],
  down: [0, 0, -1],
};
function fail(message: string): never {
  throw new SenderError(message);
}
function text(value: string, label: string, max: number) {
  const s = value.trim();
  if (!s || s.length > max || /[\u0000-\u0008\u000b-\u001f]/.test(s))
    fail(`${label} must be 1–${max} characters.`);
  return s;
}
function updatePlayer(ctx: Ctx, p: ReturnType<Ctx["db"]["player"]["insert"]>) {
  const old = ctx.db.player.identity.find(p.identity);
  if (old?.roomId !== p.roomId || !p.online)
    ctx.db.presence.identity.delete(p.identity);
  ctx.db.player.identity.update(p);
}
function me(ctx: Ctx) {
  return (
    ctx.db.player.identity.find(ctx.sender) ??
    fail("Create your character first.")
  );
}
function getRoom(ctx: Ctx, id: bigint) {
  return ctx.db.room.id.find(id) ?? fail("Room not found.");
}
function editable(ctx: ReadCtx, zoneId: bigint, actor: Identity) {
  const z = ctx.db.zone.id.find(zoneId);
  return (
    !!z &&
    (z.owner.equals(actor) ||
      !!ctx.db.member.key.find(`${zoneId}:${actor.toHexString()}`))
  );
}
function requireEdit(ctx: Ctx, zoneId: bigint, actor = ctx.sender) {
  if (!editable(ctx, zoneId, actor))
    fail(
      "Only this zone’s owner and collaborators can build here. Create your own zone from the Nexus.",
    );
}
function discover(ctx: Ctx, actor: Identity, roomId: bigint) {
  const key = `${actor.toHexString()}:${roomId}`;
  if (!ctx.db.discovery.key.find(key))
    ctx.db.discovery.insert({ key, owner: actor, roomId });
}
function post(
  ctx: Ctx,
  roomId: bigint,
  author: string,
  message: string,
  kind = "world",
) {
  ctx.db.chat.insert({
    id: 0n,
    roomId,
    author,
    text: message,
    kind,
    timestamp: ctx.timestamp,
  });
  const rows = [...ctx.db.chat.roomId.filter(roomId)];
  for (const row of rows.slice(0, Math.max(0, rows.length - 80)))
    ctx.db.chat.id.delete(row.id);
}
function record(ctx: Ctx, obj: Obj, event: string, result: string) {
  ctx.db.trace.insert({
    id: 0n,
    zoneId: obj.zoneId,
    objectId: obj.id,
    event,
    result: result.slice(0, 2000),
    timestamp: ctx.timestamp,
  });
  const rows = [...ctx.db.trace.zoneId.filter(obj.zoneId)];
  for (const row of rows.slice(0, Math.max(0, rows.length - 100)))
    ctx.db.trace.id.delete(row.id);
}
function cancelTimers(ctx: Ctx, id: bigint, name?: string) {
  for (const row of ctx.db.timer.objectId.filter(id))
    if (!name || row.name === name)
      ctx.db.timer.scheduledId.delete(row.scheduledId);
}
function stateValue(
  ctx: ReadCtx,
  id: bigint,
  scope: string,
  name: string,
): Scalar {
  const s = ctx.db.state.key.find(`${id}:${scope}:${name}`);
  return s ? JSON.parse(s.value) : null;
}
function keyName(v: Scalar) {
  const s = String(v);
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(s))
    fail(
      "State and event names use letters, numbers and underscores (max 40).",
    );
  return s;
}
function asId(v: Scalar) {
  if (typeof v !== "string" || !/^\d{1,20}$/.test(v))
    fail("Object and room IDs must be decimal strings.");
  return BigInt(v);
}
type ItemRow = ReturnType<Ctx["db"]["inventory"]["insert"]>;
type PlayerRow = ReturnType<Ctx["db"]["player"]["insert"]>;
type StateRow = ReturnType<Ctx["db"]["state"]["insert"]>;
type TimerRow = ReturnType<Ctx["db"]["timer"]["insert"]>;
type Execution = {
  events: number;
  states: Map<string, StateRow>;
  items: Map<string, ItemRow | null>;
  objects: Map<bigint, Obj>;
  players: Map<string, PlayerRow>;
  timers: Map<string, TimerRow>;
  commands: (() => void)[];
};
function run(
  ctx: Ctx,
  original: Obj,
  source: string,
  handler: string,
  actor: Identity,
  preview = false,
  payload = "",
  depth = 0,
  session?: Execution,
) {
  const root = !session;
  const tx: Execution = session ?? {
    events: 0,
    states: new Map(),
    items: new Map(),
    objects: new Map(),
    players: new Map(),
    timers: new Map(),
    commands: [],
  };
  if (root)
    for (const o of ctx.db.object.zoneId.filter(original.zoneId))
      for (const t of ctx.db.timer.objectId.filter(o.id))
        tx.timers.set(`${o.id}:${t.name}`, t);
  if (depth > 5 || ++tx.events > 16) fail("Event chain limit exceeded.");
  const obj = tx.objects.get(original.id) ?? original;
  const effects: string[] = [];
  const stateKey = (id: bigint, scope: string, name: string) =>
    `${id}:${scope}:${name}`;
  const read = (id: bigint, scope: string, name: string): Scalar => {
    const key = stateKey(id, scope, name),
      row = tx.states.get(key) ?? ctx.db.state.key.find(key);
    return row ? JSON.parse(row.value) : null;
  };
  const write = (id: bigint, scope: string, name: string, value: Scalar) => {
    const key = stateKey(id, scope, name),
      keys = new Set(
        [...ctx.db.state.objectId.filter(id)]
          .filter((s) => s.scope === scope)
          .map((s) => s.key),
      );
    for (const row of tx.states.values())
      if (row.objectId === id && row.scope === scope) keys.add(row.key);
    if (!keys.has(key) && keys.size >= 64) fail("Object state limit exceeded.");
    const row = {
      key,
      objectId: id,
      scope,
      name,
      value: JSON.stringify(value ?? null),
    };
    tx.states.set(key, row);
    effects.push(`set ${id}.${name} = ${String(value)}`);
    tx.commands.push(() => {
      ctx.db.state.key.find(key)
        ? ctx.db.state.key.update(row)
        : ctx.db.state.insert(row);
    });
  };
  const peer = (id: Scalar) => {
    const key = asId(id),
      other = tx.objects.get(key) ?? ctx.db.object.id.find(key);
    if (!other || other.zoneId !== obj.zoneId || !other.active)
      fail("Target must be a published object in this zone.");
    return other;
  };
  const itemKey = (id: bigint, name: string) =>
    `${actor.toHexString()}:${id}:${name}`;
  const getItem = (key: string) =>
    tx.items.has(key) ? tx.items.get(key) : ctx.db.inventory.key.find(key);
  const cancel = (name: string) => {
    tx.timers.delete(`${obj.id}:${name}`);
    tx.commands.push(() => cancelTimers(ctx, obj.id, name));
  };
  const give = (name: Scalar, amount: Scalar) => {
    const item = text(String(name), "Item name", 60),
      quantity = Number(amount ?? 1),
      key = itemKey(obj.id, item),
      old = getItem(key);
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10 ||
      (old?.quantity ?? 0) + quantity > 999
    )
      fail("Give 1–10 items; stack limit 999.");
    const keys = new Set(
      [...ctx.db.inventory.owner.filter(actor)].map((i) => i.key),
    );
    for (const [k, v] of tx.items) v ? keys.add(k) : keys.delete(k);
    if (!old && keys.size >= 100) fail("Inventory full.");
    const row = {
      key,
      owner: actor,
      objectId: obj.id,
      name: item,
      quantity: (old?.quantity ?? 0) + quantity,
    };
    tx.items.set(key, row);
    effects.push(`give ${item} × ${quantity}`);
    tx.commands.push(() => {
      ctx.db.inventory.key.find(key)
        ? ctx.db.inventory.key.update(row)
        : ctx.db.inventory.insert(row);
    });
  };
  const take = (id: bigint, name: Scalar, amount: Scalar) => {
    const key = itemKey(id, String(name)),
      old = getItem(key),
      n = Number(amount ?? 1);
    if (!old || !Number.isInteger(n) || n < 1 || old.quantity < n)
      fail("Required item is missing.");
    const row =
      old.quantity === n ? null : { ...old, quantity: old.quantity - n };
    tx.items.set(key, row);
    effects.push(`take ${name} × ${n}`);
    tx.commands.push(() => {
      row ? ctx.db.inventory.key.update(row) : ctx.db.inventory.key.delete(key);
    });
  };
  const stats = executeScript(source, handler, {
    get: (name) => read(obj.id, "shared", keyName(name)),
    set: (name, value) => write(obj.id, "shared", keyName(name), value),
    personal: (name) => read(obj.id, actor.toHexString(), keyName(name)),
    remember: (name, value) =>
      write(obj.id, actor.toHexString(), keyName(name), value),
    getOther: (id, name) => read(peer(id).id, "shared", keyName(name)),
    setOther: (id, name, value) =>
      write(peer(id).id, "shared", keyName(name), value),
    id: () => String(obj.id),
    actor: () => actor.toHexString(),
    playerName: () => ctx.db.player.identity.find(actor)?.name ?? "A traveler",
    room: () => String((tx.objects.get(obj.id) ?? obj).roomId),
    payload: () => payload,
    now: () => Number(ctx.timestamp.microsSinceUnixEpoch / 1000000n),
    say: (message) => {
      const msg = text(String(message), "Message", 1200),
        location = (tx.objects.get(obj.id) ?? obj).roomId;
      effects.push(msg);
      tx.commands.push(() => post(ctx, location, obj.name, msg));
    },
    signal: (id, event) => {
      const other = peer(id),
        v = ctx.db.version.id.find(other.versionId);
      if (v)
        effects.push(
          ...run(
            ctx,
            other,
            v.source,
            `on_${keyName(event)}`,
            actor,
            preview,
            "",
            depth + 1,
            tx,
          ).effects,
        );
    },
    schedule: (name, seconds, data, repeat) => {
      const event = keyName(name),
        delay = Number(seconds),
        interval = Number(repeat ?? 0),
        body = data == null ? "" : String(data);
      if (
        !Number.isInteger(delay) ||
        delay < 1 ||
        delay > 604800 ||
        !Number.isInteger(interval) ||
        interval < 0 ||
        interval > 604800
      )
        fail("Timers require 1–604800 seconds; repeat is 0 or 1–604800.");
      if (body.length > 512) fail("Timer payload too large.");
      cancel(event);
      if (
        [...tx.timers.values()].filter((t) => t.objectId === obj.id).length >=
          8 ||
        tx.timers.size >= 64
      )
        fail("Timer limit: eight per object, 64 per zone.");
      const row = {
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(
          ctx.timestamp.microsSinceUnixEpoch + BigInt(delay) * 1000000n,
        ),
        objectId: obj.id,
        versionId: obj.versionId,
        name: event,
        payload: body,
        actor,
        repeatSeconds: interval,
      };
      tx.timers.set(`${obj.id}:${event}`, row);
      tx.commands.push(() => {
        ctx.db.timer.insert(row);
      });
      effects.push(
        `timer ${event} in ${delay}s${interval ? `, every ${interval}s` : ""}`,
      );
    },
    cancel: (name) => {
      const event = keyName(name);
      cancel(event);
      effects.push(`cancel ${event}`);
    },
    give,
    has: (name) => !!getItem(itemKey(obj.id, String(name)))?.quantity,
    take: (name, amount) => take(obj.id, name, amount),
    hasFrom: (id, name) =>
      !!getItem(itemKey(peer(id).id, String(name)))?.quantity,
    takeFrom: (id, name, amount) => take(peer(id).id, name, amount),
    moveObject: (id, destination) => {
      const other = peer(id),
        r = getRoom(ctx, asId(destination));
      if (r.zoneId !== obj.zoneId)
        fail("Objects may move only within their own zone.");
      const next = { ...other, roomId: r.id };
      tx.objects.set(other.id, next);
      tx.commands.push(() => {
        ctx.db.object.id.update(next);
      });
      effects.push(`move ${other.name} to ${r.name}`);
    },
    movePlayer: (destination) => {
      const p =
          tx.players.get(actor.toHexString()) ??
          ctx.db.player.identity.find(actor),
        r = getRoom(ctx, asId(destination));
      if (
        !p ||
        p.roomId !== (tx.objects.get(obj.id) ?? obj).roomId ||
        (r.zoneId !== obj.zoneId &&
          r.id !== 1n &&
          !(
            obj.roomId === 1n &&
            obj.zoneId === 1n &&
            ctx.db.zone.id.find(r.zoneId)?.entrance === r.id
          ))
      )
        fail(
          "Player must be here; destination must be in this zone, the Nexus, or a zone entrance reached from the Nexus.",
        );
      const next = { ...p, roomId: r.id };
      tx.players.set(actor.toHexString(), next);
      tx.commands.push(() => {
        updatePlayer(ctx, next);
        discover(ctx, actor, r.id);
      });
      effects.push(`move player to ${r.name}`);
    },
  });
  // No database effects occur until the complete bounded event chain succeeds.
  // Preview uses exactly the same overlay and validation, discarding the plan.
  if (root && !preview) for (const apply of tx.commands) apply();
  return { effects, stats };
}
function invoke(ctx: Ctx, obj: Obj, event: string, actor: Identity) {
  if (!obj.active) return;
  const v = ctx.db.version.id.find(obj.versionId);
  if (!v) return;
  try {
    const result = run(ctx, obj, v.source, event, actor);
    record(
      ctx,
      obj,
      event,
      `${result.stats.steps} steps\n${result.effects.join("\n")}`,
    );
  } catch (e) {
    fail(`${obj.name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
function roomEvent(ctx: Ctx, roomId: bigint, event: string, actor: Identity) {
  for (const obj of ctx.db.object.roomId.filter(roomId))
    invoke(ctx, obj, event, actor);
}
function validateActions(actions: { id: string; label: string }[]) {
  if (actions.length > 8) fail("Eight actions maximum.");
  const ids = new Set<string>();
  for (const a of actions) {
    keyName(a.id);
    text(a.label, "Action label", 40);
    if (ids.has(a.id)) fail("Duplicate action.");
    ids.add(a.id);
  }
}
function draft(
  ctx: Ctx,
  actor: Identity,
  roomId: bigint,
  objectId: bigint,
  kind: string,
  name: string,
  description: string,
  actions: { id: string; label: string }[],
  source: string,
) {
  const r = getRoom(ctx, roomId);
  requireEdit(ctx, r.zoneId, actor);
  validateActions(actions);
  name = text(name, "Name", 80);
  description = text(description, "Description", 2000);
  source = text(source, "Script", 16000);
  if (
    !["scenery", "item", "container", "character", "exit", "room"].includes(
      kind,
    )
  )
    fail("Unknown object type.");
  let obj = objectId ? ctx.db.object.id.find(objectId) : undefined;
  if (objectId && (!obj || obj.zoneId !== r.zoneId))
    fail("Object not found in this zone.");
  if (!obj) {
    if ([...ctx.db.object.zoneId.filter(r.zoneId)].length >= 100)
      fail("Zone object limit reached.");
    obj = ctx.db.object.insert({
      id: 0n,
      zoneId: r.zoneId,
      roomId,
      owner: actor,
      kind,
      name,
      description,
      actions: [],
      versionId: 0n,
      active: false,
    });
  }
  if ([...ctx.db.version.objectId.filter(obj.id)].length >= 50)
    fail("Object version limit (50) reached.");
  return ctx.db.version.insert({
    id: 0n,
    objectId: obj.id,
    author: actor,
    name,
    description,
    actions,
    source,
    tested: false,
    report: "Not tested yet.",
    createdAt: ctx.timestamp,
  });
}
function createRoom(
  ctx: Ctx,
  actor: Identity,
  sourceId: bigint,
  direction: string,
  name: string,
  description: string,
) {
  const source = getRoom(ctx, sourceId);
  requireEdit(ctx, source.zoneId, actor);
  if (!opposite[direction]) fail("Choose a cardinal direction or up/down.");
  if (source.exits.some((e) => e.direction === direction))
    fail("That direction is occupied.");
  if ([...ctx.db.room.zoneId.filter(source.zoneId)].length >= 100)
    fail("Zone room limit reached.");
  const [dx, dy, df] = delta[direction];
  const x = source.x + dx,
    y = source.y + dy,
    floor = source.floor + df;
  if (
    [...ctx.db.room.zoneId.filter(source.zoneId)].some(
      (r) => r.x === x && r.y === y && r.floor === floor,
    )
  )
    fail("A room occupies that map position; use Link rooms.");
  const next = ctx.db.room.insert({
    id: 0n,
    zoneId: source.zoneId,
    name: text(name, "Room name", 80),
    description: text(description, "Description", 3000),
    exits: [
      {
        direction: opposite[direction],
        destination: source.id,
        gateId: 0n,
        secret: false,
      },
    ],
    creator: actor,
    x,
    y,
    floor,
  });
  ctx.db.room.id.update({
    ...source,
    exits: [
      ...source.exits,
      { direction, destination: next.id, gateId: 0n, secret: false },
    ],
  });
  return next;
}
export const init = db.init((ctx) => {
  seedWorld(ctx);
  ctx.db.communityAuthority.insert({ key: "operator", identity: ctx.sender });
});
export const onConnect = db.clientConnected((ctx) => {
  if (ctx.connectionId)
    ctx.db.connection.insert({ id: ctx.connectionId, identity: ctx.sender });
  const p = ctx.db.player.identity.find(ctx.sender);
  if (p) updatePlayer(ctx, { ...p, online: true });
});
export const onDisconnect = db.clientDisconnected((ctx) => {
  leaveCommunitySession(ctx);
  if (ctx.connectionId) ctx.db.connection.id.delete(ctx.connectionId);
  if (![...ctx.db.connection.identity.filter(ctx.sender)].length) {
    const p = ctx.db.player.identity.find(ctx.sender);
    if (p) updatePlayer(ctx, { ...p, online: false });
  }
});
export const createPlayer = db.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    if (ctx.db.player.identity.find(ctx.sender))
      fail("You already have a character.");
    name = text(name, "Name", 24);
    if (!/^[a-zA-Z][a-zA-Z0-9 _-]{1,23}$/.test(name))
      fail("Use 2–24 letters, numbers, spaces, underscores or hyphens.");
    const nameKey = name.toLowerCase();
    if (
      ["nexus", "system"].includes(nameKey) ||
      ctx.db.player.nameKey.find(nameKey)
    )
      fail("That name is unavailable.");
    ctx.db.player.insert({
      identity: ctx.sender,
      name,
      nameKey,
      roomId: 1n,
      online: true,
    });
    discover(ctx, ctx.sender, 1n);
  },
);
export const go = db.reducer(
  { direction: t.string() },
  (ctx, { direction }) => {
    const p = me(ctx),
      r = getRoom(ctx, p.roomId),
      exit = r.exits.find((e) => e.direction === direction);
    if (!exit) fail("No passage that way.");
    if (
      exit.secret &&
      !stateValue(ctx, exit.gateId, p.identity.toHexString(), "discovered")
    )
      fail("No passage that way.");
    if (exit.gateId && stateValue(ctx, exit.gateId, "shared", "open") !== true)
      fail("The gate is closed.");
    roomEvent(ctx, r.id, "on_leave", p.identity);
    updatePlayer(ctx, { ...p, roomId: exit.destination });
    discover(ctx, p.identity, exit.destination);
    roomEvent(ctx, exit.destination, "on_enter", p.identity);
    post(ctx, exit.destination, p.name, "arrives.", "presence");
  },
);
export const home = db.reducer((ctx) => {
  const p = me(ctx);
  // Always provide an escape from a broken or hostile zone script.
  updatePlayer(ctx, { ...p, roomId: 1n });
  discover(ctx, p.identity, 1n);
});
export const visitZone = db.reducer({ zoneId: t.u64() }, (ctx, { zoneId }) => {
  const p = me(ctx);
  if (p.roomId !== 1n) fail("Return to the Nexus to use its portals.");
  const z = ctx.db.zone.id.find(zoneId) ?? fail("Zone not found.");
  updatePlayer(ctx, { ...p, roomId: z.entrance });
  discover(ctx, p.identity, z.entrance);
  roomEvent(ctx, z.entrance, "on_enter", p.identity);
});
function createZoneFor(
  ctx: Ctx,
  actor: Identity,
  name: string,
  description: string,
) {
  const p = ctx.db.player.identity.find(actor) ?? fail("Player not found.");
  if ([...ctx.db.zone.iter()].filter((z) => z.owner.equals(actor)).length >= 5)
    fail("Five zones per builder maximum.");
  const z = ctx.db.zone.insert({
    id: 0n,
    name: text(name, "Zone name", 80),
    owner: actor,
    entrance: 0n,
  });
  const r = ctx.db.room.insert({
    id: 0n,
    zoneId: z.id,
    name: z.name,
    description: text(description, "Description", 3000),
    exits: [],
    creator: actor,
    x: 0,
    y: 0,
    floor: 0,
  });
  ctx.db.zone.id.update({ ...z, entrance: r.id });
  updatePlayer(ctx, { ...p, roomId: r.id });
  discover(ctx, p.identity, r.id);
  return r;
}
export const createZone = db.reducer(
  { name: t.string(), description: t.string() },
  (ctx, a) => {
    createZoneFor(ctx, ctx.sender, a.name, a.description);
  },
);
export const setCollaborator = db.reducer(
  { zoneId: t.u64(), name: t.string(), allowed: t.bool() },
  (ctx, { zoneId, name, allowed }) => {
    const z = ctx.db.zone.id.find(zoneId);
    if (!z?.owner.equals(ctx.sender))
      fail("Only the zone owner can change collaborators.");
    const p =
      ctx.db.player.nameKey.find(name.toLowerCase().trim()) ??
      fail("Player not found.");
    const key = `${zoneId}:${p.identity.toHexString()}`;
    if (allowed && !ctx.db.member.key.find(key))
      ctx.db.member.insert({ key, zoneId, identity: p.identity });
    if (!allowed) ctx.db.member.key.delete(key);
  },
);
export const buildRoom = db.reducer(
  { direction: t.string(), name: t.string(), description: t.string() },
  (ctx, a) =>
    createRoom(
      ctx,
      ctx.sender,
      me(ctx).roomId,
      a.direction,
      a.name,
      a.description,
    ),
);
export const layoutRoom = db.reducer(
  { roomId: t.u64(), x: t.i32(), y: t.i32(), floor: t.i32() },
  (ctx, a) => {
    const r = getRoom(ctx, a.roomId);
    requireEdit(ctx, r.zoneId);
    if (Math.abs(a.x) > 100 || Math.abs(a.y) > 100 || Math.abs(a.floor) > 20)
      fail("Map coordinates out of range.");
    if (
      [...ctx.db.room.zoneId.filter(r.zoneId)].some(
        (o) =>
          o.id !== r.id && o.x === a.x && o.y === a.y && o.floor === a.floor,
      )
    )
      fail("Map position occupied.");
    ctx.db.room.id.update({ ...r, x: a.x, y: a.y, floor: a.floor });
  },
);
export const linkRooms = db.reducer(
  {
    source: t.u64(),
    destination: t.u64(),
    direction: t.string(),
    gateId: t.u64(),
    secret: t.bool(),
  },
  (ctx, a) => {
    if (a.secret && !a.gateId)
      fail("A secret passage needs a gate object to store discovery.");
    const s = getRoom(ctx, a.source),
      d = getRoom(ctx, a.destination);
    requireEdit(ctx, s.zoneId);
    requireEdit(ctx, d.zoneId);
    if (!opposite[a.direction] || s.id === d.id) fail("Invalid connection.");
    if (
      s.exits.some((e) => e.direction === a.direction) ||
      d.exits.some((e) => e.direction === opposite[a.direction])
    )
      fail("Direction occupied.");
    if (a.gateId) {
      const gate = ctx.db.object.id.find(a.gateId);
      if (!gate || gate.zoneId !== s.zoneId || d.zoneId !== s.zoneId)
        fail("Gate must belong to the same zone.");
    }
    ctx.db.room.id.update({
      ...s,
      exits: [
        ...s.exits,
        {
          direction: a.direction,
          destination: d.id,
          gateId: a.gateId,
          secret: a.secret,
        },
      ],
    });
    ctx.db.room.id.update({
      ...d,
      exits: [
        ...d.exits,
        {
          direction: opposite[a.direction],
          destination: s.id,
          gateId: a.gateId,
          secret: a.secret,
        },
      ],
    });
  },
);
export const configurePassage = db.reducer(
  { roomId: t.u64(), direction: t.string(), gateId: t.u64(), secret: t.bool() },
  (ctx, a) => {
    const r = getRoom(ctx, a.roomId),
      exit =
        r.exits.find((e) => e.direction === a.direction) ??
        fail("Passage not found.");
    const destination = getRoom(ctx, exit.destination);
    requireEdit(ctx, r.zoneId);
    requireEdit(ctx, destination.zoneId);
    if (a.secret && !a.gateId) fail("A secret passage needs a gate object.");
    if (a.gateId) {
      const gate = ctx.db.object.id.find(a.gateId);
      if (!gate || gate.zoneId !== r.zoneId || destination.zoneId !== r.zoneId)
        fail("Gate must be in the same zone as both rooms.");
    }
    ctx.db.room.id.update({
      ...r,
      exits: r.exits.map((e) =>
        e === exit ? { ...e, gateId: a.gateId, secret: a.secret } : e,
      ),
    });
    ctx.db.room.id.update({
      ...destination,
      exits: destination.exits.map((e) =>
        e.destination === r.id && e.direction === opposite[a.direction]
          ? { ...e, gateId: a.gateId, secret: a.secret }
          : e,
      ),
    });
  },
);
export const saveDraft = db.reducer(
  {
    roomId: t.u64(),
    objectId: t.u64(),
    kind: t.string(),
    name: t.string(),
    description: t.string(),
    actions: t.array(Action),
    source: t.string(),
  },
  (ctx, a) => {
    me(ctx);
    draft(
      ctx,
      ctx.sender,
      a.roomId,
      a.objectId,
      a.kind,
      a.name,
      a.description,
      a.actions,
      a.source,
    );
  },
);
function testVersionFor(
  ctx: Ctx,
  actor: Identity,
  versionId: bigint,
  event: string,
) {
  const v = ctx.db.version.id.find(versionId) ?? fail("Draft not found."),
    obj = ctx.db.object.id.find(v.objectId) ?? fail("Object not found.");
  requireEdit(ctx, obj.zoneId, actor);
  try {
    if (
      !/^on_[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(event) ||
      !new RegExp(`function\\s+${event}\\s*\\(`).test(v.source)
    )
      fail("Choose a handler declared in the saved script.");
    const result = run(
      ctx,
      { ...obj, versionId: v.id },
      v.source,
      event,
      actor,
      true,
    );
    ctx.db.version.id.update({
      ...v,
      tested: true,
      report: `PASS ${event}: ${result.stats.steps} steps\n${result.effects.join("\n") || "No effects."}`,
    });
  } catch (e) {
    ctx.db.version.id.update({
      ...v,
      tested: false,
      report: `FAIL ${event}: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
export const testDraft = db.reducer(
  { versionId: t.u64(), event: t.string() },
  (ctx, a) => testVersionFor(ctx, ctx.sender, a.versionId, a.event),
);
function publishVersionFor(ctx: Ctx, actor: Identity, versionId: bigint) {
  const v = ctx.db.version.id.find(versionId) ?? fail("Version not found."),
    obj = ctx.db.object.id.find(v.objectId) ?? fail("Object not found.");
  requireEdit(ctx, obj.zoneId, actor);
  if (!v.tested) fail("Test the draft before publishing.");
  for (const a of v.actions)
    if (!new RegExp(`function\\s+on_${a.id}\\s*\\(`).test(v.source))
      fail(`Missing on_${a.id} handler.`);
  cancelTimers(ctx, obj.id);
  ctx.db.object.id.update({
    ...obj,
    name: v.name,
    description: v.description,
    actions: v.actions,
    versionId: v.id,
    active: true,
  });
  record(
    ctx,
    obj,
    "publish",
    `Published version ${v.id}; previous timers cancelled. Persistent state and inventory preserved.`,
  );
}
export const publishVersion = db.reducer({ versionId: t.u64() }, (ctx, a) =>
  publishVersionFor(ctx, ctx.sender, a.versionId),
);
export const deleteObject = db.reducer(
  { objectId: t.u64() },
  (ctx, { objectId }) => {
    const obj = ctx.db.object.id.find(objectId) ?? fail("Object not found.");
    requireEdit(ctx, obj.zoneId);
    for (const r of ctx.db.room.iter())
      if (r.exits.some((e) => e.gateId === objectId))
        fail("This object controls a passage and cannot be deleted.");
    cancelTimers(ctx, obj.id);
    for (const v of ctx.db.version.objectId.filter(obj.id))
      ctx.db.version.id.delete(v.id);
    for (const s of ctx.db.state.objectId.filter(obj.id))
      ctx.db.state.key.delete(s.key);
    ctx.db.object.id.delete(obj.id);
  },
);
// Destructive cleanup is restricted to zone owners, including delegated agents.
function ownedZone(ctx: Ctx, actor: Identity, zoneId: bigint) {
  const z = ctx.db.zone.id.find(zoneId) ?? fail("Zone not found.");
  if (z.id === 1n) fail("The Nexus is protected.");
  if (!z.owner.equals(actor))
    fail("Only the zone owner can delete rooms or zones.");
  return z;
}
function removeRooms(
  ctx: Ctx,
  ids: Set<bigint>,
  fallback: bigint,
  zoneId?: bigint,
) {
  getRoom(ctx, fallback);
  const objects = [...ctx.db.object.iter()].filter(
    (o) => ids.has(o.roomId) || o.zoneId === zoneId,
  );
  const objectIds = new Set(objects.map((o) => o.id));
  for (const p of [...ctx.db.player.iter()])
    if (ids.has(p.roomId)) {
      updatePlayer(ctx, { ...p, roomId: fallback });
      discover(ctx, p.identity, fallback);
    }
  for (const r of [...ctx.db.room.iter()]) {
    if (ids.has(r.id)) continue;
    const exits = r.exits.filter(
      (e) => !ids.has(e.destination) && !objectIds.has(e.gateId),
    );
    if (exits.length !== r.exits.length) ctx.db.room.id.update({ ...r, exits });
  }
  for (const o of objects) {
    cancelTimers(ctx, o.id);
    for (const v of [...ctx.db.version.objectId.filter(o.id)])
      ctx.db.version.id.delete(v.id);
    for (const s of [...ctx.db.state.objectId.filter(o.id)])
      ctx.db.state.key.delete(s.key);
    ctx.db.object.id.delete(o.id);
  }
  for (const i of [...ctx.db.inventory.iter()])
    if (objectIds.has(i.objectId)) ctx.db.inventory.key.delete(i.key);
  for (const t of [...ctx.db.trace.iter()])
    if (objectIds.has(t.objectId) || t.zoneId === zoneId)
      ctx.db.trace.id.delete(t.id);
  for (const d of [...ctx.db.discovery.iter()])
    if (ids.has(d.roomId)) ctx.db.discovery.key.delete(d.key);
  for (const j of [...ctx.db.job.iter()])
    if (ids.has(j.roomId) || objectIds.has(j.npcId)) ctx.db.job.id.delete(j.id);
  // Objects can have moved since geometry was authored. Remove dangling visual links.
  const unlink = (source: string) => {
    const scene = JSON.parse(source) as SceneRoom;
    let changed = false;
    for (const o of scene.objects)
      if (o.objectId && objectIds.has(BigInt(o.objectId))) {
        delete o.objectId;
        changed = true;
      }
    return changed ? JSON.stringify(scene) : source;
  };
  for (const s of [...ctx.db.roomScene.iter()]) {
    if (ids.has(s.roomId)) ctx.db.roomScene.roomId.delete(s.roomId);
    else {
      const source = unlink(s.source);
      if (source !== s.source)
        ctx.db.roomScene.roomId.update({
          ...s,
          source,
          revision: s.revision + 1,
        });
    }
  }
  for (const d of [...ctx.db.visualDraft.iter()]) {
    if (d.kind === "avatar") {
      if (ids.has(d.roomId))
        ctx.db.visualDraft.key.update({ ...d, roomId: fallback });
    } else if (ids.has(d.roomId)) ctx.db.visualDraft.key.delete(d.key);
    else {
      const source = unlink(d.source);
      if (source !== d.source)
        ctx.db.visualDraft.key.update({
          ...d,
          source,
          revision: d.revision + 1,
        });
    }
  }
  for (const id of ids) {
    for (const p of [...ctx.db.presence.roomId.filter(id)])
      ctx.db.presence.identity.delete(p.identity);
    for (const c of [...ctx.db.chat.roomId.filter(id)])
      ctx.db.chat.id.delete(c.id);
    ctx.db.room.id.delete(id);
  }
}
function deleteRoomFor(ctx: Ctx, actor: Identity, roomId: bigint) {
  const r = getRoom(ctx, roomId),
    z = ownedZone(ctx, actor, r.zoneId);
  if (z.entrance === roomId)
    fail(
      "This is the zone entrance. Delete the zone to remove it and all its rooms.",
    );
  removeRooms(ctx, new Set([roomId]), z.entrance);
}
function deleteZoneFor(ctx: Ctx, actor: Identity, zoneId: bigint) {
  const z = ownedZone(ctx, actor, zoneId);
  removeRooms(
    ctx,
    new Set([...ctx.db.room.zoneId.filter(z.id)].map((r) => r.id)),
    1n,
    z.id,
  );
  for (const m of [...ctx.db.member.zoneId.filter(z.id)])
    ctx.db.member.key.delete(m.key);
  ctx.db.zone.id.delete(z.id);
}
export const deleteRoom = db.reducer({ roomId: t.u64() }, (ctx, a) =>
  deleteRoomFor(ctx, ctx.sender, a.roomId),
);
export const deleteZone = db.reducer({ zoneId: t.u64() }, (ctx, a) =>
  deleteZoneFor(ctx, ctx.sender, a.zoneId),
);
// Operator maintenance only: not exposed through the delegated building API.
export const pruneUnauthoredZone = db.reducer({ zoneId: t.u64() }, (ctx, a) => {
  const operator = ctx.db.zone.id.find(1n)?.owner;
  if (!operator?.equals(ctx.sender))
    fail("Only the world operator can prune legacy zones.");
  const z = ctx.db.zone.id.find(a.zoneId) ?? fail("Zone not found.");
  if (z.id === 1n) fail("The Nexus is protected.");
  const ids = new Set([...ctx.db.room.zoneId.filter(z.id)].map((r) => r.id));
  if (
    [...ctx.db.roomScene.iter()].some((s) => ids.has(s.roomId)) ||
    [...ctx.db.visualDraft.iter()].some(
      (d) => d.kind === "scene" && ids.has(d.roomId),
    )
  )
    fail("Zone contains published or draft 3D work; it cannot be pruned.");
  deleteZoneFor(ctx, z.owner, z.id);
});
// World-operator maintenance for arranging the shared showcase.
export const stackZones = db.reducer(
  { lowerZoneId: t.u64(), upperZoneId: t.u64(), name: t.string() },
  (ctx, a) => {
    if (!ctx.db.zone.id.find(1n)?.owner.equals(ctx.sender))
      fail("World operator only.");
    if (
      a.lowerZoneId === 1n ||
      a.upperZoneId === 1n ||
      a.lowerZoneId === a.upperZoneId
    )
      fail("Choose two different non-Nexus zones.");
    const lower =
      ctx.db.zone.id.find(a.lowerZoneId) ?? fail("Lower zone not found.");
    const upper =
      ctx.db.zone.id.find(a.upperZoneId) ?? fail("Upper zone not found.");
    const lowerRooms = [...ctx.db.room.zoneId.filter(lower.id)],
      upperRooms = [...ctx.db.room.zoneId.filter(upper.id)];
    if (lowerRooms.length !== 1 || upperRooms.length !== 1)
      fail("Each zone must contain exactly one room.");
    const bottom = lowerRooms[0],
      top = upperRooms[0];
    if (
      bottom.exits.some((e) => e.direction === "up") ||
      top.exits.some((e) => e.direction === "down")
    )
      fail("Vertical passage already occupied.");
    ctx.db.room.id.update({
      ...bottom,
      zoneId: upper.id,
      x: 0,
      y: 0,
      floor: 0,
      exits: [
        ...bottom.exits,
        { direction: "up", destination: top.id, gateId: 0n, secret: false },
      ],
    });
    ctx.db.room.id.update({
      ...top,
      x: 0,
      y: 0,
      floor: 1,
      exits: [
        ...top.exits,
        {
          direction: "down",
          destination: bottom.id,
          gateId: 0n,
          secret: false,
        },
      ],
    });
    for (const o of [...ctx.db.object.zoneId.filter(lower.id)])
      ctx.db.object.id.update({ ...o, zoneId: upper.id });
    for (const t of [...ctx.db.trace.zoneId.filter(lower.id)])
      ctx.db.trace.id.update({ ...t, zoneId: upper.id });
    const collaborators = [
      lower.owner,
      ...[...ctx.db.member.zoneId.filter(lower.id)].map((m) => m.identity),
    ];
    for (const identity of collaborators) {
      const key = `${upper.id}:${identity.toHexString()}`;
      if (!identity.equals(upper.owner) && !ctx.db.member.key.find(key))
        ctx.db.member.insert({ key, zoneId: upper.id, identity });
    }
    for (const m of [...ctx.db.member.zoneId.filter(lower.id)])
      ctx.db.member.key.delete(m.key);
    ctx.db.zone.id.update({
      ...upper,
      name: text(a.name, "Zone name", 80),
      entrance: bottom.id,
    });
    ctx.db.zone.id.delete(lower.id);
  },
);
export const removeTestZone = db.reducer({ zoneId: t.u64() }, (ctx, a) => {
  if (!ctx.db.zone.id.find(1n)?.owner.equals(ctx.sender))
    fail("World operator only.");
  const z = ctx.db.zone.id.find(a.zoneId) ?? fail("Zone not found.");
  if (!z.name.startsWith("Agent Atelier "))
    fail("Not an Agent Atelier test zone.");
  deleteZoneFor(ctx, z.owner, z.id);
});
export const interact = db.reducer(
  { objectId: t.u64(), action: t.string(), requestId: t.string() },
  (ctx, { objectId, action, requestId }) => {
    const p = me(ctx),
      obj = ctx.db.object.id.find(objectId) ?? fail("Object not found.");
    if (
      !obj.active ||
      obj.roomId !== p.roomId ||
      !obj.actions.some((a) => a.id === action)
    )
      fail("That action is not available here.");
    const key = `${ctx.sender.toHexString()}:${text(requestId, "Request ID", 80)}`;
    if (ctx.db.request.key.find(key)) return;
    const recent = [...ctx.db.request.owner.filter(ctx.sender)];
    if (
      recent.some(
        (r) =>
          ctx.timestamp.microsSinceUnixEpoch -
            r.timestamp.microsSinceUnixEpoch <
          250000n,
      )
    )
      fail("Please wait a moment between actions.");
    invoke(ctx, obj, `on_${action}`, ctx.sender);
    ctx.db.request.insert({ key, owner: ctx.sender, timestamp: ctx.timestamp });
    for (const old of recent.slice(0, Math.max(0, recent.length - 99)))
      ctx.db.request.key.delete(old.key);
  },
);
export const fireTimer = db.reducer(
  { onSchedule: timer },
  { timer: timer.rowType },
  (ctx, { timer: t }) => {
    if (!ctx.sender.equals(ctx.identity) || ctx.connectionId)
      fail("Only the scheduler may fire timers.");
    const current = ctx.db.timer.scheduledId.find(t.scheduledId),
      obj = ctx.db.object.id.find(t.objectId);
    if (!current || !obj?.active || obj.versionId !== t.versionId) return;
    const v = ctx.db.version.id.find(t.versionId);
    if (!v) return;
    try {
      const result = run(
        ctx,
        obj,
        v.source,
        `on_${t.name}`,
        t.actor,
        false,
        t.payload,
      );
      record(
        ctx,
        obj,
        `on_${t.name}`,
        result.effects.join("\n") || "Timer completed.",
      );
    } catch (e) {
      record(
        ctx,
        obj,
        `on_${t.name}`,
        `FAILED: ${e instanceof Error ? e.message : String(e)}`,
      );
      return;
    }
    if (t.repeatSeconds && ctx.db.timer.scheduledId.find(t.scheduledId)) {
      ctx.db.timer.insert({
        ...t,
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(
          ctx.timestamp.microsSinceUnixEpoch +
            BigInt(t.repeatSeconds) * 1000000n,
        ),
      });
    }
  },
);
export const say = db.reducer({ message: t.string() }, (ctx, { message }) => {
  const p = me(ctx);
  post(ctx, p.roomId, p.name, text(message, "Message", 1000), "say");
});
export const tell = db.reducer(
  { target: t.string(), message: t.string() },
  (ctx, { target, message }) => {
    const p = me(ctx),
      recipient =
        ctx.db.player.nameKey.find(target.toLowerCase().trim()) ??
        fail("Player not found.");
    for (const owner of [p.identity, recipient.identity]) {
      ctx.db.inbox.insert({
        id: 0n,
        owner,
        author: p.name,
        text: text(message, "Message", 1000),
        timestamp: ctx.timestamp,
      });
      const rows = [...ctx.db.inbox.owner.filter(owner)];
      for (const old of rows.slice(0, Math.max(0, rows.length - 60)))
        ctx.db.inbox.id.delete(old.id);
    }
  },
);
export const consent = db.reducer(
  { bridge: t.identity() },
  (ctx, { bridge }) => {
    me(ctx);
    if (ctx.db.player.identity.find(bridge))
      fail("Pair a separate agent connection, not another player's identity.");
    if (
      bridge.equals(ctx.sender) ||
      ![...ctx.db.connection.identity.filter(bridge)].length
    )
      fail("Connect your agent?s MCP server before pairing.");
    const other = ctx.db.grant.bridge.find(bridge);
    if (other && !other.owner.equals(ctx.sender))
      fail("This agent connection is already paired.");
    cancelJobs(ctx);
    const row = { owner: ctx.sender, bridge, createdAt: ctx.timestamp };
    ctx.db.grant.owner.find(ctx.sender)
      ? ctx.db.grant.owner.update(row)
      : ctx.db.grant.insert(row);
  },
);
function cancelJobs(ctx: Ctx) {
  for (const j of ctx.db.job.owner.filter(ctx.sender))
    if (["pending", "working"].includes(j.status))
      ctx.db.job.id.update({
        ...j,
        status: "cancelled",
        result: "Consent changed or revoked.",
      });
}
export const revokeConsent = db.reducer((ctx) => {
  ctx.db.grant.owner.delete(ctx.sender);
  cancelJobs(ctx);
});
// Provider-neutral building API. The authenticated agent acts only for its paired player.
// Paired agents can publish within the player's existing editing permissions.
export const agentBuild = db.reducer(
  { operation: t.string(), roomId: t.u64(), payload: t.string() },
  (ctx, a) => {
    const grant =
      ctx.db.grant.bridge.find(ctx.sender) ??
      fail("Pair this agent in the game first.");
    const actor = grant.owner;
    if (a.payload.length > 510000) fail("Payload too large.");
    let v: Record<string, any>;
    try {
      v = JSON.parse(a.payload);
      if (!v || typeof v !== "object" || Array.isArray(v))
        fail("Expected an object.");
    } catch {
      fail("Invalid payload.");
    }
    const field = (key: string, max = 3000) =>
      text(typeof v[key] === "string" ? v[key] : "", key, max);
    if (a.operation === "create_zone") {
      createZoneFor(ctx, actor, field("name", 80), field("description"));
    } else if (a.operation === "create_room") {
      createRoom(
        ctx,
        actor,
        a.roomId,
        field("direction", 10),
        field("name", 80),
        field("description"),
      );
    } else if (a.operation === "save_visual") {
      saveVisual(
        ctx,
        actor,
        a.roomId,
        field("kind", 10),
        typeof v.source === "string" ? v.source : fail("Source required."),
      );
    } else if (a.operation === "save_object") {
      const actions = v.actions;
      if (
        !Array.isArray(actions) ||
        actions.length > 8 ||
        actions.some(
          (x) => !x || typeof x.id !== "string" || typeof x.label !== "string",
        )
      )
        fail("Invalid actions.");
      draft(
        ctx,
        actor,
        a.roomId,
        v.objectId ? asId(field("objectId", 20)) : 0n,
        field("kind", 20),
        field("name", 80),
        field("description", 2000),
        actions,
        typeof v.source === "string" ? v.source : fail("Source required."),
      );
    } else if (a.operation === "test_object") {
      testVersionFor(
        ctx,
        actor,
        asId(field("versionId", 20)),
        field("event", 43),
      );
    } else if (a.operation === "publish_visual") {
      if (
        !Number.isInteger(v.revision) ||
        v.revision < 1 ||
        v.revision > 4294967295
      )
        fail("Invalid draft revision.");
      publishVisualFor(ctx, actor, {
        key: field("key", 120),
        revision: v.revision,
      });
    } else if (a.operation === "publish_object") {
      publishVersionFor(ctx, actor, asId(field("versionId", 20)));
    } else if (a.operation === "delete_room") {
      deleteRoomFor(ctx, actor, a.roomId);
    } else if (a.operation === "delete_zone") {
      deleteZoneFor(ctx, actor, asId(field("zoneId", 20)));
    } else fail("Unsupported building operation.");
  },
);
export const discardVisual = db.reducer(
  { key: t.string(), revision: t.u32() },
  (ctx, a) => {
    const d = ctx.db.visualDraft.key.find(a.key) ?? fail("Draft not found.");
    if (!d.owner.equals(ctx.sender) || d.revision !== a.revision)
      fail("Draft changed or belongs to another player.");
    ctx.db.visualDraft.key.delete(d.key);
  },
);
export const discardBehavior = db.reducer({ versionId: t.u64() }, (ctx, a) => {
  const v = ctx.db.version.id.find(a.versionId) ?? fail("Draft not found.");
  const obj = ctx.db.object.id.find(v.objectId) ?? fail("Object not found.");
  requireEdit(ctx, obj.zoneId);
  if (!v.author.equals(ctx.sender) || v.id <= obj.versionId)
    fail("Only your unpublished draft can be discarded.");
  ctx.db.version.id.delete(v.id);
  if (!obj.active && ![...ctx.db.version.objectId.filter(obj.id)].length)
    ctx.db.object.id.delete(obj.id);
});
export const requestAgent = db.reducer(
  { prompt: t.string() },
  (ctx, { prompt }) => {
    const p = me(ctx),
      g =
        ctx.db.grant.owner.find(ctx.sender) ??
        fail("Pair your local Claude Code first.");
    if (![...ctx.db.connection.identity.filter(g.bridge)].length)
      fail("Your bridge is offline.");
    const jobs = [...ctx.db.job.owner.filter(ctx.sender)];
    if (jobs.some((j) => ["pending", "working"].includes(j.status)))
      fail("Wait for your agent or cancel the current request.");
    if (
      jobs.some(
        (j) =>
          ctx.timestamp.microsSinceUnixEpoch -
            j.createdAt.microsSinceUnixEpoch <
          2000000n,
      )
    )
      fail("Wait two seconds between requests.");
    ctx.db.job.insert({
      id: 0n,
      owner: p.identity,
      bridge: g.bridge,
      roomId: p.roomId,
      npcId: 0n,
      prompt: text(prompt, "Prompt", 3000),
      status: "pending",
      result: "",
      createdAt: ctx.timestamp,
    });
    for (const j of jobs.slice(0, Math.max(0, jobs.length - 19)))
      ctx.db.job.id.delete(j.id);
  },
);
function authorizedJob(ctx: Ctx, id: bigint) {
  const j = ctx.db.job.id.find(id);
  if (
    !j ||
    !j.bridge.equals(ctx.sender) ||
    !ctx.db.grant.owner.find(j.owner)?.bridge.equals(ctx.sender)
  )
    fail("Not authorized for this request.");
  if (
    ctx.timestamp.microsSinceUnixEpoch - j.createdAt.microsSinceUnixEpoch >
    300000000n
  )
    fail("Request expired.");
  return j;
}
export const cancelJob = db.reducer({ id: t.u64() }, (ctx, { id }) => {
  const j = ctx.db.job.id.find(id);
  if (!j?.owner.equals(ctx.sender)) fail("Not your request.");
  if (["pending", "working"].includes(j.status))
    ctx.db.job.id.update({ ...j, status: "cancelled", result: "Cancelled." });
});
export const claimJob = db.reducer({ id: t.u64() }, (ctx, { id }) => {
  const j = authorizedJob(ctx, id);
  if (j.status !== "pending") fail("Already claimed.");
  ctx.db.job.id.update({ ...j, status: "working" });
});
export const failJob = db.reducer(
  { id: t.u64(), reason: t.string() },
  (ctx, { id, reason }) => {
    const j = authorizedJob(ctx, id);
    if (j.status !== "working") fail("Not running.");
    ctx.db.job.id.update({
      ...j,
      status: "failed",
      result: text(reason, "Reason", 500),
    });
  },
);
export const completeJob = db.reducer(
  {
    id: t.u64(),
    kind: t.string(),
    direction: t.string(),
    name: t.string(),
    description: t.string(),
    biography: t.string(),
    message: t.string(),
    objectId: t.string(),
    objectKind: t.string(),
    source: t.string(),
    actions: t.array(Action),
  },
  (ctx, a) => {
    const j = authorizedJob(ctx, a.id);
    if (j.status !== "working") fail("Not running.");
    let result = text(a.message, "Message", 2000);
    if (a.kind === "room") {
      const r = createRoom(
        ctx,
        j.owner,
        j.roomId,
        a.direction,
        a.name,
        a.description,
      );
      result += `\nCreated ${r.name}.`;
    } else if (a.kind === "object") {
      const v = draft(
        ctx,
        j.owner,
        j.roomId,
        a.objectId ? asId(a.objectId) : 0n,
        a.objectKind,
        a.name,
        a.description,
        a.actions,
        a.source,
      );
      result += `\nDraft ${v.id} ready. Inspect, test and publish in Build.`;
    } else if (a.kind === "scene" || a.kind === "avatar") {
      saveVisual(ctx, j.owner, j.roomId, a.kind, a.source);
      result +=
        "\nVisual draft ready in Build ? Visuals. Preview and publish it there.";
    } else if (a.kind !== "reply") fail("Unsupported action.");
    ctx.db.job.id.update({ ...j, status: "done", result });
  },
);

// All world implementation tables are private. These views are the sole client surface.
function viewer(ctx: ReadCtx & { sender: Identity }) {
  return ctx.db.grant.bridge.find(ctx.sender)?.owner ?? ctx.sender;
}
function visibleRoomRows(ctx: ReadCtx & { sender: Identity }) {
  const actor = viewer(ctx),
    known = new Set(
      [...ctx.db.discovery.owner.filter(actor)].map((d) => d.roomId),
    );
  const rows = [...ctx.db.room.iter()].filter(
    (r) => r.id === 1n || known.has(r.id) || editable(ctx, r.zoneId, actor),
  );
  return rows.map((r) => ({
    ...r,
    exits: r.exits
      .filter(
        (e) =>
          !e.secret ||
          !!stateValue(ctx, e.gateId, actor.toHexString(), "discovered"),
      )
      .map((e) => ({ ...e })),
  }));
}
export const visibleRooms = db.view(
  { name: "visible_rooms", public: true },
  t.array(room.rowType),
  (ctx) => visibleRoomRows(ctx),
);
export const visiblePlayers = db.view(
  { name: "visible_players", public: true },
  t.array(player.rowType),
  (ctx) => {
    const actor = viewer(ctx),
      p = ctx.db.player.identity.find(actor);
    return p ? [...ctx.db.player.roomId.filter(p.roomId)] : [];
  },
);
export const visibleObjects = db.view(
  { name: "visible_objects", public: true },
  t.array(object.rowType),
  (ctx) => {
    const actor = viewer(ctx),
      p = ctx.db.player.identity.find(actor);
    return [...ctx.db.object.iter()].filter(
      (o) =>
        editable(ctx, o.zoneId, actor) || (o.active && o.roomId === p?.roomId),
    );
  },
);
export const myVersions = db.view(
  { name: "my_versions", public: true },
  t.array(version.rowType),
  (ctx) => {
    const actor = viewer(ctx);
    return [...ctx.db.version.iter()].filter((v) => {
      const o = ctx.db.object.id.find(v.objectId);
      return o && editable(ctx, o.zoneId, actor);
    });
  },
);
export const myTraces = db.view(
  { name: "my_traces", public: true },
  t.array(trace.rowType),
  (ctx) =>
    [...ctx.db.trace.iter()].filter((o) =>
      editable(ctx, o.zoneId, viewer(ctx)),
    ),
);
export const myInventory = db.view(
  { name: "my_inventory", public: true },
  t.array(inventory.rowType),
  (ctx) => [...ctx.db.inventory.owner.filter(viewer(ctx))],
);
export const myMembers = db.view(
  { name: "my_members", public: true },
  t.array(member.rowType),
  (ctx) =>
    [...ctx.db.member.iter()].filter((m) =>
      editable(ctx, m.zoneId, viewer(ctx)),
    ),
);
export const visibleChat = db.view(
  { name: "visible_chat", public: true },
  t.array(chat.rowType),
  (ctx) => {
    const p = ctx.db.player.identity.find(viewer(ctx));
    return p ? [...ctx.db.chat.roomId.filter(p.roomId)] : [];
  },
);
const Gate = t.object("GateStatus", { id: t.u64(), open: t.bool() });
export const visibleGates = db.view(
  { name: "visible_gates", public: true },
  t.array(Gate),
  (ctx) => {
    const ids = new Set(
      visibleRoomRows(ctx).flatMap((r) =>
        r.exits.filter((e) => e.gateId).map((e) => e.gateId),
      ),
    );
    return [...ids].map((id) => ({
      id,
      open: stateValue(ctx, id, "shared", "open") === true,
    }));
  },
);
export const myInbox = db.view(
  { name: "my_inbox", public: true },
  t.array(inbox.rowType),
  (ctx) => [...ctx.db.inbox.owner.filter(ctx.sender)],
);
export const myGrant = db.view(
  { name: "my_grant", public: true },
  t.array(grant.rowType),
  (ctx) => {
    const g =
      ctx.db.grant.owner.find(ctx.sender) ??
      ctx.db.grant.bridge.find(ctx.sender);
    return g ? [g] : [];
  },
);
export const myJobs = db.view(
  { name: "my_jobs", public: true },
  t.array(job.rowType),
  (ctx) => [...ctx.db.job.owner.filter(ctx.sender)],
);
export const agentJobs = db.view(
  { name: "agent_jobs", public: true },
  t.array(job.rowType),
  (ctx) => {
    const g = ctx.db.grant.bridge.find(ctx.sender);
    return g
      ? [...ctx.db.job.bridge.filter(ctx.sender)].filter((j) =>
          j.owner.equals(g.owner),
        )
      : [];
  },
);
