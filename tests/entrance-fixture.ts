import { emptyRoom } from "../shared/world.ts";
export function entranceRoom(name = "Welcome") {
  const room = emptyRoom(name);
  room.models.door = {
    boxes: [
      { position: [0, 1, 0], size: [1.2, 2, 0.15], color: "#725034" },
      { position: [-0.7, 1.1, 0], size: [0.2, 2.2, 0.3], color: "#c5ac7a" },
      { position: [0.7, 1.1, 0], size: [0.2, 2.2, 0.3], color: "#c5ac7a" },
      { position: [0, 2.2, 0], size: [1.6, 0.2, 0.3], color: "#c5ac7a" },
    ],
  };
  room.objects = [0, 1].map((i) => ({
    id: `door-${i}`,
    name: `Garden door ${i + 1}`,
    model: "door",
    position: [i * 4 - 2, 0, -3],
    yaw: 0,
    collision: [1.6, 0.3],
    homeEntrance: { approach: [0, 0, 1] },
  }));
  return room;
}
