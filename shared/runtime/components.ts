import { copyValue, type Value } from "./values";
import { surfaceMaterials } from "../geometry";
export function validateComponent(key: string, input: Value): Value {
  const v = copyValue(input);
  const record = () => {
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw Error("Component must be a record.");
    return v;
  };
  const vector = (x: Value | undefined, min: number, max: number) => {
    if (
      !Array.isArray(x) ||
      x.length !== 3 ||
      x.some((n) => typeof n !== "number" || n < min || n > max)
    )
      throw Error("Invalid component vector.");
  };
  switch (key) {
    case "walkSurface": {
      const r = record();
      if (Object.keys(r).some((k) => !["width", "depth", "spawn"].includes(k)))
        throw Error("Unknown walk surface field.");
      for (const k of ["width", "depth"])
        if (typeof r[k] !== "number" || r[k] < 1 || r[k] > 100)
          throw Error("Invalid walk surface size.");
      vector(r.spawn, -50, 50);
      if ((r.spawn as number[])[1] !== 0)
        throw Error("Spawn must be on the ground.");
      break;
    }
    case "interaction": {
      const r = record();
      if (Object.keys(r).some((k) => k !== "approach"))
        throw Error("Unknown interaction field.");
      vector(r.approach, -100, 100);
      break;
    }
    case "collider": {
      const r = record();
      if (
        Object.keys(r).some(
          (k) => !["size", "center", "enabled"].includes(k),
        ) ||
        typeof r.enabled !== "boolean"
      )
        throw Error("Invalid collider.");
      vector(r.center, -100, 100);
      if (
        !Array.isArray(r.size) ||
        r.size.length !== 2 ||
        r.size.some((n) => typeof n !== "number" || n < 0.01 || n > 100)
      )
        throw Error("Invalid collider size.");
      break;
    }
    case "visual": {
      const r = record();
      if (
        Object.keys(r).some((k) => k !== "boxes") ||
        !Array.isArray(r.boxes) ||
        r.boxes.length > 32
      )
        throw Error("Visual requires up to 32 boxes.");
      for (const box of r.boxes) {
        if (!box || typeof box !== "object" || Array.isArray(box))
          throw Error("Invalid visual box.");
        if (
          Object.keys(box).some(
            (k) =>
              ![
                "position",
                "size",
                "rotation",
                "color",
                "material",
                "roughness",
                "wear",
                "emissive",
              ].includes(k),
          )
        )
          throw Error("Unknown box field.");
        vector(box.position, -100, 100);
        vector(box.size, 0.01, 100);
        if (box.rotation !== undefined) vector(box.rotation, -360, 360);
        if (typeof box.color !== "string" || !/^#[0-9a-f]{6}$/i.test(box.color))
          throw Error("Invalid box color.");
        if (
          box.material !== undefined &&
          !surfaceMaterials.includes(
            box.material as (typeof surfaceMaterials)[number],
          )
        )
          throw Error("Unknown material.");
        for (const k of ["roughness", "wear"])
          if (
            box[k] !== undefined &&
            (typeof box[k] !== "number" || box[k] < 0 || box[k] > 1)
          )
            throw Error("Invalid surface parameter.");
        if (box.emissive !== undefined && typeof box.emissive !== "boolean")
          throw Error("Invalid emissive flag.");
      }
      break;
    }
    case "visibility":
      if (typeof v !== "boolean") throw Error("Visibility must be boolean.");
      break;
    case "transform": {
      const r = record();
      if (Object.keys(r).some((k) => !["position", "rotation"].includes(k)))
        throw Error("Unknown transform field.");
      vector(r.position, -100, 100);
      vector(r.rotation, -360, 360);
      break;
    }
    case "text":
      if (typeof v !== "string" || v.length > 1000)
        throw Error("Text must be bounded.");
      break;
    case "light": {
      const r = record();
      if (
        Object.keys(r).some((k) => !["color", "intensity"].includes(k)) ||
        typeof r.color !== "string" ||
        !/^#[0-9a-f]{6}$/i.test(r.color) ||
        typeof r.intensity !== "number" ||
        r.intensity < 0 ||
        r.intensity > 30
      )
        throw Error("Invalid light.");
      break;
    }
    default:
      throw Error(`Unsupported component: ${key}`);
  }
  return v;
}
