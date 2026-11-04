import { ScheduleAt } from "spacetimedb";
import { t, SenderError } from "spacetimedb/server";
import { db, walkArrival, now, type Ctx } from "./schema";
import { requirePropertyEdit } from "./access";
import { TableStore } from "./store";
import { WorldRuntime } from "../../spacetimedb/src/runtime/engine";
import {
  approachPoint,
  navigationScene,
  planWalk,
  walkPosition,
  walkDuration,
  walkable,
  type Walker,
} from "../../shared/runtime/walking";
import { clearSegment } from "../../shared/navigation";
import type { Vec3 } from "../../shared/geometry";
import { assertSchema } from "../../shared/runtime/values";

function acceptsAction(store: TableStore, entity: string, name: string) {
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

function scene(ctx: Ctx, property: string, room: string) {
  return navigationScene(
    [...ctx.db.entity.property.filter(property)]
      .filter((e) => e.room === room)
      .map((e) => JSON.parse(e.data)),
  );
}
function save(ctx: Ctx, walker: Walker) {
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
export const enterWalkRoom = db.reducer(
  { property: t.string(), room: t.string() },
  (ctx, a) => {
    requirePropertyEdit(ctx, a.property);
    const id = ctx.sender.toHexString(),
      old = ctx.db.walker.id.find(id);
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
  },
);
export const walkTo = db.reducer(
  { x: t.f64(), z: t.f64(), entity: t.string(), action: t.string() },
  (ctx, a) => {
    const row = ctx.db.walker.id.find(ctx.sender.toHexString());
    if (!row) throw new SenderError("Enter a room first.");
    requirePropertyEdit(ctx, row.property);
    const walker = JSON.parse(row.data) as Walker,
      nav = scene(ctx, row.property, row.room);
    const start = walkPosition(walker.walk, now(ctx));
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
    save(ctx, { ...walker, walk, action, error: undefined });
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
    new WorldRuntime(store, now(ctx)).action(
      target.id,
      action.name,
      null,
      row.id,
    );
    store.schedule();
  },
);
