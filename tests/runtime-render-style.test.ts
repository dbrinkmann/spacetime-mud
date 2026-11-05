import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { styledBox, fadeRenderable } from "../client/world/render-style";

test("cuboid material coordinates retain meter scale and a unit-cube wear boundary", () => {
  const box = styledBox({
    position: [2, 3, 4],
    size: [30, 0.1, 16],
    color: "#232323",
    material: "asphalt",
  });
  assert.deepEqual(box.scale.toArray(), [30, 0.1, 16]);
  assert.equal(box.geometry.parameters.width, 1);
  assert.deepEqual(box.position.toArray(), [2, 3, 4]);
  assert.equal(box.castShadow, true);
  assert.equal(box.receiveShadow, true);
  box.geometry.dispose();
  box.material.dispose();
});

test("cutaways restore alpha signs and glass without opaque backgrounds or lingering shadows", () => {
  const group = new THREE.Group();
  const glass = styledBox({
    position: [0, 0, 0],
    size: [1, 1, 1],
    color: "#223344",
    material: "glass",
  });
  const opaque = styledBox({
    position: [0, 0, 0],
    size: [1, 1, 1],
    color: "#887766",
  });
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(),
    new THREE.MeshBasicMaterial({ transparent: true }),
  );
  group.add(glass, opaque, sign);
  fadeRenderable(group, 0.08);
  assert.equal(opaque.castShadow, false);
  assert.equal(opaque.material.depthWrite, false);
  fadeRenderable(group, 1);
  assert.equal(opaque.castShadow, true);
  assert.equal(opaque.material.transparent, false);
  assert.equal(opaque.material.depthWrite, true);
  assert.equal(glass.material.opacity, 0.28);
  assert.equal(glass.material.transparent, true);
  assert.equal(glass.material.depthWrite, false);
  assert.equal(sign.material.transparent, true);
  for (const mesh of [glass, opaque, sign]) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});
