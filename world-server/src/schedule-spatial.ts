import { ScheduleAt } from "spacetimedb";
import { now, type Ctx } from "./schema";
export function scheduleSpatial(
  ctx: Ctx,
  property: string,
  room: string,
  due = now(ctx) + 0.001,
) {
  const key = JSON.stringify([property, room]),
    old = ctx.db.spatialWake.key.find(key);
  if (old && old.due <= due) return;
  if (old) ctx.db.spatialWake.scheduledId.delete(old.scheduledId);
  if (Number.isFinite(due))
    ctx.db.spatialWake.insert({
      scheduledId: 0n,
      key,
      property,
      room,
      due,
      scheduledAt: ScheduleAt.time(BigInt(Math.round(due * 1e6))),
    });
}
