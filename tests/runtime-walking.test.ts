import { test } from "node:test";
import assert from "node:assert/strict";
import {
  navigationScene,
  planWalk,
  walkPosition,
  walkDuration,
  approachPoint,
} from "../shared/runtime/walking";
import { cooperationEntities } from "../shared/runtime/cooperation";
import { clearSegment } from "../shared/navigation";
test("walk routes around authored colliders and replaces a route from its sampled position", () => {
  const entities = cooperationEntities("fixture", "home", "guild", "owner"),
    scene = navigationScene(entities);
  const walk = planWalk(scene, [1, 0, -2], [1, 0, 2], 100);
  assert.ok(walk.points.length > 1);
  let last = walk.start;
  for (const point of walk.points) {
    assert.ok(clearSegment(scene, last, point));
    last = point;
  }
  const midpoint = walkPosition(walk, 100 + walkDuration(walk) / 2);
  const replacement = planWalk(scene, midpoint, [-3, 0, 2], 101);
  assert.deepEqual(replacement.start, midpoint);
  assert.deepEqual(walkPosition(replacement, 1000), [-3, 0, 2]);
  assert.throws(() => planWalk(scene, scene.spawn, [30, 0, 0], 0), /route/);
  assert.deepEqual(
    approachPoint(entities.find((e) => e.id === "fixture.switch")!),
    [-2, 0, 2],
  );
});
