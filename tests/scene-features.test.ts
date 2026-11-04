import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDefinition,
  type Placement,
  surfaceMaterials,
} from "../shared/geometry.ts";
import { samplePropMotion, homeSignText } from "../shared/scene-features.ts";
import { entranceRoom } from "./entrance-fixture.ts";
import { surfaceMaterial } from "../client/world/materials.ts";
const car: Placement = {
  id: "car",
  name: "Car",
  model: "car",
  position: [0, 0, 0],
  yaw: 0,
  motion: {
    points: [
      [-4, 0, 0],
      [4, 0, 0],
    ],
    speed: 2,
    mode: "pingpong",
  },
};
test("prop motion travels, reverses and repeats deterministically", () => {
  assert.deepEqual(samplePropMotion(car, 0).position, [-4, 0, 0]);
  assert.deepEqual(samplePropMotion(car, 2).position, [0, 0, 0]);
  assert.deepEqual(samplePropMotion(car, 5).position, [2, 0, 0]);
  assert.equal(samplePropMotion(car, 5).yaw, -90);
  assert.deepEqual(samplePropMotion(car, 8), samplePropMotion(car, 0));
  const shifted = { ...car, motion: { ...car.motion!, offset: 2 } };
  assert.deepEqual(samplePropMotion(shifted, 0), samplePropMotion(car, 2));
});
test("surface presets preserve plain colors and glass opts into transparency", () => {
  const b = {
    position: [0, 0, 0] as [number, number, number],
    size: [1, 1, 1] as [number, number, number],
    color: "#292d31",
  };
  const plain = surfaceMaterial(b);
  assert.equal(plain.color.getHexString(), "292d31");
  for (const material of surfaceMaterials) {
    const m = surfaceMaterial({ ...b, material });
    assert.equal(m.transparent, material === "glass");
    m.dispose();
  }
  plain.dispose();
});
test("authoring validates materials, moving-prop restrictions and sign references", () => {
  const scene = entranceRoom();
  scene.models.car = {
    boxes: [
      {
        position: [0, 0.5, 0],
        size: [1, 1, 2],
        color: "#aabbcc",
        material: "metal",
      },
    ],
  };
  scene.objects.push(structuredClone(car));
  scene.signs = [
    {
      id: "home-sign",
      text: "Available",
      binding: { kind: "homeName", entranceSpot: "door-0" },
      position: [-2, 2.5, -3],
      yaw: 0,
      width: 2,
      height: 0.4,
      color: "#ffffff",
    },
  ];
  assert.doesNotThrow(() => parseDefinition(JSON.stringify(scene), "room"));
  scene.objects.at(-1)!.collision = [1, 2];
  assert.throws(
    () => parseDefinition(JSON.stringify(scene), "room"),
    /cannot have collision/,
  );
  delete scene.objects.at(-1)!.collision;
  scene.objects.at(-1)!.motion!.points[0] = [100, 0, 0];
  assert.throws(() => parseDefinition(JSON.stringify(scene), "room"), /bounds/);
  scene.objects.pop();
  scene.signs[0].binding!.entranceSpot = "missing";
  assert.throws(
    () => parseDefinition(JSON.stringify(scene), "room"),
    /home entrance/,
  );
});
test("bound signs follow home names and revert to fallback after unlinking", () => {
  const exits = [{ fromRoom: 1n, toRoom: 2n, entranceSpot: "door" }],
    rooms = [{ id: 2n, propertyId: 3n }],
    properties = [{ id: 3n, name: "Cloudglass" }];
  assert.equal(
    homeSignText("Available", "door", 1n, exits, rooms, properties),
    "Cloudglass",
  );
  properties[0].name = "New name";
  assert.equal(
    homeSignText("Available", "door", 1n, exits, rooms, properties),
    "New name",
  );
  assert.equal(
    homeSignText("Available", "door", 1n, [], rooms, properties),
    "Available",
  );
  assert.equal(
    homeSignText("Available", "door", 5n, exits, rooms, properties),
    "Available",
  );
});

test("sign attachments reference actual placements", () => {
  const room = entranceRoom();
  room.signs = [
    {
      id: "sign",
      text: "Welcome",
      attachTo: "door-0",
      position: [0, 2.5, 0.2],
      yaw: 0,
      width: 2,
      height: 0.4,
      color: "#ffffff",
    },
  ];
  assert.doesNotThrow(() => parseDefinition(JSON.stringify(room), "room"));
  room.signs[0].attachTo = "missing";
  assert.throws(
    () => parseDefinition(JSON.stringify(room), "room"),
    /placement does not exist/,
  );
});
