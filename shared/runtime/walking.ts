import type { Entity } from "./contracts";
import type { Vec3 } from "../geometry";
import { route, walkable, type NavigationRoom } from "../navigation";
import { pathTrajectory } from "../intelligent-objects";
export function walkerTrajectory(w: Walker, now: number) {
  const elapsed = Math.max(0, now - w.walk.started),
    duration = walkDuration(w.walk);
  const phase = w.away ? elapsed % (duration + 10) : elapsed;
  const trajectory = pathTrajectory(
    [w.walk.start, ...w.walk.points],
    phase * w.walk.speed,
    w.walk.speed,
  );
  if (w.away && trajectory.ended) trajectory.next = duration + 10 - phase;
  return trajectory;
}
export type Walk = {
  start: Vec3;
  points: Vec3[];
  started: number;
  speed: number;
};
export type Walker = {
  name?: string;
  gesture?: { animation: "wave" | "talk"; until: number };
  away?: boolean;
  character?: import("../geometry").Character;
  seat?: string;
  id: string;
  property: string;
  room: string;
  walk: Walk;
  action?: { entity: string; name: string; generation: number };
  error?: string;
};
export function walkerPosition(walker: Walker, now: number): Vec3 {
  if (!walker.away) return walkPosition(walker.walk, now);
  const period = walkDuration(walker.walk) + 10;
  return walkPosition(
    {
      ...walker.walk,
      started: now - (Math.max(0, now - walker.walk.started) % period),
    },
    now,
  );
}
export function walkDuration(walk: Walk) {
  let distance = 0,
    last = walk.start;
  for (const p of walk.points) {
    distance += Math.hypot(p[0] - last[0], p[2] - last[2]);
    last = p;
  }
  return distance / walk.speed;
}
export function walkPosition(walk: Walk, now: number): Vec3 {
  let remaining = Math.max(0, now - walk.started) * walk.speed,
    last = walk.start;
  for (const p of walk.points) {
    const length = Math.hypot(p[0] - last[0], p[2] - last[2]);
    if (remaining < length)
      return [
        last[0] + ((p[0] - last[0]) * remaining) / length,
        0,
        last[2] + ((p[2] - last[2]) * remaining) / length,
      ];
    remaining -= length;
    last = p;
  }
  return [...last];
}
export function navigationScene(
  entities: Entity[],
): NavigationRoom & { spawn: Vec3 } {
  const surfaces = entities.filter(
    (e) => e.enabled && e.components.walkSurface,
  );
  if (surfaces.length !== 1) throw Error("Room needs exactly one walkSurface.");
  const floor = surfaces[0].components.walkSurface as {
    width: number;
    depth: number;
    spawn: Vec3;
  };
  return {
    ...floor,
    objects: entities
      .filter((e) => e.enabled && (e.components.collider as any)?.enabled)
      .map((e) => {
        const c = e.components.collider as { size: number[]; center: Vec3 },
          t = e.components.transform as
            { position: Vec3; rotation: Vec3 } | undefined;
        const yaw = t?.rotation[1] ?? 0,
          angle = (yaw * Math.PI) / 180;
        return {
          position: [
            (t?.position[0] ?? 0) +
              c.center[0] * Math.cos(angle) +
              c.center[2] * Math.sin(angle),
            0,
            (t?.position[2] ?? 0) -
              c.center[0] * Math.sin(angle) +
              c.center[2] * Math.cos(angle),
          ] as Vec3,
          yaw,
          collision: [c.size[0], c.size[1]] as [number, number],
        };
      }),
  };
}
export function planWalk(
  scene: NavigationRoom,
  start: Vec3,
  end: Vec3,
  now: number,
): Walk {
  const points = route(scene, start, end);
  if (!points) throw Error("No walkable route to that point.");
  return { start, points, started: now, speed: 2.5 };
}
export function approachPoint(entity: Entity): Vec3 {
  const interaction = entity.components.interaction as
    { approach: Vec3 } | undefined;
  if (!interaction) throw Error("Object has no interaction approach.");
  const t = entity.components.transform as
    { position: Vec3; rotation: Vec3 } | undefined;
  const a = interaction.approach,
    yaw = ((t?.rotation[1] ?? 0) * Math.PI) / 180;
  return [
    (t?.position[0] ?? 0) + a[0] * Math.cos(yaw) + a[2] * Math.sin(yaw),
    0,
    (t?.position[2] ?? 0) - a[0] * Math.sin(yaw) + a[2] * Math.cos(yaw),
  ];
}
export { walkable };
