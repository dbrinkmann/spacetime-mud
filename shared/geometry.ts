export type Vec3 = [number, number, number];
export const parts = [
  "head",
  "torso",
  "leftArm",
  "rightArm",
  "leftLeg",
  "rightLeg",
] as const;
export type Part = (typeof parts)[number];
// World Y is up, character forward is +Z. Units are meters; rotations are degrees.
export const pivots: Record<Part, Vec3> = {
  head: [0, 1.48, 0],
  torso: [0, 1.02, 0],
  leftArm: [0.36, 1.37, 0],
  rightArm: [-0.36, 1.37, 0],
  leftLeg: [0.16, 0.76, 0],
  rightLeg: [-0.16, 0.76, 0],
};
export const surfaceMaterials = [
  "plain",
  "asphalt",
  "concrete",
  "metal",
  "wood",
  "fabric",
  "glass",
] as const;
export type SurfaceMaterial = (typeof surfaceMaterials)[number];
export type Box = {
  material?: SurfaceMaterial;
  roughness?: number;
  wear?: number;
  position: Vec3;
  size: Vec3;
  rotation?: Vec3;
  color: string;
  emissive?: boolean;
};
export type Attachment = {
  name: string;
  parent: Part;
  position: Vec3;
  rotation?: Vec3;
  boxes: Box[];
};
export type Character = {
  version: 1;
  name: string;
  parts: Record<Part, Box[]>;
  cosmetics: Attachment[];
};
export type Model = { boxes: Box[] };
export type Seat = { position: Vec3; approach: Vec3; yaw: number };
export type PropMotion = {
  points: Vec3[];
  speed: number;
  mode: "loop" | "pingpong";
  offset?: number;
};
export type Placement = {
  motion?: PropMotion;
  id: string;
  name: string;
  model: string;
  position: Vec3;
  yaw: number;
  collision?: [number, number];
  seat?: Seat;
  wall?: boolean;
  objectId?: string;
  homeEntrance?: { approach: Vec3 };
  exit?: { id: string; approach: Vec3 };
};
export type Sign = {
  attachTo?: string;
  doubleSided?: boolean;
  binding?: { kind: "homeName"; entranceSpot: string };
  id: string;
  text: string;
  position: Vec3;
  yaw: number;
  width: number;
  height: number;
  color: string;
  background?: string;
  emissive?: boolean;
};
export type Npc = {
  objectId?: string;
  id: string;
  character: Character;
  position: Vec3;
  yaw: number;
  animation: "idle" | "talk" | "wave";
};
export type Room = {
  version: 1;
  name: string;
  description: string;
  width: number;
  depth: number;
  floorColor: string;
  floorMaterial?: SurfaceMaterial;
  floorRoughness?: number;
  floorWear?: number;
  spawn: Vec3;
  models: Record<string, Model>;
  objects: Placement[];
  signs?: Sign[];
  npcs?: Npc[];
  lights: { position: Vec3; color: string; intensity: number }[];
};
export class ContractError extends Error {
  constructor(public issues: string[]) {
    super(issues.join("\n"));
  }
}
type Obj = Record<string, unknown>;
export function validate(
  value: unknown,
  kind: "room" | "character",
): Room | Character {
  const errors: string[] = [];
  let boxes = 0,
    rendered = 0;
  const issue = (path: string, msg: string) => {
    if (errors.length < 30) errors.push(`${path}: ${msg}`);
  };
  const object = (v: unknown, path: string, fields: string[]): Obj => {
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      issue(path, "expected an object");
      return {};
    }
    const r = v as Obj;
    for (const k of Object.keys(r))
      if (!fields.includes(k)) issue(`${path}.${k}`, "unknown field");
    return r;
  };
  const num = (v: unknown, path: string, min: number, max: number) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
      issue(path, `expected a finite number in ${min}…${max}`);
  };
  const str = (v: unknown, path: string, max = 80) => {
    if (typeof v !== "string" || !v.trim() || v.length > max)
      issue(path, `expected text, 1…${max} characters`);
  };
  const color = (v: unknown, path: string) => {
    if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v))
      issue(path, "expected #RRGGBB");
  };
  const vector = (v: unknown, path: string, min = -50, max = 50, n = 3) => {
    if (!Array.isArray(v) || v.length !== n) {
      issue(path, `expected ${n} coordinates`);
      return;
    }
    v.forEach((x, i) => num(x, `${path}[${i}]`, min, max));
  };
  const list = (v: unknown, path: string, max: number): unknown[] => {
    if (!Array.isArray(v)) {
      issue(path, "expected an array");
      return [];
    }
    if (v.length > max) issue(path, `maximum ${max} entries`);
    return v.slice(0, max);
  };
  const box = (v: unknown, path: string, character = false) => {
    boxes++;
    const b = object(v, path, [
      "position",
      "size",
      "rotation",
      "color",
      "emissive",
      "material",
      "roughness",
      "wear",
    ]);
    vector(
      b.position,
      `${path}.position`,
      character ? -2 : -30,
      character ? 2 : 30,
    );
    vector(b.size, `${path}.size`, 0.01, character ? 2 : 30);
    if (b.rotation !== undefined)
      vector(b.rotation, `${path}.rotation`, -360, 360);
    color(b.color, `${path}.color`);
    if (
      b.material !== undefined &&
      !surfaceMaterials.includes(b.material as SurfaceMaterial)
    )
      issue(`${path}.material`, "unknown material");
    if (b.roughness !== undefined) num(b.roughness, `${path}.roughness`, 0, 1);
    if (b.wear !== undefined) num(b.wear, `${path}.wear`, 0, 1);

    if (b.emissive !== undefined && typeof b.emissive !== "boolean")
      issue(`${path}.emissive`, "expected boolean");
  };
  const root = object(
    value,
    kind,
    kind === "room"
      ? [
          "version",
          "name",
          "description",
          "width",
          "depth",
          "floorColor",
          "floorMaterial",
          "floorRoughness",
          "floorWear",
          "spawn",
          "models",
          "objects",
          "lights",
          "signs",
          "npcs",
        ]
      : ["version", "name", "parts", "cosmetics"],
  );
  if (root.version !== 1) issue("version", "only version 1 is supported");
  str(root.name, "name");
  if (kind === "character") {
    const body = object(root.parts, "parts", [...parts]);
    for (const p of parts) {
      const entries = list(body[p], `parts.${p}`, 80);
      if (!entries.length) issue(`parts.${p}`, "at least one box required");
      entries.forEach((b, i) => box(b, `parts.${p}[${i}]`, true));
    }
    list(root.cosmetics, "cosmetics", 24).forEach((v, i) => {
      const path = `cosmetics[${i}]`,
        a = object(v, path, [
          "name",
          "parent",
          "position",
          "rotation",
          "boxes",
        ]);
      str(a.name, `${path}.name`);
      if (!parts.includes(a.parent as Part))
        issue(`${path}.parent`, `choose ${parts.join(", ")}`);
      vector(a.position, `${path}.position`, -2, 2);
      if (a.rotation !== undefined)
        vector(a.rotation, `${path}.rotation`, -360, 360);
      list(a.boxes, `${path}.boxes`, 80).forEach((b, j) =>
        box(b, `${path}.boxes[${j}]`, true),
      );
    });
    if (boxes > 400)
      issue("character", "maximum 400 boxes including cosmetics");
  } else {
    str(root.description, "description", 1500);
    num(root.width, "width", 4, 100);
    num(root.depth, "depth", 4, 100);
    color(root.floorColor, "floorColor");
    if (
      root.floorMaterial !== undefined &&
      !surfaceMaterials.includes(root.floorMaterial as SurfaceMaterial)
    )
      issue("floorMaterial", "unknown material");
    if (root.floorRoughness !== undefined)
      num(root.floorRoughness, "floorRoughness", 0, 1);
    if (root.floorWear !== undefined) num(root.floorWear, "floorWear", 0, 1);
    vector(root.spawn, "spawn", -50, 50);
    const models =
      root.models &&
      typeof root.models === "object" &&
      !Array.isArray(root.models)
        ? (root.models as Obj)
        : {};
    if (!Object.keys(models).length || Object.keys(models).length > 64)
      issue("models", "provide 1…64 named models");
    for (const [id, m] of Object.entries(models).slice(0, 64)) {
      if (!/^[a-z][a-z0-9_-]{0,39}$/.test(id))
        issue(`models.${id}`, "use a lowercase identifier");
      const model = object(m, `models.${id}`, ["boxes"]);
      list(model.boxes, `models.${id}.boxes`, 120).forEach((b, i) =>
        box(b, `models.${id}.boxes[${i}]`),
      );
    }
    const ids = new Set<string>();
    list(root.objects, "objects", 120).forEach((v, i) => {
      const path = `objects[${i}]`,
        o = object(v, path, [
          "id",
          "name",
          "model",
          "position",
          "yaw",
          "collision",
          "seat",
          "wall",
          "objectId",
          "homeEntrance",
          "exit",
          "motion",
        ]);
      str(o.id, `${path}.id`, 40);
      str(o.name, `${path}.name`);
      if (ids.has(String(o.id))) issue(`${path}.id`, "duplicate ID");
      ids.add(String(o.id));
      if (
        typeof o.model !== "string" ||
        !Object.prototype.hasOwnProperty.call(models, o.model)
      )
        issue(`${path}.model`, "model does not exist");
      else
        rendered += Array.isArray((models[o.model] as Obj)?.boxes)
          ? ((models[o.model] as Obj).boxes as unknown[]).length
          : 0;
      vector(o.position, `${path}.position`);
      num(o.yaw, `${path}.yaw`, -360, 360);
      if (o.motion !== undefined) {
        const motion = object(o.motion, `${path}.motion`, [
          "points",
          "speed",
          "mode",
          "offset",
        ]);
        const points = list(motion.points, `${path}.motion.points`, 24);
        if (points.length < 2)
          issue(`${path}.motion.points`, "at least two points required");
        points.forEach((point, j) =>
          vector(point, `${path}.motion.points[${j}]`, -100, 100),
        );
        if (
          points.length >= 2 &&
          points.every(
            (p) =>
              Array.isArray(p) &&
              JSON.stringify(p) === JSON.stringify(points[0]),
          )
        )
          issue(path, "motion path must have length");
        num(motion.speed, `${path}.motion.speed`, 0.1, 20);
        if (!["loop", "pingpong"].includes(String(motion.mode)))
          issue(path, "motion mode must be loop or pingpong");
        if (motion.offset !== undefined)
          num(motion.offset, `${path}.motion.offset`, 0, 3600);
        if (
          o.collision ||
          o.seat ||
          o.objectId ||
          o.homeEntrance ||
          o.exit ||
          o.wall
        )
          issue(
            path,
            "moving props must be decorative, without collision, seats, interactions or cutaway walls",
          );
      }
      if (
        o.motion &&
        Array.isArray((o.motion as Obj).points) &&
        Array.isArray(o.position)
      ) {
        for (const point of (o.motion as Obj).points as Vec3[]) {
          if (!Array.isArray(point) || point.length !== 3) continue;
          const p = worldPoint(o as Placement, point);
          if (
            Math.abs(p[0]) > Number(root.width) / 2 ||
            Math.abs(p[2]) > Number(root.depth) / 2 ||
            p[1] < 0 ||
            p[1] > 30
          )
            issue(
              path,
              "motion path must remain within room bounds and height 0..30",
            );
        }
      }
      if (o.collision !== undefined)
        vector(o.collision, `${path}.collision`, 0.1, 20, 2);
      if (
        o.objectId !== undefined &&
        (typeof o.objectId !== "string" ||
          !/^[1-9][0-9]{0,19}$/.test(o.objectId))
      )
        issue(`${path}.objectId`, "expected an object ID");
      if (o.wall !== undefined && typeof o.wall !== "boolean")
        issue(`${path}.wall`, "expected boolean");
      if (o.exit !== undefined) {
        const exit = object(o.exit, `${path}.exit`, ["id", "approach"]);
        if (typeof exit.id !== "string" || !/^[1-9][0-9]{0,19}$/.test(exit.id))
          issue(`${path}.exit.id`, "expected exit ID");
        vector(exit.approach, `${path}.exit.approach`, -3, 3);
        if (o.homeEntrance || o.seat || o.objectId || o.wall)
          issue(
            path,
            "exit placements cannot also be home entrances, seats, scripted objects or cutaway walls",
          );
      }
      if (o.homeEntrance !== undefined) {
        const entrance = object(o.homeEntrance, `${path}.homeEntrance`, [
          "approach",
        ]);
        vector(entrance.approach, `${path}.homeEntrance.approach`, -3, 3);
        if (o.seat || o.objectId || o.wall)
          issue(
            path,
            "home entrances cannot be seats, scripted objects, or cutaway walls",
          );
      }
      if (o.seat !== undefined) {
        const seat = object(o.seat, `${path}.seat`, [
          "position",
          "approach",
          "yaw",
        ]);
        vector(seat.position, `${path}.seat.position`, -3, 3);
        vector(seat.approach, `${path}.seat.approach`, -3, 3);
        num(seat.yaw, `${path}.seat.yaw`, -360, 360);
      }
    });
    list(root.lights, "lights", 6).forEach((v, i) => {
      const p = `lights[${i}]`,
        l = object(v, p, ["position", "color", "intensity"]);
      vector(l.position, `${p}.position`);
      color(l.color, `${p}.color`);
      num(l.intensity, `${p}.intensity`, 0, 30);
    });
    const extraIds = new Set<string>();
    for (const [i, value] of list(root.signs ?? [], "signs", 32).entries()) {
      const p = `signs[${i}]`,
        sign = object(value, p, [
          "id",
          "text",
          "position",
          "yaw",
          "width",
          "height",
          "color",
          "background",
          "emissive",
          "binding",
          "attachTo",
          "doubleSided",
        ]);
      str(sign.id, `${p}.id`, 40);
      if (sign.attachTo !== undefined) {
        str(sign.attachTo, `${p}.attachTo`, 40);
        if (!ids.has(String(sign.attachTo)))
          issue(`${p}.attachTo`, "placement does not exist");
      }
      if (
        sign.doubleSided !== undefined &&
        typeof sign.doubleSided !== "boolean"
      )
        issue(`${p}.doubleSided`, "expected boolean");

      str(sign.text, `${p}.text`, 120);
      if (sign.binding !== undefined) {
        const binding = object(sign.binding, `${p}.binding`, [
          "kind",
          "entranceSpot",
        ]);
        if (binding.kind !== "homeName")
          issue(`${p}.binding.kind`, "expected homeName");
        str(binding.entranceSpot, `${p}.binding.entranceSpot`, 40);
        if (
          !(Array.isArray(root.objects) ? root.objects : []).some(
            (o) => o && o.id === binding.entranceSpot && o.homeEntrance,
          )
        )
          issue(
            `${p}.binding.entranceSpot`,
            "must reference a home entrance in this room",
          );
      }

      if (typeof sign.text === "string" && sign.text.split("\n").length > 4)
        issue(`${p}.text`, "maximum four lines");
      if (extraIds.has(String(sign.id))) issue(`${p}.id`, "duplicate ID");
      extraIds.add(String(sign.id));
      vector(sign.position, `${p}.position`);
      num(sign.yaw, `${p}.yaw`, -360, 360);
      num(sign.width, `${p}.width`, 0.1, 20);
      num(sign.height, `${p}.height`, 0.1, 10);
      color(sign.color, `${p}.color`);
      if (sign.background !== undefined)
        color(sign.background, `${p}.background`);
      if (sign.emissive !== undefined && typeof sign.emissive !== "boolean")
        issue(`${p}.emissive`, "expected boolean");
    }
    for (const [i, value] of list(root.npcs ?? [], "npcs", 12).entries()) {
      const p = `npcs[${i}]`,
        npc = object(value, p, [
          "id",
          "character",
          "objectId",
          "position",
          "yaw",
          "animation",
        ]);
      str(npc.id, `${p}.id`, 40);
      if (
        npc.objectId !== undefined &&
        (typeof npc.objectId !== "string" ||
          !/^[1-9][0-9]{0,19}$/.test(npc.objectId))
      )
        issue(`${p}.objectId`, "expected object ID");
      if (extraIds.has(String(npc.id))) issue(`${p}.id`, "duplicate ID");
      extraIds.add(String(npc.id));
      vector(npc.position, `${p}.position`);
      num(npc.yaw, `${p}.yaw`, -360, 360);
      if (!["idle", "talk", "wave"].includes(String(npc.animation)))
        issue(`${p}.animation`, "choose idle, talk or wave");
      try {
        const c = validate(npc.character, "character") as Character;
        rendered +=
          parts.reduce((n, part) => n + c.parts[part].length, 0) +
          c.cosmetics.reduce((n, a) => n + a.boxes.length, 0);
      } catch (e) {
        issue(
          `${p}.character`,
          e instanceof Error ? e.message : "invalid character",
        );
      }
    }
    if (boxes > 1200 || rendered > 2400)
      issue("room", "maximum 1200 model boxes / 2400 placed boxes");
  }
  if (errors.length) throw new ContractError(errors);
  return value as Room | Character;
}
export function parseDefinition(text: string, kind: "room"): Room;
export function parseDefinition(text: string, kind: "character"): Character;
export function parseDefinition(
  text: string,
  kind: "room" | "character",
): Room | Character {
  if (text.length > 500000) throw new ContractError(["File exceeds 500 KB."]);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ContractError([
      `JSON: ${e instanceof Error ? e.message : String(e)}`,
    ]);
  }
  return validate(data, kind);
}
export function worldPoint(o: Placement, point: Vec3): Vec3 {
  const r = (o.yaw * Math.PI) / 180;
  return [
    o.position[0] + point[0] * Math.cos(r) + point[2] * Math.sin(r),
    o.position[1] + point[1],
    o.position[2] - point[0] * Math.sin(r) + point[2] * Math.cos(r),
  ];
}
