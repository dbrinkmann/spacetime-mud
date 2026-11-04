import {
  pathTrajectory,
  viewIntersection,
  type Trajectory,
  type SensedEntity,
} from "../intelligent-objects";
import type { Vec3 } from "../geometry";
import type { RuntimeStore } from "./store";
import type { Entity } from "./contracts";
import { operationProgress, sampleOperation } from "./operations";
export function queryRoom(
  store: RuntimeStore,
  entity: Entity,
  now: number,
  view: import("../intelligent-objects").ViewDefinition,
) {
  const self = entityTrajectory(store, entity, now);
  const candidates: SensedEntity[] = [
    ...store.players(entity.property, entity.room, now),
    ...store
      .roomEntities(entity.property, entity.room)
      .filter((e) => e.components.visibility !== false)
      .map((e) => ({
        id: e.id,
        kind: "object" as const,
        tags: (e.components.tags ?? []) as string[],
        trajectory: entityTrajectory(store, e, now),
      })),
  ];
  return candidates
    .filter(
      (e) =>
        e.id !== entity.id &&
        view.include.some((f) =>
          f === "player" ? e.kind === "player" : e.tags.includes(f.slice(4)),
        ) &&
        viewIntersection(view, self, e.trajectory, false).inside,
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 64)
    .map((e) => ({ id: e.id, kind: e.kind, position: e.trajectory.position }));
}
export function entityTrajectory(
  store: RuntimeStore,
  e: Entity,
  now: number,
): Trajectory {
  const op = store.operations(e.id).find((o) => o.resource === "transform");
  const pose = (op ? sampleOperation(op, now) : e.components.transform) as
    { position: Vec3; rotation: Vec3 } | undefined;
  if (!op || op.paused)
    return {
      position: pose?.position ?? [0, 0, 0],
      velocity: [0, 0, 0],
      yaw: pose?.rotation[1] ?? 0,
      next: Infinity,
      distance: 0,
      total: 0,
      ended: true,
    };
  let points = (op.path ?? [op.from.position, op.to.position]) as Vec3[],
    progress = operationProgress(op, now);
  if (op.mode === "pingpong") {
    if (Math.floor(progress) % 2) points = [...points].reverse();
    progress %= 1;
  }
  const total = points
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot(...p.map((v, j) => v - points[i][j])),
      0,
    );
  const t = pathTrajectory(
    points,
    progress * total,
    (total / op.duration) * (op.speed ?? 1),
    op.mode === "loop",
  );
  if (!op.path) t.yaw = pose?.rotation[1] ?? 0;
  return t;
}
/** Predict linear crossings and segment turns, rather than ticking every frame. */
export function evaluateRoomViews(
  store: RuntimeStore,
  property: string,
  room: string,
  now: number,
  players: SensedEntity[],
  emit: (
    entity: string,
    slot: string,
    generation: number,
    name: string,
    payload: { view: string; entity: { id: string; kind: string } },
  ) => void,
) {
  const entities = store.roomEntities(property, room);
  const sensed: SensedEntity[] = [
    ...players,
    ...entities
      .filter((e) => e.components.visibility !== false)
      .map((e) => ({
        id: e.id,
        kind: "object" as const,
        tags: (e.components.tags ?? []) as string[],
        trajectory: entityTrajectory(store, e, now),
      })),
  ];
  let next = Infinity;
  for (const entity of entities)
    for (const view of store.views(entity.id)) {
      const slot = store.slot(view.slot);
      if (!slot?.enabled || slot.generation !== view.generation) {
        store.removeView(view.id);
        continue;
      }
      const self = entityTrajectory(store, entity, now),
        members: string[] = [];
      for (const target of sensed) {
        if (
          target.id === entity.id ||
          !view.definition.include.some((f) =>
            f === "player"
              ? target.kind === "player"
              : target.tags.includes(f.slice(4)),
          )
        )
          continue;
        const hit = viewIntersection(
          view.definition,
          self,
          target.trajectory,
          view.members.includes(target.id),
        );
        const horizon = Math.min(self.next, target.trajectory.next);
        next = Math.min(
          next,
          horizon,
          hit.next <= horizon ? hit.next : Infinity,
        );
        if (hit.inside) members.push(target.id);
      }
      if (
        store.pending(entity.id).length +
          members.filter((id) => !view.members.includes(id)).length +
          view.members.filter((id) => !members.includes(id)).length >
        64
      ) {
        next = Math.min(next, 0.1);
        continue;
      }
      for (const id of members.filter((id) => !view.members.includes(id)))
        emit(entity.id, slot.id, slot.generation, "enter", {
          view: view.name,
          entity: { id, kind: sensed.find((e) => e.id === id)!.kind },
        });
      for (const id of view.members.filter((id) => !members.includes(id)))
        emit(entity.id, slot.id, slot.generation, "exit", {
          view: view.name,
          entity: { id, kind: id.startsWith("player:") ? "player" : "object" },
        });
      if (JSON.stringify(members) !== JSON.stringify(view.members))
        store.putView({ ...view, members });
    }
  return Number.isFinite(next)
    ? now + Math.max(0.001, next + 0.00001)
    : Infinity;
}
