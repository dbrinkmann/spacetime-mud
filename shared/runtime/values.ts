/** Data crossing the script boundary is copied and validated in both directions. */
export type Value =
  null | boolean | number | string | Value[] | { [key: string]: Value };
export type RecordValue = { [key: string]: Value };
export const VALUE_LIMITS = Object.freeze({
  bytes: 8192,
  nodes: 512,
  depth: 8,
  array: 256,
  string: 4096,
});
const reserved = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "toString",
  "valueOf",
]);
export function safeKey(key: string) {
  if (!key || key.length > 80 || reserved.has(key))
    throw Error("Invalid or reserved key.");
  return key;
}
export function identifier(value: unknown, label = "identifier"): string {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/.test(value)
  )
    throw Error(`Invalid ${label}.`);
  safeKey(value);
  return value;
}
export function copyValue(
  input: unknown,
  byteLimit: number = VALUE_LIMITS.bytes,
  options: {
    nodes?: number;
    depth?: number;
    array?: number;
    string?: number;
  } = {},
): Value {
  const limits = { ...VALUE_LIMITS, ...options };
  let nodes = 0;
  const visiting = new Set<object>();
  const walk = (v: unknown, depth: number): Value => {
    if (++nodes > limits.nodes || depth > limits.depth)
      throw Error("Value complexity budget exceeded.");
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) throw Error("Numbers must be finite.");
      return v;
    }
    if (typeof v === "string") {
      if (v.length > limits.string) throw Error("String budget exceeded.");
      return v;
    }
    if (typeof v !== "object")
      throw Error("Only data values may cross the script boundary.");
    if (visiting.has(v)) throw Error("Cyclic values are unavailable.");
    const array = Array.isArray(v);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
      throw Error("Custom prototypes are unavailable.");
    if (Object.getOwnPropertySymbols(v).length)
      throw Error("Symbol keys are unavailable.");
    visiting.add(v);
    let result: Value;
    if (array) {
      if (v.length > limits.array || Object.keys(v).length !== v.length)
        throw Error("Arrays must be dense and bounded.");
      const out: Value[] = [];
      for (let i = 0; i < v.length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !("value" in d)) throw Error("Accessors are unavailable.");
        out.push(walk(d.value, depth + 1));
      }
      result = out;
    } else {
      const out: RecordValue = Object.create(null);
      for (const key of Object.getOwnPropertyNames(v)) {
        safeKey(key);
        const d = Object.getOwnPropertyDescriptor(v, key)!;
        if (!("value" in d)) throw Error("Accessors are unavailable.");
        out[key] = walk(d.value, depth + 1);
      }
      result = out;
    }
    visiting.delete(v);
    return result;
  };
  const result = walk(input, 0);
  if (new TextEncoder().encode(JSON.stringify(result)).length > byteLimit)
    throw Error("Value byte budget exceeded.");
  return result;
}
export type DataSchema =
  | { type: "null" | "boolean" }
  | { type: "number"; min?: number; max?: number }
  | { type: "string"; maxLength?: number; enum?: string[] }
  | { type: "array"; items: DataSchema; maxItems?: number }
  | {
      type: "object";
      properties: Record<string, DataSchema>;
      required?: string[];
    };

export function validateSchema(
  schema: DataSchema,
  depth = 0,
  count = { n: 0 },
): void {
  if (!schema || ++count.n > 128 || depth > 6)
    throw Error("Schema complexity exceeded.");
  if (schema.type === "object") {
    if (!schema.properties || Array.isArray(schema.properties))
      throw Error("Schema requires properties.");
    for (const [k, s] of Object.entries(schema.properties)) {
      safeKey(k);
      validateSchema(s, depth + 1, count);
    }
    for (const k of schema.required ?? [])
      if (!Object.prototype.hasOwnProperty.call(schema.properties, k))
        throw Error("Required property not declared.");
  } else if (schema.type === "array") {
    validateSchema(schema.items, depth + 1, count);
    if (
      schema.maxItems !== undefined &&
      (!Number.isInteger(schema.maxItems) ||
        schema.maxItems < 0 ||
        schema.maxItems > 256)
    )
      throw Error("Invalid maxItems.");
  } else if (schema.type === "number") {
    for (const n of [schema.min, schema.max])
      if (n !== undefined && !Number.isFinite(n))
        throw Error("Invalid numeric bound.");
    if (
      schema.min !== undefined &&
      schema.max !== undefined &&
      schema.min > schema.max
    )
      throw Error("Invalid numeric range.");
  } else if (schema.type === "string") {
    if (
      schema.maxLength !== undefined &&
      (!Number.isInteger(schema.maxLength) ||
        schema.maxLength < 0 ||
        schema.maxLength > 4096)
    )
      throw Error("Invalid maxLength.");
    if (
      schema.enum &&
      (schema.enum.length > 64 ||
        schema.enum.some((s) => typeof s !== "string" || s.length > 4096))
    )
      throw Error("Invalid enum.");
  } else if (!["null", "boolean"].includes(schema.type))
    throw Error("Unknown schema type.");
}
export function assertSchema(
  schema: DataSchema,
  value: Value,
  path = "value",
): void {
  const invalid = () => {
    throw Error(`${path} does not match ${schema.type} schema.`);
  };
  switch (schema.type) {
    case "null":
      if (value !== null) invalid();
      return;
    case "boolean":
      if (typeof value !== "boolean") invalid();
      return;
    case "number":
      if (
        typeof value !== "number" ||
        (schema.min !== undefined && value < schema.min) ||
        (schema.max !== undefined && value > schema.max)
      )
        invalid();
      return;
    case "string":
      if (
        typeof value !== "string" ||
        value.length > (schema.maxLength ?? 4096) ||
        (schema.enum && !schema.enum.includes(value))
      )
        invalid();
      return;
    case "array":
      if (!Array.isArray(value) || value.length > (schema.maxItems ?? 256))
        return invalid();
      value.forEach((v, i) => assertSchema(schema.items, v, `${path}[${i}]`));
      return;
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value))
        return invalid();
      for (const k of schema.required ?? [])
        if (!Object.prototype.hasOwnProperty.call(value, k)) invalid();
      for (const [k, v] of Object.entries(value)) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties, k))
          invalid();
        assertSchema(schema.properties[k], v, `${path}.${k}`);
      }
    }
  }
}
