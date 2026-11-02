import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDefinition, worldPoint } from "../client/poc/contract.ts";
import {
  validateNavigation,
  route,
  walkable,
} from "../client/poc/navigation.ts";
import { poseFor } from "../client/poc/animation.ts";
const read = (name: string) =>
  readFileSync(`public/poc/examples/${name}.json`, "utf8");
test("independent box characters share a six-part contract and cosmetic parents", () => {
  for (const file of ["traveler", "wizard"]) {
    const c = parseDefinition(read(file), "character");
    assert.equal(Object.keys(c.parts).length, 6);
    assert(c.cosmetics.length > 0);
  }
  const bad = JSON.parse(read("wizard"));
  bad.cosmetics[0].parent = "leftElbow";
  assert.throws(
    () => parseDefinition(JSON.stringify(bad), "character"),
    /cosmetics\[0\].parent/,
  );
});
test("rejects unbounded geometry, invalid fields and non-data input", () => {
  const bad = JSON.parse(read("traveler"));
  bad.parts.head[0].size[0] = -1;
  assert.throws(
    () => parseDefinition(JSON.stringify(bad), "character"),
    /size/,
  );
  bad.parts.head[0].size[0] = 1;
  bad.script = "alert(1)";
  assert.throws(
    () => parseDefinition(JSON.stringify(bad), "character"),
    /unknown field/,
  );
  assert.throws(() => parseDefinition("{oops", "room"), /JSON/);
  assert.throws(() => parseDefinition(" ".repeat(500001), "room"), /500 KB/);
});
test("room fixtures have reachable seats and collision-aware routes", () => {
  const r = parseDefinition(read("room"), "room");
  validateNavigation(r);
  const chair = r.objects.find((o) => o.id === "reading-chair")!;
  assert(!walkable(r, chair.position[0], chair.position[2]));
  const dest = worldPoint(chair, chair.seat!.approach),
    path = route(r, r.spawn, dest);
  assert(path?.length);
  for (const p of path) assert(walkable(r, p[0], p[2]));
  assert.equal(route(r, r.spawn, [100, 0, 100]), null);
});
test("invalid seat placements are rejected before replacing a live scene", () => {
  const r = parseDefinition(read("room"), "room");
  r.objects.find((o) => o.seat)!.seat!.approach = [0, 0, 0];
  assert.throws(() => validateNavigation(r), /unreachable/);
});
test("walk alternates rigid limbs; seating and wave animate only standardized parts", () => {
  const walk = poseFor("walk", 0.2);
  assert.equal(walk.rotation.leftLeg[0], -walk.rotation.rightLeg[0]);
  assert.equal(poseFor("sit", 1).rotation.leftLeg[0], -Math.PI / 2);
  assert(poseFor("wave", 1).rotation.leftArm[2] > 2);
  assert.equal(poseFor("idle", 1).rotation.leftArm[2], 0);
});
