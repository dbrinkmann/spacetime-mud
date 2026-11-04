import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonical, sha256 } from "../shared/runtime/digest.ts";
test("runtime content hashes agree with SHA-256 across block boundaries and Unicode", () => {
  for (const text of [
    "",
    "abc",
    "a".repeat(55),
    "a".repeat(56),
    "a".repeat(64),
    "a".repeat(16000),
    "灯り 🌏",
  ])
    assert.equal(sha256(text), createHash("sha256").update(text).digest("hex"));
  assert.equal(
    canonical({ b: 1, a: { d: 2, c: 3 } }),
    canonical({ a: { c: 3, d: 2 }, b: 1 }),
  );
});
