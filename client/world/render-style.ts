import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { surfaceMaterial } from "./materials";
import type { Box } from "../../shared/geometry";

export function fadeRenderable(group: THREE.Object3D, amount: number) {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.LineSegments))
      return;
    child.userData.baseCastShadow ??= child.castShadow;
    child.castShadow = child.userData.baseCastShadow && amount > 0.5;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const m of materials) {
      m.userData.baseOpacity ??= m.opacity;
      m.userData.baseTransparent ??= m.transparent;
      m.userData.baseDepthWrite ??= m.depthWrite;
      m.opacity = m.userData.baseOpacity * amount;
      m.transparent = m.userData.baseTransparent || amount < 1;
      m.depthWrite = m.userData.baseDepthWrite && amount > 0.8;
    }
  });
}

/** Materials expect a unit cube scaled in world meters, including edge wear. */
export function styledBox(box: Box) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    surfaceMaterial(box),
  );
  mesh.position.fromArray(box.position);
  mesh.scale.fromArray(box.size);
  mesh.rotation.set(
    ...((box.rotation ?? [0, 0, 0]).map(THREE.MathUtils.degToRad) as [
      number,
      number,
      number,
    ]),
  );
  mesh.castShadow = !box.emissive && box.material !== "glass";
  mesh.receiveShadow = true;
  return mesh;
}

export function floorSeams(width: number, depth: number, y: number) {
  const points: number[] = [];
  for (let x = -width / 2 + 0.8; x < width / 2; x += 0.8)
    points.push(x, y, -depth / 2, x, y, depth / 2);
  for (let z = -depth / 2 + 0.8; z < depth / 2; z += 0.8)
    points.push(-width / 2, y, z, width / 2, y, z);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: "#171b1e",
      transparent: true,
      opacity: 0.3,
    }),
  );
  lines.raycast = () => {};
  return lines;
}

export function industrialPostprocessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  composer.renderTarget1.samples = composer.renderTarget2.samples = 2;
  composer.addPass(new RenderPass(scene, camera));
  const occlusion = new SSAOPass(scene, camera, 1, 1, 8);
  occlusion.ssaoMaterial.defines.PERSPECTIVE_CAMERA =
    camera instanceof THREE.PerspectiveCamera ? 1 : 0;
  occlusion.kernelRadius = 0.65;
  occlusion.minDistance = 0.001;
  occlusion.maxDistance = 0.08;
  composer.addPass(occlusion);
  const render = occlusion.render.bind(occlusion);
  occlusion.render = (...args) => {
    const faded: THREE.Mesh[] = [];
    scene.traverseVisible((node) => {
      if (node instanceof THREE.Mesh) {
        const materials = Array.isArray(node.material)
          ? node.material
          : [node.material];
        if (materials.every((m) => m.opacity < 0.5)) faded.push(node);
      }
    });
    faded.forEach((node) => {
      node.visible = false;
    });
    try {
      render(...args);
    } finally {
      faded.forEach((node) => {
        node.visible = true;
      });
    }
  };
  const output = new OutputPass();
  composer.addPass(output);
  return {
    render: () => composer.render(),
    resize(width: number, height: number) {
      composer.setSize(width, height);
      occlusion.setSize(
        Math.max(1, Math.round(width / 2)),
        Math.max(1, Math.round(height / 2)),
      );
    },
    dispose() {
      occlusion.dispose();
      output.dispose();
      composer.dispose();
    },
  };
}
