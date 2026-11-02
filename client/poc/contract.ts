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
export type Box = {
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
export type Placement = {
  id: string;
  name: string;
  model: string;
  position: Vec3;
  yaw: number;
  collision?: [number, number];
  seat?: Seat;
  wall?: boolean;
};
export type Room = {
  version: 1;
  name: string;
  description: string;
  width: number;
  depth: number;
  floorColor: string;
  spawn: Vec3;
  models: Record<string, Model>;
  objects: Placement[];
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
  const vector = (v: unknown, path: string, min = -30, max = 30, n = 3) => {
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
          "spawn",
          "models",
          "objects",
          "lights",
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
    num(root.width, "width", 4, 20);
    num(root.depth, "depth", 4, 20);
    color(root.floorColor, "floorColor");
    vector(root.spawn, "spawn", -10, 10);
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
        ]);
      str(o.id, `${path}.id`, 40);
      str(o.name, `${path}.name`);
      if (ids.has(String(o.id))) issue(`${path}.id`, "duplicate ID");
      ids.add(String(o.id));
      if (typeof o.model !== "string" || !Object.hasOwn(models, o.model))
        issue(`${path}.model`, "model does not exist");
      else
        rendered += Array.isArray((models[o.model] as Obj)?.boxes)
          ? ((models[o.model] as Obj).boxes as unknown[]).length
          : 0;
      vector(o.position, `${path}.position`);
      num(o.yaw, `${path}.yaw`, -360, 360);
      if (o.collision !== undefined)
        vector(o.collision, `${path}.collision`, 0.1, 20, 2);
      if (o.wall !== undefined && typeof o.wall !== "boolean")
        issue(`${path}.wall`, "expected boolean");
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
