import { type Placement, type Vec3, worldPoint } from "./geometry";

export function samplePropMotion(prop: Placement, seconds: number) {
  if (!prop.motion) return { position: prop.position, yaw: prop.yaw };
  const motion = prop.motion;
  const points = motion.points.map((p) => worldPoint(prop, p));
  const sequence =
    motion.mode === "loop"
      ? [...points, points[0]]
      : motion.mode === "once"
        ? points
        : [...points, ...points.slice(0, -1).reverse()];
  const lengths = sequence
    .slice(1)
    .map((p, i) => Math.hypot(...p.map((v, j) => v - sequence[i][j])));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!total) return { position: points[0], yaw: prop.yaw };
  if (
    motion.mode === "once" &&
    (seconds + (motion.offset ?? 0)) * motion.speed >= total
  ) {
    const a = points[points.length - 2],
      b = points[points.length - 1];
    return {
      position: b,
      yaw: (Math.atan2(b[0] - a[0], b[2] - a[2]) * 180) / Math.PI,
    };
  }
  let distance =
    ((((seconds + (motion.offset ?? 0)) * motion.speed) % total) + total) %
    total;
  for (let i = 0; i < lengths.length; i++) {
    if (!lengths[i]) continue;
    if (distance <= lengths[i]) {
      const a = sequence[i],
        b = sequence[i + 1],
        t = distance / lengths[i];
      return {
        position: a.map((v, j) => v + (b[j] - v) * t) as Vec3,
        yaw: (Math.atan2(b[0] - a[0], b[2] - a[2]) * 180) / Math.PI,
      };
    }
    distance -= lengths[i];
  }
  return { position: points[0], yaw: prop.yaw };
}

export function homeSignText(
  fallback: string,
  spot: string | undefined,
  roomId: bigint,
  exits: Array<{ fromRoom: bigint; toRoom: bigint; entranceSpot: string }>,
  rooms: Array<{ id: bigint; propertyId: bigint }>,
  properties: Array<{ id: bigint; name: string }>,
) {
  if (!spot) return fallback;
  const exit = exits.find(
    (e) => e.fromRoom === roomId && e.entranceSpot === spot,
  );
  const destination = rooms.find((r) => r.id === exit?.toRoom);
  return (
    properties.find((p) => p.id === destination?.propertyId)?.name ?? fallback
  );
}
