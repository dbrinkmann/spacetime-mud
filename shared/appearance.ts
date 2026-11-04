import type { Box, Room } from "./geometry";
function structure(room: Room) {
  const copy = JSON.parse(JSON.stringify(room)) as Room;
  delete (copy as Partial<Room>).floorColor;
  delete copy.floorMaterial;
  delete copy.floorRoughness;
  delete copy.floorWear;
  const strip = (box: Box) => {
    for (const key of [
      "color",
      "material",
      "roughness",
      "wear",
      "emissive",
    ] as const)
      delete (box as Partial<Box>)[key];
  };
  for (const model of Object.values(copy.models)) model.boxes.forEach(strip);
  for (const npc of copy.npcs ?? []) {
    Object.values(npc.character.parts).forEach((boxes) => boxes.forEach(strip));
    npc.character.cosmetics.forEach((c) => c.boxes.forEach(strip));
  }
  // JSON member ordering is not a gameplay change. Array ordering stays strict.
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, v]) => [k, stable(v)]),
          )
        : v;
  return JSON.stringify(stable(copy));
}
export function assertAppearanceOnly(before: Room, after: Room) {
  if (structure(before) !== structure(after))
    throw Error(
      "Appearance-only publish rejected: only box color/material/roughness/wear/emissive and floor appearance may change. Geometry, links, signs, scripts, motion and metadata must remain unchanged.",
    );
}
