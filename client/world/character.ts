import * as THREE from "three";
import {
  parts,
  pivots,
  type Part,
  type Character,
  type Box,
  type Vec3,
} from "../../shared/geometry";
export function buildCharacter(
  def: Character,
  addBox: (parent: THREE.Object3D, box: Box) => unknown,
) {
  const root = new THREE.Group(),
    body = new THREE.Group(),
    joints = {} as Record<Part, THREE.Group>;
  root.add(body);
  for (const part of parts) {
    const joint = new THREE.Group();
    joint.position.fromArray(pivots[part]);
    body.add(joint);
    joints[part] = joint;
    def.parts[part].forEach((box) => addBox(joint, box));
  }
  const cosmetics: THREE.Group[] = [];
  for (const attachment of def.cosmetics) {
    const group = new THREE.Group();
    group.name = attachment.name;
    group.position.fromArray(attachment.position);
    if (attachment.rotation)
      group.rotation.set(
        ...(attachment.rotation.map(THREE.MathUtils.degToRad) as Vec3),
      );
    attachment.boxes.forEach((box) => addBox(group, box));
    joints[attachment.parent].add(group);
    cosmetics.push(group);
  }
  return { root, body, joints, cosmetics };
}
