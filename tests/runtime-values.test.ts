import { test } from "node:test";
import assert from "node:assert/strict";
import {
  copyValue,
  assertSchema,
  validateSchema,
} from "../shared/runtime/values.ts";
test("structured values are detached and reject host objects, accessors and cycles", () => {
  const original = { nested: [{ count: 1 }] };
  const copied = copyValue(original) as typeof original;
  copied.nested[0].count = 9;
  assert.equal(original.nested[0].count, 1);
  let touched = false;
  const accessor = Object.defineProperty({}, "x", {
    get() {
      touched = true;
      return 1;
    },
  });
  const cycle: any = {};
  cycle.self = cycle;
  for (const v of [
    accessor,
    cycle,
    new Date(),
    () => 1,
    NaN,
    Infinity,
    undefined,
    [, 1],
    JSON.parse('{"__proto__":{"polluted":true}}'),
  ])
    assert.throws(() => copyValue(v));
  assert.equal(touched, false);
  assert.throws(() => copyValue("x".repeat(4097)));
  assert.throws(() => copyValue(["界".repeat(2000), "界".repeat(2000)]));
});
test("schemas bound records and distinguish null from absent", () => {
  const schema = {
    type: "object" as const,
    properties: {
      n: { type: "number" as const, min: 0, max: 4 },
      optional: { type: "null" as const },
    },
    required: ["n"],
  };
  validateSchema(schema);
  assertSchema(schema, { n: 3 });
  assertSchema(schema, { n: 3, optional: null });
  for (const v of [{ n: 7 }, {}, { n: 1, extra: true }])
    assert.throws(() => assertSchema(schema, copyValue(v)));
});
