import { type Placement, type Vec3, worldPoint } from "./geometry";
export type MotionState = {
  distance: number;
  started: number;
  speed: number;
  paused: boolean;
  visible: boolean;
  completed: boolean;
};
export type Trajectory = {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  next: number;
  distance: number;
  total: number;
  ended: boolean;
};
export type ViewDefinition = {
  frame: "self" | "room";
  box: { center: Vec3; size: [number, number] };
  include: string[];
};
export type SensedEntity = {
  id: string;
  kind: "player" | "object";
  tags: string[];
  trajectory: Trajectory;
};
export function pathTrajectory(
  points: Vec3[],
  distance: number,
  speed: number,
  loop = false,
): Trajectory {
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(...p.map((v, j) => v - points[i][j])));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!loop && total > 0 && distance >= total) {
    let last = lengths.length - 1;
    while (last > 0 && lengths[last] === 0) last--;
    const a = points[last],
      b = points[last + 1];
    return {
      position: points[points.length - 1],
      velocity: [0, 0, 0],
      yaw: (Math.atan2(b[0] - a[0], b[2] - a[2]) * 180) / Math.PI,
      next: Infinity,
      distance: total,
      total,
      ended: true,
    };
  }
  let d =
    loop && total
      ? ((distance % total) + total) % total
      : Math.min(Math.max(distance, 0), total);
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i];
    if (!length) continue;
    if (d < length || i === lengths.length - 1) {
      const a = points[i],
        b = points[i + 1],
        ended = !loop && distance >= total;
      const direction = b.map((v, j) => (v - a[j]) / length) as Vec3;
      return {
        position: a.map((v, j) => v + direction[j] * d) as Vec3,
        velocity: direction.map((v) => v * (ended ? 0 : speed)) as Vec3,
        yaw: (Math.atan2(direction[0], direction[2]) * 180) / Math.PI,
        next: ended || speed <= 0 ? Infinity : (length - d) / speed,
        distance:
          loop && total
            ? ((distance % total) + total) % total
            : Math.min(distance, total),
        total,
        ended,
      };
    }
    d -= length;
  }
  return {
    position: points[0] ?? [0, 0, 0],
    velocity: [0, 0, 0],
    yaw: 0,
    next: Infinity,
    distance: 0,
    total,
    ended: true,
  };
}
export function propTrajectory(
  prop: Placement,
  state: MotionState,
  now: number,
): Trajectory {
  if (!prop.motion)
    return { ...pathTrajectory([prop.position], 0, 0), yaw: prop.yaw };
  const points = prop.motion.points.map((p) => worldPoint(prop, p));
  const path =
    prop.motion.mode === "loop"
      ? [...points, points[0]]
      : prop.motion.mode === "pingpong"
        ? [...points, ...points.slice(0, -1).reverse()]
        : points;
  return pathTrajectory(
    path,
    state.distance +
      (state.paused ? 0 : Math.max(0, now - state.started) * state.speed),
    state.paused ? 0 : state.speed,
    prop.motion.mode !== "once",
  );
}
export function validateView(value: unknown): ViewDefinition {
  const v = value as ViewDefinition;
  if (
    !v ||
    !["self", "room"].includes(v.frame) ||
    !v.box ||
    !Array.isArray(v.box.center) ||
    v.box.center.length !== 3 ||
    v.box.center.some((n) => !Number.isFinite(n) || Math.abs(n) > 100) ||
    !Array.isArray(v.box.size) ||
    v.box.size.length !== 2 ||
    v.box.size.some((n) => !Number.isFinite(n) || n < 0.1 || n > 50) ||
    !Array.isArray(v.include) ||
    !v.include.length ||
    v.include.length > 8 ||
    v.include.some(
      (s) =>
        typeof s !== "string" ||
        !/^(player|tag:[a-zA-Z][a-zA-Z0-9_-]{0,39})$/.test(s),
    )
  )
    throw Error(
      "Invalid view: bounded self/room rectangle and player/tag filters required.",
    );
  return v;
}
// Slab intersection of relative linear motion, valid until either trajectory turns.
export function viewIntersection(
  view: ViewDefinition,
  self: Trajectory,
  entity: Trajectory,
) {
  const angle = view.frame === "self" ? (self.yaw * Math.PI) / 180 : 0,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const origin = view.frame === "self" ? self.position : [0, 0, 0];
  const dx = entity.position[0] - origin[0],
    dz = entity.position[2] - origin[2];
  const vx =
      entity.velocity[0] - (view.frame === "self" ? self.velocity[0] : 0),
    vz = entity.velocity[2] - (view.frame === "self" ? self.velocity[2] : 0);
  const p = [
      dx * c - dz * s - view.box.center[0],
      dx * s + dz * c - view.box.center[2],
    ],
    v = [vx * c - vz * s, vx * s + vz * c];
  let enter = -Infinity,
    exit = Infinity;
  for (let i = 0; i < 2; i++) {
    const half = view.box.size[i] / 2;
    if (Math.abs(v[i]) < 1e-12) {
      if (Math.abs(p[i]) > half + 1e-9)
        return { inside: false, next: Infinity };
      continue;
    }
    const a = (-half - p[i]) / v[i],
      b = (half - p[i]) / v[i];
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
  }
  if (exit <= enter || exit < 0) return { inside: false, next: Infinity };
  const inside = enter <= 1e-7 && exit > 1e-7;
  return { inside, next: inside ? exit : enter > 1e-7 ? enter : Infinity };
}
