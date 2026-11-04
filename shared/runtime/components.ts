import { copyValue, type Value } from "./values";
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
