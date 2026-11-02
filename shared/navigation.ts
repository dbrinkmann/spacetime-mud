import { type Room, type Vec3, worldPoint, ContractError } from "./geometry";
export const radius = 0.23;
export function walkable(room: Room, x: number, z: number) {
  if (
    Math.abs(x) > room.width / 2 - radius ||
    Math.abs(z) > room.depth / 2 - radius
  )
    return false;
  return !room.objects.some((o) => {
    if (!o.collision) return false;
    const r = (-o.yaw * Math.PI) / 180,
      dx = x - o.position[0],
      dz = z - o.position[2],
      lx = dx * Math.cos(r) + dz * Math.sin(r),
      lz = -dx * Math.sin(r) + dz * Math.cos(r);
    return (
      Math.abs(lx) < o.collision[0] / 2 + radius &&
      Math.abs(lz) < o.collision[1] / 2 + radius
    );
  });
}
export function clearSegment(room: Room, a: Vec3, b: Vec3) {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.04),
  );
  for (let i = 0; i <= steps; i++)
    if (
      !walkable(
        room,
        a[0] + ((b[0] - a[0]) * i) / steps,
        a[2] + ((b[2] - a[2]) * i) / steps,
      )
    )
      return false;
  return true;
}
export function route(room: Room, start: Vec3, end: Vec3): Vec3[] | null {
  if (!walkable(room, start[0], start[2]) || !walkable(room, end[0], end[2]))
    return null;
  if (clearSegment(room, start, end)) return [end];
  const cell = 0.25,
    cols = Math.ceil(room.width / cell) + 1,
    rows = Math.ceil(room.depth / cell) + 1;
  const point = (id: number): Vec3 => [
    (id % cols) * cell - room.width / 2,
    0,
    Math.floor(id / cols) * cell - room.depth / 2,
  ];
  const index = (p: Vec3) =>
    Math.round((p[2] + room.depth / 2) / cell) * cols +
    Math.round((p[0] + room.width / 2) / cell);
  const a = index(start),
    b = index(end),
    prev = new Map<number, number>([[a, -1]]),
    queue = [a];
  for (let n = 0; n < queue.length; n++) {
    const id = queue[n];
    if (id === b) break;
    const x = id % cols,
      y = Math.floor(id / cols);
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const next = ny * cols + nx;
      if (prev.has(next)) continue;
      const p = point(next);
      if (
        !walkable(room, p[0], p[2]) ||
        !clearSegment(room, id === a ? start : point(id), p)
      )
        continue;
      prev.set(next, id);
      queue.push(next);
    }
  }
  if (!prev.has(b) || !clearSegment(room, point(b), end)) return null;
  const path: Vec3[] = [end];
  let id = b;
  while (id !== a) {
    path.push(point(id));
    id = prev.get(id)!;
  }
  return path.reverse();
}
export function validateNavigation(room: Room) {
  const errors: string[] = [];
  if (room.spawn[1] !== 0 || !walkable(room, room.spawn[0], room.spawn[2]))
    errors.push("spawn: must be on the floor in walkable space.");
  for (const o of room.objects) {
    if (!o.seat) continue;
    const approach = worldPoint(o, o.seat.approach),
      seat = worldPoint(o, o.seat.position);
    if (Math.abs(approach[1]) > 0.001)
      errors.push(`${o.id}.seat.approach: must meet the floor (world Y=0).`);
    if (seat[1] < 0.3 || seat[1] > 1.1)
      errors.push(
        `${o.id}.seat.position: seating surface must be 0.3…1.1 meters high.`,
      );
    if (!route(room, room.spawn, approach))
      errors.push(`${o.id}.seat.approach: unreachable from spawn.`);
  }
  if (errors.length) throw new ContractError(errors);
}
