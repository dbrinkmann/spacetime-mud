import { entranceRoom } from "./entrance-fixture.ts";
import { neutralCharacter } from "../shared/world.ts";
export function builderRoom() {
  const room = entranceRoom("Neon courtyard");
  room.signs = [
    {
      id: "welcome-sign",
      text: "Tokyo\n\u6771\u4eac",
      position: [0, 3.2, -3],
      yaw: 0,
      width: 3.5,
      height: 1.2,
      color: "#66ffcc",
      background: "#102030",
      emissive: true,
    },
  ];
  room.npcs = [
    {
      id: "receptionist",
      character: neutralCharacter("Receptionist"),
      position: [1, 0, -1],
      yaw: 0,
      animation: "wave",
    },
  ];
  room.models.wall = {
    boxes: [{ position: [0, 1.5, 0], size: [10, 3, 0.25], color: "#544267" }],
  };
  room.objects.push({
    id: "back-wall",
    name: "Back wall",
    model: "wall",
    position: [0, 0, -4],
    yaw: 0,
    wall: true,
  });
  room.objects.push({
    id: "front-wall",
    name: "Front wall",
    model: "wall",
    position: [0, 0, 4],
    yaw: 0,
    wall: true,
  });
  return room;
}
