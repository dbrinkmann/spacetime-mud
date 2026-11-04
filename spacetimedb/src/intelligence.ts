import type { Ctx } from "./index";
import { ScheduleAt } from "spacetimedb";
import {
  parseDefinition,
  type Room,
  type Placement,
  type Vec3,
} from "../../shared/geometry";
import {
  propTrajectory,
  pathTrajectory,
  viewIntersection,
  validateView,
  type MotionState,
  type ViewDefinition,
  type SensedEntity,
} from "../../shared/intelligent-objects";
import { walkSpeed, sampleMotion } from "../../shared/world";
import { routineMotion } from "../../shared/community-motion";
import type { ScriptApi } from "./scripts";
export type ScriptRunner = (
  ctx: Ctx,
  id: bigint,
  handler: string,
  args?: unknown[],
) => void;
const running = new WeakSet<object>();
const logicalTimes = new WeakMap<object, number>();
export const intelligenceNow = (ctx: Ctx) =>
  logicalTimes.get(ctx) ?? Number(ctx.timestamp.microsSinceUnixEpoch) / 1e6;
const initial = (prop: Placement | undefined, now: number): MotionState => ({
  distance: (prop?.motion?.offset ?? 0) * (prop?.motion?.speed ?? 1),
  started: now,
  speed: prop?.motion?.speed ?? 1,
  paused: false,
  visible: true,
  completed: false,
});
function entities(
  ctx: Ctx,
  room: Room,
  roomId: bigint,
  now: number,
): SensedEntity[] {
  const r = ctx.db.communityRoom.id.find(roomId)!;
  const result: SensedEntity[] = [];
  for (const p of ctx.db.communityCharacter.communityId.filter(r.communityId)) {
    if (p.roomId !== roomId) continue;
    let motion = {
      path: JSON.parse(p.path) as Vec3[],
      started: Number(p.startedAt.microsSinceUnixEpoch) / 1000,
      pose: p.pose,
      seat: p.seat,
      yaw: p.yaw,
    };
    if (p.away) motion = routineMotion(motion, now * 1000);
    const trajectory = pathTrajectory(
      motion.path,
      Math.max(0, now - motion.started / 1000) * walkSpeed,
      walkSpeed,
    );
    if (p.away && trajectory.ended) {
      const duration = trajectory.total / walkSpeed;
      trajectory.next = Math.max(
        0.001,
        duration + 10 - (now - motion.started / 1000),
      );
    }
    if (trajectory.ended) {
      trajectory.position = sampleMotion(motion, room, now * 1000).position;
      trajectory.yaw = (p.yaw * 180) / Math.PI;
    }
    result.push({ id: p.key, kind: "player", tags: [], trajectory });
  }
  for (const prop of room.objects) {
    if (!prop.objectId) continue;
    const row = ctx.db.objectMotion.objectId.find(BigInt(prop.objectId));
    if (!row) continue;
    const state = JSON.parse(row.state) as MotionState;
    if (!state.visible) continue;
    result.push({
      id: prop.objectId,
      kind: "object",
      tags: prop.tags ?? [],
      trajectory: propTrajectory(prop, state, now),
    });
  }
  if (result.length > 128)
    throw Error("Intelligent rooms support at most 128 sensed entities.");
  return result;
}
function members(
  ctx: Ctx,
  prop: Placement,
  room: Room,
  roomId: bigint,
  state: MotionState,
  view: ViewDefinition,
  now: number,
) {
  const self = propTrajectory(prop, state, now);
  return entities(ctx, room, roomId, now)
    .filter(
      (e) =>
        e.id !== prop.objectId &&
        view.include.some((f) =>
          f === "player" ? e.kind === "player" : e.tags.includes(f.slice(4)),
        ) &&
        viewIntersection(view, self, e.trajectory).inside,
    )
    .map((e) => ({ id: e.id, kind: e.kind, tags: e.tags }));
}
export function prepareIntelligence(ctx: Ctx, id: bigint, resetViews = false) {
  const object = ctx.db.communityObject.id.find(id)!;
  const room = parseDefinition(
    ctx.db.communityRoom.id.find(object.roomId)!.source,
    "room",
  );
  const prop = room.objects.find((p) => p.objectId === String(id));
  const row = ctx.db.objectMotion.objectId.find(id);
  const now = intelligenceNow(ctx);
  let state: MotionState = row ? JSON.parse(row.state) : initial(prop, now);
  const oldViews = ctx.db.objectViews.objectId.find(id);
  const definitions: Record<string, ViewDefinition> = JSON.parse(
    resetViews ? "{}" : (oldViews?.definitions ?? "{}"),
  );
  let changed = resetViews && !!oldViews;
  const anchor = () => {
    if (!prop) {
      changed = true;
      return;
    }
    if (!prop.motion) throw Error("Motion requires a bound moving placement.");
    const t = propTrajectory(prop, state, now);
    state = {
      ...state,
      distance:
        prop.motion.mode === "once"
          ? Math.min(
              t.total,
              state.distance +
                (state.paused
                  ? 0
                  : Math.max(0, now - state.started) * state.speed),
            )
          : state.distance +
            (state.paused ? 0 : Math.max(0, now - state.started) * state.speed),
      started: now,
    };
    changed = true;
  };
  let random =
    Number((ctx.timestamp.microsSinceUnixEpoch + id) % 2147483647n) || 1;
  const api: ScriptApi = {
    subscribe: (name, value) => {
      if (
        typeof name !== "string" ||
        !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(name)
      )
        throw Error("Invalid view name.");
      definitions[name] = validateView(value);
      if (Object.keys(definitions).length > 4)
        throw Error("Maximum four views per object.");
      changed = true;
    },
    view: (name) => {
      if (!definitions[name]) throw Error("Unknown view.");
      return prop
        ? members(ctx, prop, room, object.roomId, state, definitions[name], now)
        : [];
    },
    "motion.pause": () => {
      anchor();
      state.paused = true;
    },
    "motion.resume": () => {
      anchor();
      state.paused = false;
    },
    "motion.restart": () => {
      anchor();
      state.distance = 0;
      state.completed = false;
      state.paused = false;
    },
    "motion.setSpeed": (speed) => {
      if (!Number.isFinite(speed) || speed < 0.1 || speed > 20)
        throw Error("Speed must be .1..20 m/s.");
      anchor();
      state.speed = speed;
    },
    "motion.progress": () => {
      if (!prop?.motion) return 0;
      const t = propTrajectory(prop, state, now);
      return t.total ? Math.min(1, t.distance / t.total) : 1;
    },
    setVisible: (visible) => {
      if (typeof visible !== "boolean")
        throw Error("Visibility must be boolean.");
      state.visible = visible;
      changed = true;
    },
    randomInt: (min, max) => {
      if (
        !Number.isInteger(min) ||
        !Number.isInteger(max) ||
        min > max ||
        Math.abs(min) > 1e6 ||
        Math.abs(max) > 1e6
      )
        throw Error("Invalid integer range.");
      random = (random * 48271) % 2147483647;
      return min + (random % (max - min + 1));
    },
  };
  return {
    api,
    commit: () => {
      if (!changed) return;
      const next = {
        objectId: id,
        roomId: object.roomId,
        communityId: object.communityId,
        placementId: prop?.id ?? "",
        definition: JSON.stringify(prop?.motion ?? null),
        state: JSON.stringify(state),
      };
      if (row) ctx.db.objectMotion.objectId.update(next);
      else ctx.db.objectMotion.insert(next);
      const views = {
        objectId: id,
        roomId: object.roomId,
        definitions: JSON.stringify(definitions),
        members: oldViews?.members ?? "{}",
      };
      if (oldViews) ctx.db.objectViews.objectId.update(views);
      else ctx.db.objectViews.insert(views);
    },
  };
}
export function syncIntelligence(ctx: Ctx, roomId: bigint, run: ScriptRunner) {
  const r = ctx.db.communityRoom.id.find(roomId);
  if (!r) return;
  const room = parseDefinition(r.source, "room"),
    now = intelligenceNow(ctx);
  for (const old of ctx.db.objectMotion.roomId.filter(roomId))
    if (!room.objects.some((p) => p.objectId === String(old.objectId))) {
      ctx.db.objectMotion.objectId.delete(old.objectId);
    }
  for (const prop of room.objects) {
    if (!prop.objectId) continue;
    const objectId = BigInt(prop.objectId),
      old = ctx.db.objectMotion.objectId.find(objectId),
      definition = JSON.stringify(prop.motion ?? null);
    if (old?.placementId === prop.id && old.definition === definition) continue;
    const next = {
      objectId,
      roomId,
      communityId: r.communityId,
      placementId: prop.id,
      definition,
      state: JSON.stringify(initial(prop, now)),
    };
    if (old) ctx.db.objectMotion.objectId.update(next);
    else ctx.db.objectMotion.insert(next);
    run(ctx, objectId, "on_start");
  }
  reconcileIntelligence(ctx, roomId, run);
}
export function reconcileIntelligence(
  ctx: Ctx,
  roomId: bigint,
  run: ScriptRunner,
  at?: number,
) {
  if (running.has(ctx)) return;
  running.add(ctx);
  if (at !== undefined) logicalTimes.set(ctx, at);
  try {
    const r = ctx.db.communityRoom.id.find(roomId);
    if (!r) return;
    const room = parseDefinition(r.source, "room"),
      now = intelligenceNow(ctx);
    if (!room.objects.some((p) => p.objectId)) return;
    let next = Infinity,
      stable = false;
    let delivered = 0;
    for (let iteration = 0; iteration < 32; iteration++) {
      next = Infinity;
      let events = 0;
      const all = entities(ctx, room, roomId, now);
      for (const prop of room.objects) {
        if (!prop.objectId) continue;
        const id = BigInt(prop.objectId),
          row = ctx.db.objectMotion.objectId.find(id);
        if (!row) continue;
        const state = JSON.parse(row.state) as MotionState,
          self = propTrajectory(prop, state, now);
        if (prop.motion?.mode === "once" && !state.completed) {
          if (self.ended) {
            ctx.db.objectMotion.objectId.update({
              ...row,
              state: JSON.stringify({ ...state, completed: true }),
            });
            run(ctx, id, "on_motion_end");
            events++;
            if (++delivered > 64)
              throw Error("View event delivery budget exceeded.");
            continue;
          }
          next = Math.min(next, self.next);
        }
        const views = ctx.db.objectViews.objectId.find(id);
        if (!views) continue;
        const definitions: Record<string, ViewDefinition> = JSON.parse(
            views.definitions,
          ),
          previous: Record<
            string,
            Array<{ id: string; kind: string; tags: string[] }>
          > = JSON.parse(views.members);
        const current: typeof previous = {};
        const changes: Array<[string, string, unknown]> = [];
        for (const [name, view] of Object.entries(definitions)) {
          next = Math.min(next, self.next);
          current[name] = [];
          for (const e of all) {
            if (
              e.id === prop.objectId ||
              !view.include.some((f) =>
                f === "player"
                  ? e.kind === "player"
                  : e.tags.includes(f.slice(4)),
              )
            )
              continue;
            const intersection = viewIntersection(view, self, e.trajectory);
            next = Math.min(next, e.trajectory.next, intersection.next);
            if (intersection.inside)
              current[name].push({ id: e.id, kind: e.kind, tags: e.tags });
          }
          for (const e of previous[name] ?? [])
            if (!current[name].some((n) => n.id === e.id))
              changes.push(["on_view_exit", name, e]);
          for (const e of current[name])
            if (!(previous[name] ?? []).some((n) => n.id === e.id))
              changes.push(["on_view_enter", name, e]);
        }
        if (changes.length) {
          ctx.db.objectViews.objectId.update({
            ...views,
            members: JSON.stringify(current),
          });
          for (const [event, name, e] of changes) {
            if (++delivered > 64)
              throw Error("View event delivery budget exceeded.");
            run(ctx, id, event, [name, e]);
            events++;
          }
        }
      }
      if (!events) {
        stable = true;
        break;
      }
    }
    if (!stable) throw Error("View event cascade budget exceeded.");
    for (const old of ctx.db.intelligenceEvent.roomId.filter(roomId))
      ctx.db.intelligenceEvent.scheduledId.delete(old.scheduledId);
    const clock = ctx.db.intelligenceClock.roomId.find(roomId),
      generation = (clock?.generation ?? 0n) + 1n;
    const window = Math.floor(Number(ctx.timestamp.microsSinceUnixEpoch) / 1e6);
    const ticks =
      (clock?.window === window ? clock.ticks : 0) + (at === undefined ? 0 : 1);
    if (ticks > 128)
      throw Error("Room scheduling budget exceeded (128 events/second).");
    const nextClock = { roomId, generation, window, ticks };
    if (clock) ctx.db.intelligenceClock.roomId.update(nextClock);
    else ctx.db.intelligenceClock.insert(nextClock);
    if (Number.isFinite(next)) {
      // Evaluate just after the analytic crossing, avoiding repeated boundary events.
      const due = Math.floor((now + Math.max(0, next)) * 1000) / 1000 + 0.001;
      ctx.db.intelligenceEvent.insert({
        scheduledId: 0n,
        roomId,
        generation,
        at: due,
        scheduledAt: ScheduleAt.time(BigInt(Math.round(due * 1e6))),
      });
    }
  } catch (error) {
    // Faulting event cascades must not trap player movement or retry endlessly.
    for (const row of ctx.db.objectViews.roomId.filter(roomId)) {
      ctx.db.objectViews.objectId.update({
        ...row,
        definitions: "{}",
        members: "{}",
      });
      const o = ctx.db.communityObject.id.find(row.objectId);
      if (o)
        ctx.db.communityObject.id.update({
          ...o,
          lastError: `Views disabled: ${String(error)}`.slice(0, 1000),
        });
    }
    for (const event of ctx.db.intelligenceEvent.roomId.filter(roomId))
      ctx.db.intelligenceEvent.scheduledId.delete(event.scheduledId);
  } finally {
    running.delete(ctx);
    logicalTimes.delete(ctx);
  }
}
