import { MathUtils, OrthographicCamera, Vector3 } from "three";

// Central 35% of the screen width and 30% of its height. Screen-space
// bounds keep the behavior consistent when the player zooms or orbits.
export const cameraDeadZone = { x: 0.35, y: 0.3 };

export function deadZoneShift(camera: OrthographicCamera, subject: Vector3) {
  camera.updateMatrixWorld();
  const projected = subject.clone().project(camera);
  const dx =
    projected.x -
    MathUtils.clamp(projected.x, -cameraDeadZone.x, cameraDeadZone.x);
  const dy =
    projected.y -
    MathUtils.clamp(projected.y, -cameraDeadZone.y, cameraDeadZone.y);
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  right.y = 0;
  up.y = 0;
  // Translate parallel to the ground, preserving orbit angle and altitude.
  return right
    .multiplyScalar((dx * (camera.right - camera.left)) / (2 * camera.zoom))
    .add(
      up.multiplyScalar(
        (dy * (camera.top - camera.bottom)) /
          (2 * camera.zoom * Math.max(up.lengthSq(), 0.0001)),
      ),
    );
}
