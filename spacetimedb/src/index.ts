import {
  schema,
  table,
  t,
  SenderError,
  type ReducerCtx,
  type InferSchema,
} from "spacetimedb/server";
import type { Identity } from "spacetimedb";

const Exit = t.object("Exit", { direction: t.string(), destination: t.u64() });
const world = table(
  { public: true },
  { id: t.string().primaryKey(), name: t.string(), description: t.string() },
);
const zone = table(
  { public: true },
  {
    id: t.string().primaryKey(),
    worldId: t.string(),
    name: t.string(),
    description: t.string(),
  },
);
const room = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    zoneId: t.string(),
    name: t.string(),
    description: t.string(),
    exits: t.array(Exit),
    creator: t.identity(),
  },
);
const player = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    nameKey: t.string().unique(),
    roomId: t.u64(),
    online: t.bool(),
  },
);
const connection = table(
  {},
  { id: t.connectionId().primaryKey(), identity: t.identity().index("btree") },
);
const npc = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index("btree"),
    name: t.string(),
    description: t.string(),
    biography: t.string(),
    creator: t.identity(),
  },
);
const chat = table(
  { public: true },
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
const db = schema({
  world,
  zone,
  room,
  player,
  connection,
  npc,
  chat,
  inbox,
  grant,
  job,
});
export default db;
type Ctx = ReducerCtx<InferSchema<typeof db>>;
const opposite: Record<string, string> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
  up: "down",
  down: "up",
};
function text(value: string, label: string, max: number) {
  const s = value.trim();
  if (!s || s.length > max || /[\u0000-\u0008\u000b-\u001f]/.test(s))
    throw new SenderError(`${label} must be 1–${max} characters.`);
  return s;
}
function me(ctx: Ctx) {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (!p) throw new SenderError("Create your character first.");
  return p;
}
function getRoom(ctx: Ctx, id: bigint) {
  const r = ctx.db.room.id.find(id);
  if (!r) throw new SenderError("Room not found.");
  return r;
}
function post(
  ctx: Ctx,
  roomId: bigint,
  author: string,
  message: string,
  kind = "say",
) {
  ctx.db.chat.insert({
    id: 0n,
    roomId,
    author,
    text: message,
    kind,
    timestamp: ctx.timestamp,
  });
  const rows = [...ctx.db.chat.roomId.filter(roomId)].sort((a, b) =>
    a.timestamp.microsSinceUnixEpoch < b.timestamp.microsSinceUnixEpoch
      ? -1
      : 1,
  );
  for (const row of rows.slice(0, Math.max(0, rows.length - 100)))
    ctx.db.chat.id.delete(row.id);
}
function mail(ctx: Ctx, owner: Identity, author: string, message: string) {
  ctx.db.inbox.insert({
    id: 0n,
    owner,
    author,
    text: message,
    timestamp: ctx.timestamp,
  });
  const rows = [...ctx.db.inbox.owner.filter(owner)].sort((a, b) =>
    a.timestamp.microsSinceUnixEpoch < b.timestamp.microsSinceUnixEpoch
      ? -1
      : 1,
  );
  for (const row of rows.slice(0, Math.max(0, rows.length - 60)))
    ctx.db.inbox.id.delete(row.id);
}
function createRoom(
  ctx: Ctx,
  owner: Identity,
  sourceId: bigint,
  direction: string,
  name: string,
  description: string,
) {
  direction = direction.trim().toLowerCase();
  if (!opposite[direction])
    throw new SenderError("Choose north, south, east, west, up or down.");
  const source = getRoom(ctx, sourceId);
  if (source.exits.some((e) => e.direction === direction))
    throw new SenderError("An exit already exists in that direction.");
  if (ctx.db.room.count() >= 1000n)
    throw new SenderError("This demo has reached its 1,000-room limit.");
  const next = ctx.db.room.insert({
    id: 0n,
    zoneId: source.zoneId,
    name: text(name, "Room name", 80),
    description: text(description, "Description", 3000),
    exits: [{ direction: opposite[direction], destination: source.id }],
    creator: owner,
  });
  ctx.db.room.id.update({
    ...source,
    exits: [...source.exits, { direction, destination: next.id }],
  });
  post(
    ctx,
    source.id,
    "Nexus",
    `A passage opens ${direction} to ${next.name}.`,
    "world",
  );
  return next;
}
function createNpc(
  ctx: Ctx,
  owner: Identity,
  roomId: bigint,
  name: string,
  description: string,
  biography: string,
) {
  getRoom(ctx, roomId);
  name = text(name, "NPC name", 40);
  if (name.toLowerCase() === "aiagent")
    throw new SenderError("AIAgent is reserved for the world builder.");
  const residents = [...ctx.db.npc.roomId.filter(roomId)];
  if (residents.length >= 8)
    throw new SenderError("A room can have at most eight NPCs.");
  if (residents.some((n) => n.name.toLowerCase() === name.toLowerCase()))
    throw new SenderError("An NPC here already has that name.");
  const n = ctx.db.npc.insert({
    id: 0n,
    roomId,
    name,
    description: text(description, "Description", 1500),
    biography: text(biography, "Biography", 3000),
    creator: owner,
  });
  post(ctx, roomId, "Nexus", `${name} arrives.`, "world");
  return n;
}
function enqueue(
  ctx: Ctx,
  p: ReturnType<typeof me>,
  prompt: string,
  npcId = 0n,
) {
  const g = ctx.db.grant.owner.find(p.identity);
  if (!g)
    throw new SenderError(
      "Connect your Claude Code bridge first, or use the manual Build panel.",
    );
  if (![...ctx.db.connection.identity.filter(g.bridge)].length)
    throw new SenderError(
      "Your bridge is offline. Restart it on your computer.",
    );
  const jobs = [...ctx.db.job.owner.filter(p.identity)];
  if (jobs.some((j) => j.status === "pending" || j.status === "working"))
    throw new SenderError(
      "Your agent is still working. Wait or cancel the current request.",
    );
  if (
    jobs.some(
      (j) =>
        ctx.timestamp.microsSinceUnixEpoch - j.createdAt.microsSinceUnixEpoch <
        2_000_000n,
    )
  )
    throw new SenderError("Please wait two seconds between agent requests.");
  for (const old of jobs.slice(0, Math.max(0, jobs.length - 19)))
    ctx.db.job.id.delete(old.id);
  ctx.db.job.insert({
    id: 0n,
    owner: p.identity,
    bridge: g.bridge,
    roomId: p.roomId,
    npcId,
    prompt: text(prompt, "Request", 2000),
    status: "pending",
    result: "",
    createdAt: ctx.timestamp,
  });
}
export const init = db.init((ctx) => {
  ctx.db.world.insert({
    id: "nexus",
    name: "Nexus",
    description: "A shared multiverse imagined and built by its players.",
  });
  ctx.db.zone.insert({
    id: "nexus",
    worldId: "nexus",
    name: "Nexus",
    description: "The meeting place between worlds.",
  });
  ctx.db.room.insert({
    id: 0n,
    zoneId: "nexus",
    name: "The Nexus",
    description:
      "Towering marble pillars rise into a sky of stained glass. Light pools across the polished floor. Between the pillars, the air shimmers with worlds that have yet to be imagined.\n\nThere are no paths until someone makes them. Ask AIAgent to create a room in an open direction, or use Build to shape one yourself. Everything you create becomes part of this shared world.",
    exits: [],
    creator: ctx.sender,
  });
});
export const onConnect = db.clientConnected((ctx) => {
  if (ctx.connectionId)
    ctx.db.connection.insert({ id: ctx.connectionId, identity: ctx.sender });
  const p = ctx.db.player.identity.find(ctx.sender);
  if (p) ctx.db.player.identity.update({ ...p, online: true });
});
export const onDisconnect = db.clientDisconnected((ctx) => {
  if (ctx.connectionId) ctx.db.connection.id.delete(ctx.connectionId);
  if (![...ctx.db.connection.identity.filter(ctx.sender)].length) {
    const p = ctx.db.player.identity.find(ctx.sender);
    if (p) ctx.db.player.identity.update({ ...p, online: false });
  }
});
export const createPlayer = db.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    if (ctx.db.player.identity.find(ctx.sender))
      throw new SenderError("You already have a character.");
    name = text(name, "Name", 24);
    if (!/^[a-zA-Z][a-zA-Z0-9 _-]{1,23}$/.test(name))
      throw new SenderError(
        "Use 2–24 letters, numbers, spaces, underscores or hyphens; start with a letter.",
      );
    const nameKey = name.toLowerCase();
    if (["aiagent", "nexus", "system"].includes(nameKey))
      throw new SenderError("That name is reserved.");
    if (ctx.db.player.nameKey.find(nameKey))
      throw new SenderError("That name is taken. Choose another.");
    ctx.db.player.insert({
      identity: ctx.sender,
      name,
      nameKey,
      roomId: 1n,
      online: true,
    });
  },
);
export const go = db.reducer(
  { direction: t.string() },
  (ctx, { direction }) => {
    const p = me(ctx),
      r = getRoom(ctx, p.roomId);
    const exit = r.exits.find(
      (e) => e.direction === direction.toLowerCase().trim(),
    );
    if (!exit)
      throw new SenderError("There is no exit that way. You can build one.");
    getRoom(ctx, exit.destination);
    ctx.db.player.identity.update({ ...p, roomId: exit.destination });
    post(ctx, r.id, "Nexus", `${p.name} leaves ${exit.direction}.`, "presence");
    post(ctx, exit.destination, "Nexus", `${p.name} arrives.`, "presence");
  },
);
export const home = db.reducer((ctx) => {
  const p = me(ctx);
  ctx.db.player.identity.update({ ...p, roomId: 1n });
});
export const buildRoom = db.reducer(
  { direction: t.string(), name: t.string(), description: t.string() },
  (ctx, args) => {
    const p = me(ctx);
    createRoom(
      ctx,
      p.identity,
      p.roomId,
      args.direction,
      args.name,
      args.description,
    );
  },
);
export const buildNpc = db.reducer(
  { name: t.string(), description: t.string(), biography: t.string() },
  (ctx, args) => {
    const p = me(ctx);
    createNpc(
      ctx,
      p.identity,
      p.roomId,
      args.name,
      args.description,
      args.biography,
    );
  },
);
export const say = db.reducer({ message: t.string() }, (ctx, { message }) => {
  const p = me(ctx);
  post(ctx, p.roomId, p.name, text(message, "Message", 1000));
});
export const tell = db.reducer(
  { target: t.string(), message: t.string() },
  (ctx, { target, message }) => {
    const p = me(ctx);
    message = text(message, "Message", 1000);
    target = target.trim().toLowerCase();
    if (target === "aiagent") {
      enqueue(ctx, p, message);
      return;
    }
    const n = [...ctx.db.npc.roomId.filter(p.roomId)].find(
      (n) => n.name.toLowerCase() === target,
    );
    if (n) {
      enqueue(ctx, p, message, n.id);
      return;
    }
    const recipient = ctx.db.player.nameKey.find(target);
    if (!recipient)
      throw new SenderError(
        "No player with that name, or no NPC here by that name.",
      );
    mail(ctx, recipient.identity, p.name, message);
    if (!recipient.identity.equals(p.identity))
      mail(ctx, p.identity, `You → ${recipient.name}`, message);
  },
);
export const consent = db.reducer(
  { bridge: t.identity() },
  (ctx, { bridge }) => {
    const p = me(ctx);
    if (bridge.equals(ctx.sender))
      throw new SenderError("Pair a separate local bridge identity.");
    if (![...ctx.db.connection.identity.filter(bridge)].length)
      throw new SenderError(
        "Bridge is offline. Start the bridge and use its pairing link.",
      );
    const other = ctx.db.grant.bridge.find(bridge);
    if (other && !other.owner.equals(p.identity))
      throw new SenderError(
        "This bridge is already paired with another player.",
      );
    for (const j of ctx.db.job.owner.filter(p.identity))
      if (j.status === "pending" || j.status === "working")
        ctx.db.job.id.update({
          ...j,
          status: "cancelled",
          result: "Bridge pairing changed.",
        });
    const g = { owner: p.identity, bridge, createdAt: ctx.timestamp };
    if (ctx.db.grant.owner.find(p.identity)) ctx.db.grant.owner.update(g);
    else ctx.db.grant.insert(g);
  },
);
export const revokeConsent = db.reducer((ctx) => {
  const p = me(ctx);
  ctx.db.grant.owner.delete(p.identity);
  for (const j of ctx.db.job.owner.filter(p.identity))
    if (j.status === "pending" || j.status === "working")
      ctx.db.job.id.update({
        ...j,
        status: "cancelled",
        result: "Consent revoked.",
      });
});
export const requestAgent = db.reducer(
  { prompt: t.string() },
  (ctx, { prompt }) => enqueue(ctx, me(ctx), prompt),
);
export const cancelJob = db.reducer({ id: t.u64() }, (ctx, { id }) => {
  const j = ctx.db.job.id.find(id);
  if (!j || !j.owner.equals(ctx.sender))
    throw new SenderError("Not your request.");
  if (j.status === "pending" || j.status === "working")
    ctx.db.job.id.update({
      ...j,
      status: "cancelled",
      result: "Cancelled by player.",
    });
});
function authorizedJob(ctx: Ctx, id: bigint) {
  const j = ctx.db.job.id.find(id);
  if (!j || !j.bridge.equals(ctx.sender))
    throw new SenderError("Not your agent request.");
  const g = ctx.db.grant.owner.find(j.owner);
  if (!g || !g.bridge.equals(ctx.sender))
    throw new SenderError("Consent is no longer active.");
  if (
    ctx.timestamp.microsSinceUnixEpoch - j.createdAt.microsSinceUnixEpoch >
    300_000_000n
  )
    throw new SenderError("Request expired. Cancel it and try again.");
  return j;
}
export const claimJob = db.reducer({ id: t.u64() }, (ctx, { id }) => {
  const j = authorizedJob(ctx, id);
  if (j.status !== "pending") throw new SenderError("Request already claimed.");
  ctx.db.job.id.update({ ...j, status: "working" });
});
export const failJob = db.reducer(
  { id: t.u64(), reason: t.string() },
  (ctx, { id, reason }) => {
    const j = authorizedJob(ctx, id);
    if (j.status !== "working")
      throw new SenderError("Request is not running.");
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
  },
  (ctx, a) => {
    const j = authorizedJob(ctx, a.id);
    if (j.status !== "working")
      throw new SenderError("Request is not running.");
    let result = text(a.message, "Agent message", 2000);
    if (j.npcId !== 0n) {
      if (a.kind !== "reply")
        throw new SenderError("NPC conversations cannot modify the world.");
      const n = ctx.db.npc.id.find(j.npcId);
      if (!n || n.roomId !== j.roomId)
        throw new SenderError("NPC is no longer here.");
      mail(ctx, j.owner, n.name, result);
    } else if (a.kind === "room") {
      const r = createRoom(
        ctx,
        j.owner,
        j.roomId,
        a.direction,
        a.name,
        a.description,
      );
      result = `${result}\nCreated ${r.name}.`;
    } else if (a.kind === "npc") {
      const n = createNpc(
        ctx,
        j.owner,
        j.roomId,
        a.name,
        a.description,
        a.biography,
      );
      result = `${result}\nCreated ${n.name}.`;
    } else if (a.kind !== "reply")
      throw new SenderError("Unsupported world action.");
    ctx.db.job.id.update({ ...j, status: "done", result });
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
    const g = ctx.db.grant.owner.find(ctx.sender);
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
