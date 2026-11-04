import {
  type Room,
  type Vec3,
  type Placement,
  worldPoint,
} from "../../shared/geometry";
import { route } from "../../shared/navigation";
export function interactionApproach(
  room: Room,
  start: Vec3,
  target: Pick<Placement, "position" | "yaw" | "collision">,
): Vec3 {
  for (const gap of [0.6, 1.2, 2]) {
    const candidates: Vec3[] = [];
    const x = (target.collision?.[0] ?? 0) / 2 + gap,
      z = (target.collision?.[1] ?? 0) / 2 + gap;
    for (const [dx, dz] of [
      [0, z],
      [x, 0],
      [0, -z],
      [-x, 0],
      [x, z],
      [-x, z],
      [x, -z],
      [-x, -z],
    ]) {
      const point = worldPoint(target as Placement, [dx, 0, dz]);
      point[1] = 0;
      candidates.push(point);
    }
    candidates.sort(
      (a, b) =>
        Math.hypot(a[0] - start[0], a[2] - start[2]) -
        Math.hypot(b[0] - start[0], b[2] - start[2]),
    );
    for (const point of candidates) if (route(room, start, point)) return point;
  }
  throw Error("There is no reachable place to approach this object.");
}
