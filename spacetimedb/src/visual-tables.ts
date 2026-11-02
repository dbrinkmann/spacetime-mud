import { table, t } from "spacetimedb/server";
export const roomScene = table(
  {},
  { roomId: t.u64().primaryKey(), source: t.string(), revision: t.u32() },
);
export const avatar = table(
  {},
  {
    identity: t.identity().primaryKey(),
    source: t.string(),
    revision: t.u32(),
  },
);
export const visualDraft = table(
  {},
  {
    key: t.string().primaryKey(),
    owner: t.identity().index("btree"),
    roomId: t.u64(),
    kind: t.string(),
    source: t.string(),
    revision: t.u32(),
    baseRevision: t.u32(),
  },
);
export const presence = table(
  {},
  {
    identity: t.identity().primaryKey(),
    roomId: t.u64().index("btree"),
    path: t.string(),
    startedAt: t.timestamp(),
    pose: t.string(),
    seat: t.string(),
    yaw: t.f64(),
  },
);
