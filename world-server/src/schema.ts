import {
  schema,
  table,
  t,
  type ReducerCtx,
  type InferSchema,
} from "spacetimedb/server";
const authority = table(
  {},
  { key: t.string().primaryKey(), identity: t.identity() },
);
const entity = table(
  {},
  {
    id: t.string().primaryKey(),
    property: t.string().index("btree"),
    room: t.string().index("btree"),
    data: t.string(),
  },
);
const slot = table(
  {},
  {
    id: t.string().primaryKey(),
    entity: t.string().index("btree"),
    data: t.string(),
  },
);
const behaviorPackage = table(
  {},
  { hash: t.string().primaryKey(), data: t.string() },
);
const packageListing = table(
  {},
  { id: t.string().primaryKey(), data: t.string() },
);
const packageRevision = table(
  {},
  {
    key: t.string().primaryKey(),
    hash: t.string().index("btree"),
    data: t.string(),
  },
);
const inbox = table(
  {},
  {
    id: t.string().primaryKey(),
    entity: t.string().index("btree"),
    sequence: t.f64(),
    data: t.string(),
  },
);
const receipt = table(
  {},
  {
    id: t.string().primaryKey(),
    entity: t.string().index("btree"),
    sequence: t.f64(),
    data: t.string(),
  },
);
const timer = table(
  {},
  {
    id: t.string().primaryKey(),
    entity: t.string().index("btree"),
    slot: t.string().index("btree"),
    due: t.f64(),
    data: t.string(),
  },
);
const counter = table({}, { key: t.string().primaryKey(), value: t.f64() });
export const wake = table(
  {},
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    entity: t.string().unique(),
    scheduledAt: t.scheduleAt(),
  },
);
const operation = table(
  {},
  {
    id: t.string().primaryKey(),
    entity: t.string().index("btree"),
    due: t.option(t.f64()),
    data: t.string(),
  },
);
const community = table({}, { id: t.string().primaryKey(), name: t.string() });
const membership = table(
  {},
  {
    key: t.string().primaryKey(),
    community: t.string().index("btree"),
    identity: t.identity(),
    discordUserId: t.string(),
    active: t.bool(),
    admin: t.bool(),
    validUntil: t.f64(),
  },
);
const builderGrant = table(
  {},
  {
    key: t.string().primaryKey(),
    community: t.string().index("btree"),
    agent: t.identity(),
    owner: t.identity(),
    commonSpace: t.bool(),
  },
);
const propertyAuthority = table(
  {},
  {
    id: t.string().primaryKey(),
    community: t.string().index("btree"),
    owner: t.identity(),
    common: t.bool(),
    revision: t.u32(),
  },
);
const installedGrant = table(
  {},
  {
    slot: t.string().primaryKey(),
    property: t.string().index("btree"),
    revision: t.u32(),
    active: t.bool(),
    resources: t.string(),
  },
);
const workMeter = table(
  {},
  { key: t.string().primaryKey(), window: t.f64(), count: t.u32() },
);
export const db = schema({
  workMeter,
  community,
  membership,
  builderGrant,
  propertyAuthority,
  installedGrant,
  authority,
  entity,
  slot,
  behaviorPackage,
  packageListing,
  packageRevision,
  inbox,
  receipt,
  timer,
  counter,
  wake,
  operation,
});
export default db;
export type Ctx = ReducerCtx<InferSchema<typeof db>>;
export const now = (ctx: Ctx) =>
  Number(ctx.timestamp.microsSinceUnixEpoch) / 1e6;
