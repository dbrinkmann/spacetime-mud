import { ScheduleAt } from "spacetimedb";
import { t, SenderError } from "spacetimedb/server";
import { db, spatialWake, now, type Ctx } from "./schema";
import { TableStore } from "./store";
import { WorldRuntime } from "../../spacetimedb/src/runtime/engine";
import { evaluateRoomViews } from "../../shared/runtime/spatial";
import {
  pathTrajectory,
  type SensedEntity,
} from "../../shared/intelligent-objects";
import { walkDuration, type Walker } from "../../shared/runtime/walking";
import { scheduleSpatial } from "./schedule-spatial";
export const evaluateSpatial = db.reducer(
  { onSchedule: spatialWake },
  { work: spatialWake.rowType },
  (ctx, { work }) => {
    if (!ctx.sender.equals(ctx.identity) || ctx.connectionId)
      throw new SenderError("Scheduler only.");
    if (ctx.db.spatialWake.key.find(work.key)?.scheduledId !== work.scheduledId)
      return;
    ctx.db.spatialWake.scheduledId.delete(work.scheduledId);
    const store = new TableStore(ctx),
      runtime = new WorldRuntime(store, now(ctx));
    const due = evaluateRoomViews(
      store,
      work.property,
      work.room,
      now(ctx),
      store.players(work.property, work.room, now(ctx)),
      (entity, slot, generation, name, payload) =>
        runtime.enqueue(
          entity,
          "spatial",
          name,
          payload,
          payload.entity.kind === "player"
            ? { kind: "player", id: payload.entity.id.slice(7) }
            : { kind: "engine", id: "spatial" },
          slot,
          generation,
        ),
    );
    store.schedule();
    scheduleSpatial(ctx, work.property, work.room, due);
  },
);
