import { test } from "node:test";
import assert from "node:assert/strict";
import { OrthographicCamera, Vector3 } from "three";
import { cameraDeadZone, deadZoneShift } from "../client/world/camera.ts";

test("camera holds inside the box and pans only to its edge across zooms and orbits", () => {
  for (const yaw of [0, 1.5, 3])
    for (const zoom of [0.5, 1, 4]) {
      const camera = new OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 100);
      camera.position.set(11, 11, 15).applyAxisAngle(new Vector3(0, 1, 0), yaw);
      camera.lookAt(0, 0.65, 0);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      assert.ok(
        deadZoneShift(camera, new Vector3(0.05, 0.65, 0)).length() < 1e-9,
      );
      const subject = new Vector3(12, 0.65, -10);
      const shift = deadZoneShift(camera, subject);
      assert.ok(shift.length() > 0);
      assert.equal(Math.abs(shift.y), 0);
      camera.position.add(shift);
      camera.updateMatrixWorld();
      const point = subject.clone().project(camera);
      assert.ok(Math.abs(point.x) <= cameraDeadZone.x + 1e-9);
      assert.ok(Math.abs(point.y) <= cameraDeadZone.y + 1e-9);
      assert.ok(
        Math.abs(point.x) > 0.1 || Math.abs(point.y) > 0.1,
        "does not recenter",
      );
      assert.ok(
        deadZoneShift(camera, subject).length() < 1e-8,
        "stays still after reaching boundary",
      );
    }
});

