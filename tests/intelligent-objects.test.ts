import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pathTrajectory,
  viewIntersection,
  propTrajectory,
  validateView,
  type ViewDefinition,
} from "../shared/intelligent-objects.ts";
import type { Placement } from "../shared/geometry.ts";
const stationary = (x: number, z: number) => pathTrajectory([[x, 0, z]], 0, 0);
const view: ViewDefinition = {
  frame: "room",
  box: { center: [0, 0, 0], size: [2, 2] },
  include: ["player"],
};
test("views solve entry and exit times between segment boundaries", () => {
  const moving = pathTrajectory(
    [
      [-3, 0, 0],
      [3, 0, 0],
    ],
    0,
    1,
  );
  assert.deepEqual(viewIntersection(view, stationary(0, 0), moving), {
    inside: false,
    next: 2,
  });
  assert.deepEqual(
    viewIntersection(
      view,
      stationary(0, 0),
      pathTrajectory(
        [
          [-3, 0, 0],
          [3, 0, 0],
        ],
        3,
        1,
      ),
    ),
    { inside: true, next: 1 },
  );
  assert.equal(
    viewIntersection(
      view,
      stationary(0, 0),
      pathTrajectory(
        [
          [-3, 0, 2],
          [3, 0, 2],
        ],
        0,
        1,
      ),
    ).next,
    Infinity,
  );
});
test("self-relative views account for heading and relative speed", () => {
  const self = pathTrajectory(
    [
      [0, 0, 0],
      [10, 0, 0],
    ],
    0,
    2,
  );
  const ahead: ViewDefinition = {
    ...view,
    frame: "self",
    box: { center: [0, 0, 4], size: [2, 4] },
  };
  assert.equal(viewIntersection(ahead, self, stationary(4, 0)).inside, true);
  assert.equal(viewIntersection(ahead, self, stationary(0, 4)).inside, false);
  assert.equal(viewIntersection(ahead, self, stationary(10, 0)).next, 2);
});
test("once motion ends and paused motion does not drift", () => {
  const prop: Placement = {
    id: "test",
    name: "test",
    model: "test",
    position: [0, 0, 0],
    yaw: 0,
    motion: {
      points: [
        [0, 0, 0],
        [0, 0, 10],
      ],
      speed: 2,
      mode: "once",
    },
  };
  const state = {
    distance: 0,
    started: 100,
    speed: 2,
    paused: false,
    visible: true,
    completed: false,
  };
  assert.equal(propTrajectory(prop, state, 105).ended, true);
  assert.deepEqual(propTrajectory(prop, state, 106).position, [0, 0, 10]);
  assert.deepEqual(
    propTrajectory(prop, { ...state, distance: 4, paused: true }, 106).position,
    [0, 0, 4],
  );
});
test("view definitions reject unbounded regions and unsupported filters", () => {
  assert.deepEqual(validateView(view), view);
  assert.throws(() =>
    validateView({ ...view, box: { center: [0, 0, 0], size: [Infinity, 2] } }),
  );
  assert.throws(() => validateView({ ...view, include: ["all"] }));
});

test("duplicate terminal waypoints stay at the end and loop progress wraps", () => {
  assert.deepEqual(
    pathTrajectory(
      [
        [0, 0, 0],
        [4, 0, 0],
        [4, 0, 0],
      ],
      4,
      2,
    ).position,
    [4, 0, 0],
  );
  assert.equal(
    pathTrajectory(
      [
        [0, 0, 0],
        [4, 0, 0],
        [0, 0, 0],
      ],
      10,
      2,
      true,
    ).distance,
    2,
  );
});
