import { type Room, type Character, type Vec3, worldPoint } from "./geometry";

// An empty room and neutral silhouette are fallbacks, not an asset catalog.
export function emptyRoom(
  name = "Unshaped space",
  description = "A place to make your own.",
): Room {
  return {
    version: 1,
    name,
    description,
    width: 12,
    depth: 10,
    floorColor: "#655c51",
    spawn: [0, 0, 3],
    models: { marker: { boxes: [] } },
    objects: [],
    lights: [],
  };
}
export function neutralCharacter(name: string): Character {
  const box = (size: Vec3, position: Vec3, color: string) => ({
    size,
    position,
    color,
  });
  return {
    version: 1,
    name,
    parts: {
      head: [box([0.46, 0.46, 0.44], [0, 0.23, 0], "#cfb999")],
      torso: [box([0.55, 0.55, 0.32], [0, 0.08, 0], "#658078")],
      leftArm: [box([0.18, 0.6, 0.22], [0, -0.3, 0], "#658078")],
      rightArm: [box([0.18, 0.6, 0.22], [0, -0.3, 0], "#658078")],
      leftLeg: [box([0.23, 0.76, 0.28], [0, -0.38, 0], "#47464c")],
      rightLeg: [box([0.23, 0.76, 0.28], [0, -0.38, 0], "#47464c")],
    },
    cosmetics: [],
  };
}
export type Motion = {
  path: Vec3[];
  started: number;
  pose: string;
  seat: string;
  yaw: number;
};
export const walkSpeed = 1.8;
export function sampleMotion(m: Motion, room: Room, now: number) {
  let remaining = Math.max(0, (now - m.started) / 1000) * walkSpeed;
  let position: Vec3 = m.path[0] ?? room.spawn,
    yaw = m.yaw;
  for (let i = 1; i < m.path.length; i++) {
    const a = m.path[i - 1],
      b = m.path[i],
      length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (length > 0) yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
    if (remaining < length) {
      const f = remaining / length;
      return {
        position: [
          a[0] + (b[0] - a[0]) * f,
          0,
          a[2] + (b[2] - a[2]) * f,
        ] as Vec3,
        yaw,
        animation: "walk" as const,
      };
    }
    remaining -= length;
    position = b;
  }
  const o = room.objects.find((o) => o.id === m.seat);
  if (o?.seat) {
    const p = worldPoint(o, o.seat.position);
    return {
      position: [p[0], p[1] - 0.76, p[2]] as Vec3,
      yaw: ((o.yaw + o.seat.yaw) * Math.PI) / 180,
      animation: "sit" as const,
    };
  }
  const animation: "wave" | "talk" | "idle" =
    m.pose === "wave" || m.pose === "talk" ? m.pose : "idle";
  return { position, yaw, animation };
}
