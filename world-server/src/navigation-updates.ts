import { ScheduleAt } from "spacetimedb";
import { type Ctx, now } from "./schema";
import type { Entity } from "../../shared/runtime/contracts";
import {
  navigationScene,
  planWalk,
  walkerPosition,
  walkDuration,
  type Walker,
} from "../../shared/runtime/walking";
import { scheduleSpatial } from "./schedule-spatial";
/** Replan only on authored/navigation state changes, never on animation frames. */
export function reconcileNavigation(ctx: Ctx, property: string, room: string) {
  const entities = [...ctx.db.entity.property.filter(property)]
    .filter((r) => r.room === room)
    .map((r) => JSON.parse(r.data) as Entity);
  if (
    entities.filter((e) => e.enabled && e.components.walkSurface).length !== 1
  )
    return;
  const nav = navigationScene(entities),
    time = now(ctx);
  for (const row of ctx.db.walker.property.filter(property)) {
    if (row.room !== room) continue;
    const walker = JSON.parse(row.data) as Walker;
    if (walker.seat || walker.away || !walker.walk.points.length) continue;
    const start = walkerPosition(walker, time),
      end = walker.walk.points.at(-1)!;
    const old = ctx.db.walkArrival.walker.find(row.id);
    if (old) ctx.db.walkArrival.scheduledId.delete(old.scheduledId);
    try {
      walker.walk = planWalk(nav, start, end, time);
      walker.error = undefined;
      ctx.db.walkArrival.insert({
        scheduledId: 0n,
        walker: row.id,
        scheduledAt: ScheduleAt.time(
          BigInt(
            Math.round(
              (time + Math.max(0.01, walkDuration(walker.walk))) * 1e6,
            ),
          ),
        ),
      });
    } catch {
      walker.walk = { start, points: [], started: time, speed: 2.5 };
      walker.action = undefined;
      walker.error = "The route changed. Choose another destination.";
    }
    ctx.db.walker.id.update({ ...row, data: JSON.stringify(walker) });
  }
  scheduleSpatial(ctx, property, room);
}
