import { ScheduleAt } from "spacetimedb";
import { t, SenderError } from "spacetimedb/server";
import { db, walkArrival, now, type Ctx } from "./schema";
import { requirePropertyVisit, requireBuilder } from "./access";
import { TableStore } from "./store";
import { WorldRuntime } from "../../spacetimedb/src/runtime/engine";
import {
  approachPoint,
  navigationScene,
  planWalk,
  walkPosition,
  walkerPosition,
  walkDuration,
  walkable,
  type Walker,
} from "../../shared/runtime/walking";
import { clearSegment } from "../../shared/navigation";
import type { Vec3 } from "../../shared/geometry";
import { assertSchema } from "../../shared/runtime/values";
import { scheduleSpatial } from "./schedule-spatial";

function acceptsAction(store: TableStore, entity: string, name: string) {
  if (name === "sit" && store.entity(entity)?.components.seat) return true;
  if (name === "enter" && destination(store, entity)) return true;
  const handlers = store
    .slots(entity)
    .filter((s) => s.enabled && !s.lastError)
    .map(
      (s) => store.package(s.packageHash)!.manifest.handlers[`action:${name}`],
    )
    .filter(Boolean);
  if (!handlers.length) return false;
  try {
    handlers.forEach((h) => assertSchema(h.input, null));
    return true;
  } catch {
    return false;
  }
}
function destination(store: TableStore, id: string) {
  const entity = store.entity(id),
    home = store.ctx.db.homeLink.entrance.find(id);
  return home
    ? { property: home.property, room: "home" }
    : (entity?.components.exit as
        { property: string; room: string } | undefined);
}

function scene(ctx: Ctx, property: string, room: string) {
  return navigationScene(
    [...ctx.db.entity.property.filter(property)]
      .filter((e) => e.room === room)
      .map((e) => JSON.parse(e.data)),
  );
}
function save(ctx: Ctx, walker: Walker) {
  const old = ctx.db.walker.id.find(walker.id);
  if (old && (old.property !== walker.property || old.room !== walker.room))
    scheduleSpatial(ctx, old.property, old.room);
  scheduleSpatial(ctx, walker.property, walker.room);
  const row = {
    id: walker.id,
    property: walker.property,
    room: walker.room,
    data: JSON.stringify(walker),
  };
  if (ctx.db.walker.id.find(walker.id)) ctx.db.walker.id.update(row);
  else ctx.db.walker.insert(row);
}
function cancel(ctx: Ctx, id: string) {
  const arrival = ctx.db.walkArrival.walker.find(id);
  if (arrival) ctx.db.walkArrival.scheduledId.delete(arrival.scheduledId);
}
export const leaveWorld = db.clientDisconnected((ctx) => {
  if (!ctx.connectionId) return;
  const connection = ctx.connectionId.toHexString(),
    session = ctx.db.playSession.id.find(connection);
  if (!session) return;
  ctx.db.playSession.id.delete(connection);
  if ([...ctx.db.playSession.player.filter(session.player)].length) return;
  const row = ctx.db.walker.id.find(session.player);
  if (!row) return;
  const walker = JSON.parse(row.data) as Walker,
    property = ctx.db.propertyAuthority.id.find(row.property);
  const home =
    property &&
    [...ctx.db.homeLink.community.filter(property.community)].find(
      (h) => h.owner.toHexString() === session.player,
    );
  cancel(ctx, row.id);
  if (!home) {
    save(ctx, {
      ...walker,
      away: true,
      seat: undefined,
      action: undefined,
      walk: {
        start: walkPosition(walker.walk, now(ctx)),
        points: [],
        started: now(ctx),
        speed: 2.5,
      },
    });
    return;
  }
  const nav = scene(ctx, home.property, "home"),
    start = nav.spawn;
  let walk = { start, points: [] as Vec3[], started: now(ctx), speed: 1 };
  for (const offset of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ]) {
    try {
      const path = planWalk(
        nav,
        start,
        [start[0] + offset[0], 0, start[2] + offset[1]],
        now(ctx),
      );
      walk = { ...path, points: [...path.points, start], speed: 1 };
      break;
    } catch {}
  }
  save(ctx, {
    ...walker,
    property: home.property,
    room: "home",
    away: true,
    seat: undefined,
    action: undefined,
    walk,
  });
});
function enterRoom(ctx: Ctx, a: { property: string; room: string }) {
  requirePropertyVisit(ctx, a.property);
  const id = ctx.sender.toHexString(),
    old = ctx.db.walker.id.find(id);
  if (ctx.connectionId) {
    const session = { id: ctx.connectionId.toHexString(), player: id };
    if (!ctx.db.playSession.id.find(session.id))
      ctx.db.playSession.insert(session);
  }
  if (old) {
    const prior = JSON.parse(old.data) as Walker;
    if (prior.away) {
      save(ctx, {
        ...prior,
        away: false,
        walk: {
          start: walkerPosition(prior, now(ctx)),
          points: [],
          started: now(ctx),
          speed: 2.5,
        },
      });
      return;
    }
  }
  if (old?.property === a.property && old.room === a.room) return;
  const nav = scene(ctx, a.property, a.room);
  if (!walkable(nav, nav.spawn[0], nav.spawn[2]))
    throw new SenderError("Spawn is blocked.");
  cancel(ctx, id);
  save(ctx, {
    id,
    ...a,
    walk: { start: nav.spawn, points: [], started: now(ctx), speed: 2.5 },
  });
}
export const enterWalkRoom = db.reducer(
  { property: t.string(), room: t.string() },
  enterRoom,
);
export const joinWorld = db.reducer({ community: t.string() }, (ctx, a) => {
  const principal = requireBuilder(ctx, a.community);
  if (principal.identity !== ctx.sender.toHexString())
    throw new SenderError("Join with your player identity.");
  const old = ctx.db.walker.id.find(principal.identity);
  const property = old && ctx.db.propertyAuthority.id.find(old.property);
  const resume = old && property?.community === a.community;
  enterRoom(
    ctx,
    resume
      ? { property: old.property, room: old.room }
      : { property: `common:${a.community}`, room: "welcome" },
  );
});
export const walkTo = db.reducer(
  { x: t.f64(), z: t.f64(), entity: t.string(), action: t.string() },
  (ctx, a) => {
    const row = ctx.db.walker.id.find(ctx.sender.toHexString());
    if (!row) throw new SenderError("Enter a room first.");
    requirePropertyVisit(ctx, row.property);
    const walker = JSON.parse(row.data) as Walker,
      nav = scene(ctx, row.property, row.room);
    const seated = walker.seat && new TableStore(ctx).entity(walker.seat);
    const start = seated
      ? approachPoint(seated)
      : walkPosition(walker.walk, now(ctx));
    let end: Vec3 = [a.x, 0, a.z];
    let action: Walker["action"];
    if (a.entity) {
      const target = new TableStore(ctx).entity(a.entity);
      if (
        !target?.enabled ||
        target.property !== row.property ||
        target.room !== row.room
      )
        throw new SenderError("Object unavailable in this room.");
      end = approachPoint(target);
      if (!acceptsAction(new TableStore(ctx), target.id, a.action))
        throw new SenderError("Action unavailable.");
      action = {
        entity: target.id,
        name: a.action,
        generation: target.generation,
      };
    }
    if (end.some((n) => !Number.isFinite(n)))
      throw new SenderError("Invalid destination.");
    const walk = planWalk(nav, start, end, now(ctx));
    cancel(ctx, row.id);
    save(ctx, { ...walker, walk, action, error: undefined, seat: undefined });
    ctx.db.walkArrival.insert({
      scheduledId: 0n,
      walker: row.id,
      scheduledAt: ScheduleAt.time(
        BigInt(
          Math.round((now(ctx) + Math.max(0.01, walkDuration(walk))) * 1e6),
        ),
      ),
    });
  },
);
export const arriveWalk = db.reducer(
  { onSchedule: walkArrival },
  { work: walkArrival.rowType },
  (ctx, { work }) => {
    if (!ctx.sender.equals(ctx.identity) || ctx.connectionId)
      throw new SenderError("Scheduler only.");
    if (
      ctx.db.walkArrival.walker.find(work.walker)?.scheduledId !==
      work.scheduledId
    )
      return;
    ctx.db.walkArrival.scheduledId.delete(work.scheduledId);
    const row = ctx.db.walker.id.find(work.walker);
    if (!row) return;
    const walker = JSON.parse(row.data) as Walker,
      nav = scene(ctx, row.property, row.room);
    let position = walker.walk.start,
      blocked = false;
    for (const point of walker.walk.points) {
      if (!clearSegment(nav, position, point)) {
        blocked = true;
        break;
      }
      position = point;
    }
    const action = walker.action;
    save(ctx, {
      ...walker,
      walk: { start: position, points: [], started: now(ctx), speed: 2.5 },
      action: undefined,
      error: blocked ? "Route changed; choose another destination." : undefined,
    });
    if (blocked || !action) return;
    const store = new TableStore(ctx),
      target = store.entity(action.entity);
    if (
      !target?.enabled ||
      target.generation !== action.generation ||
      target.room !== row.room ||
      target.property !== row.property
    )
      return;
    if (
      !target.components.interaction ||
      !acceptsAction(store, target.id, action.name)
    )
      return;
    const approach = approachPoint(target);
    if (Math.hypot(position[0] - approach[0], position[2] - approach[2]) > 0.1)
      return;
    if (action.name === "sit") {
      if (
        [...ctx.db.walker.property.filter(row.property)].some(
          (r) =>
            r.id !== row.id &&
            (JSON.parse(r.data) as Walker).seat === target.id,
        )
      )
        return;
      const seat = target.components.seat as { position: Vec3; yaw: number };
      const pose = target.components.transform as {
        position: Vec3;
        rotation: Vec3;
      };
      const yaw = ((pose?.rotation[1] ?? 0) * Math.PI) / 180;
      const at: Vec3 = [
        (pose?.position[0] ?? 0) +
          seat.position[0] * Math.cos(yaw) +
          seat.position[2] * Math.sin(yaw),
        seat.position[1] + (pose?.position[1] ?? 0),
        (pose?.position[2] ?? 0) -
          seat.position[0] * Math.sin(yaw) +
          seat.position[2] * Math.cos(yaw),
      ];
      save(ctx, {
        ...walker,
        seat: target.id,
        action: undefined,
        walk: { start: at, points: [], started: now(ctx), speed: 2.5 },
      });
      return;
    }
    if (action.name === "enter") {
      const to = destination(store, target.id);
      const authority = to && ctx.db.propertyAuthority.id.find(to.property);
      if (!to || authority?.community !== target.community) return;
      const next = scene(ctx, to.property, to.room);
      if (!walkable(next, next.spawn[0], next.spawn[2])) return;
      save(ctx, {
        ...walker,
        property: to.property,
        room: to.room,
        action: undefined,
        walk: { start: next.spawn, points: [], started: now(ctx), speed: 2.5 },
      });
      return;
    }
    new WorldRuntime(store, now(ctx)).action(
      target.id,
      action.name,
      null,
      row.id,
    );
    store.schedule();
  },
);
