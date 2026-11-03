import { writeFileSync } from "node:fs";
import { parseDefinition, type Box, type Room } from "../../shared/geometry.ts";
import { validateNavigation } from "../../shared/navigation.ts";
const box = (
  position: Box["position"],
  size: Box["size"],
  color: string,
  extra: Partial<Box> = {},
): Box => ({ position, size, color, ...extra });
const ivory = "#b9b8c6",
  dark = "#33364e",
  gold = "#d4ad65",
  blue = "#4d769c";
const room: Room = {
  version: 1,
  name: "The Nexus",
  description:
    "An open hall of pale stone and midnight-blue inlay. A lantern-crowned arch shimmers with warm light: beyond it waits The Lantern Above. Rest on a bench, greet a traveler, or step into the next story.",
  width: 14,
  depth: 12,
  floorColor: "#777d91",
  spawn: [0, 0, 4],
  models: {},
  objects: [],
  lights: [],
};
const model = (id: string, boxes: Box[]) => (room.models[id] = { boxes });
function place(
  id: string,
  name: string,
  model: string,
  position: Box["position"],
  extra: Partial<Room["objects"][number]> = {},
) {
  room.objects.push({ id, name, model, position, yaw: 0, ...extra });
}
model("foundation", [
  box([0, -0.32, 0], [14, 0.55, 12], ivory),
  box([0, -0.65, 0], [13.4, 0.18, 11.4], gold),
  box([0, -0.9, 0], [12.8, 0.35, 10.8], dark),
]);
place(
  "foundation",
  "The meeting place between worlds",
  "foundation",
  [0, 0, 0],
);
model("carpet", [
  box([0, 0.025, 0], [3.3, 0.04, 8.8], gold),
  box([0, 0.05, 0], [3.05, 0.02, 8.55], "#293c61"),
]);
place("arrival-path", "The midnight path", "carpet", [0, 0, 0.25]);
model("compass", [
  box([0, 0.08, 0], [2.4, 0.04, 2.4], gold, { rotation: [0, 45, 0] }),
  box([0, 0.11, 0], [2.14, 0.02, 2.14], blue, { rotation: [0, 45, 0] }),
  box([0, 0.14, 0], [0.18, 0.04, 2.5], "#d5e7e8"),
  box([0, 0.14, 0], [2.5, 0.04, 0.18], "#d5e7e8"),
  box([0, 0.17, 0], [0.55, 0.05, 0.55], gold, { rotation: [0, 45, 0] }),
]);
place("compass", "Compass of beginnings", "compass", [0, 0, 1.4]);
const arch: Box[] = [];
for (const side of [-1, 1]) {
  arch.push(
    box([side * 1.65, 0.2, 0], [1, 0.4, 1.15], dark),
    box([side * 1.65, 0.48, 0], [0.82, 0.16, 1], gold),
    box([side * 1.65, 1.9, 0], [0.6, 2.7, 0.72], ivory),
    box([side * 1.65, 3.3, 0], [0.95, 0.25, 1], gold),
  );
  for (let i = 0; i < 5; i++)
    arch.push(
      box(
        [side * 1.65, 0.95 + i * 0.43, 0.39],
        [0.18, 0.12, 0.045],
        "#95e3dd",
        { emissive: true },
      ),
    );
}
arch.push(
  box([0, 3.58, 0], [3.75, 0.38, 0.8], ivory),
  box([0, 3.84, 0], [3.2, 0.14, 1], gold),
  box([0, 4.05, 0], [1.3, 0.3, 0.7], dark),
  box([0, 4.35, 0], [0.65, 0.34, 0.5], gold),
  box([0, 2, 0], [2.65, 3, 0.2], "#335f80", { emissive: true }),
);
for (let i = 0; i < 11; i++)
  arch.push(
    box(
      [(((i * 7) % 9) - 4) * 0.23, 0.9 + ((i * 3) % 7) * 0.35, 0.16],
      [0.13 + (i % 3) * 0.05, 0.13 + (i % 3) * 0.05, 0.035],
      i % 2 ? "#8ce8e0" : "#d7ffff",
      { rotation: [0, 0, 45], emissive: true },
    ),
  );
arch.push(
  box([0, 2.1, 0.2], [0.5, 0.5, 0.06], "#ffe6ad", {
    rotation: [0, 0, 45],
    emissive: true,
  }),
);
arch.push(
  box([0, 4.02, 0.42], [0.36, 0.52, 0.22], "#ffe2a1", { emissive: true }),
  box([0, 0.15, 0.45], [3, 0.25, 1.35], dark),
  box([0, 0.29, 0.6], [2.7, 0.04, 0.95], gold),
);
model("portal", arch);
place("lantern-portal", "Portal to The Lantern Above", "portal", [0, 0, -3.8], {
  collision: [4.2, 1.6],
});
model("pillar", [
  box([0, 0.2, 0], [1.15, 0.4, 1.15], dark),
  box([0, 0.48, 0], [1, 0.16, 1], gold),
  box([0, 1.8, 0], [0.65, 2.5, 0.65], ivory),
  box([0, 3.1, 0], [1.1, 0.2, 1.1], gold),
  box([0, 3.45, 0], [0.68, 0.5, 0.68], blue),
  box([0, 3.8, 0], [0.3, 0.3, 0.3], "#a4ece7", {
    rotation: [0, 45, 45],
    emissive: true,
  }),
]);
for (const [id, x, z] of [
  ["nw", -5.6, -4.5],
  ["ne", 5.6, -4.5],
  ["sw", -5.6, 4.5],
  ["se", 5.6, 4.5],
] as const)
  place(`pillar-${id}`, "Starlit marble pillar", "pillar", [x, 0, z], {
    collision: [1.2, 1.2],
  });
model("bench", [
  box([0, 0.57, 0], [1.9, 0.18, 0.82], blue),
  box([0, 0.95, -0.34], [1.9, 0.68, 0.15], dark),
  box([0, 1.32, -0.34], [2, 0.09, 0.2], gold),
  box([-0.68, 0.25, 0], [0.25, 0.5, 0.65], ivory),
  box([0.68, 0.25, 0], [0.25, 0.5, 0.65], ivory),
]);
place("bench-west", "West travelers bench", "bench", [-4.2, 0, 0], {
  yaw: 90,
  collision: [1.9, 0.9],
  seat: { position: [0, 0.66, 0], approach: [0, 0, 1.1], yaw: 0 },
});
place("bench-east", "East travelers bench", "bench", [4.2, 0, 0], {
  yaw: -90,
  collision: [1.9, 0.9],
  seat: { position: [0, 0.66, 0], approach: [0, 0, 1.1], yaw: 0 },
});
model("brazier", [
  box([0, 0.12, 0], [0.75, 0.24, 0.75], dark),
  box([0, 0.65, 0], [0.2, 1, 0.2], gold),
  box([0, 1.2, 0], [0.75, 0.16, 0.75], gold),
  box([0, 1.48, 0], [0.4, 0.45, 0.4], "#ffcc82", { emissive: true }),
  box([0, 1.8, 0], [0.19, 0.22, 0.19], "#fff0bb", { emissive: true }),
]);
for (const [i, x, z] of [
  [0, -3.4, -2.9],
  [1, 3.4, -2.9],
] as const) {
  place(`brazier-${i}`, "Welcome flame", "brazier", [x, 0, z], {
    collision: [0.8, 0.8],
  });
  room.lights.push({ position: [x, 1.9, z], color: "#ffd197", intensity: 14 });
}
model("rail", [
  box([0, 0.5, 0], [2.4, 0.18, 0.25], ivory),
  box([-1.1, 0.28, 0], [0.18, 0.56, 0.3], dark),
  box([1.1, 0.28, 0], [0.18, 0.56, 0.3], dark),
  box([0, 0.62, 0], [2.5, 0.08, 0.34], gold),
]);
for (const [id, x] of [
  ["left", -4.3],
  ["right", 4.3],
] as const)
  place(`rail-${id}`, "Balustrade", "rail", [x, 0, -5.55], {
    collision: [2.5, 0.35],
  });
model("garden", [
  box([0, 0.16, 0], [1.4, 0.32, 1.1], ivory),
  box([0, 0.35, 0], [1.5, 0.1, 1.2], gold),
  box([0, 0.5, 0], [1.25, 0.25, 0.95], "#476b64"),
  box([-0.35, 0.77, 0], [0.5, 0.4, 0.5], "#719b85"),
  box([0.28, 0.86, 0], [0.5, 0.55, 0.5], "#91b59a"),
  box([0.28, 1.19, 0], [0.18, 0.15, 0.18], "#e4b9cb"),
]);
place("garden-west", "Moonflower planter", "garden", [-4.2, 0, 2.7], {
  collision: [1.5, 1.2],
});
place("garden-east", "Moonflower planter", "garden", [4.2, 0, 2.7], {
  collision: [1.5, 1.2],
});
room.lights.push(
  { position: [0, 2.5, -3], color: "#81d9e9", intensity: 15 },
  { position: [0, 4, 2], color: "#b8c9ec", intensity: 9 },
);
parseDefinition(JSON.stringify(room), "room");
validateNavigation(room);
writeFileSync(
  new URL("./room.json", import.meta.url),
  JSON.stringify(room, null, 2) + "\n",
);
console.log("Validated Nexus geometry and navigation.");
