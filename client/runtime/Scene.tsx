import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { surfaceMaterial } from "../world/materials";
import type { Box } from "../../shared/geometry";
import type { RoomPresentation } from "../../shared/runtime/presentation";
import { walkPosition } from "../../shared/runtime/walking";
import {
  sampleOperation,
  type TransformValue,
} from "../../shared/runtime/operations";

/** Renders a projection only; behavior code never executes in the browser. */
export function RuntimeScene({
  snapshot,
  onSelect,
  onWalk,
}: {
  snapshot: RoomPresentation;
  onSelect: (id: string) => void;
  onWalk: (x: number, z: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({
    snapshot,
    received: performance.now(),
    onSelect,
    onWalk,
  });
  useEffect(() => {
    current.current = {
      snapshot,
      received: performance.now(),
      onSelect,
      onWalk,
    };
  }, [snapshot]);
  useEffect(() => {
    current.current.onSelect = onSelect;
    current.current.onWalk = onWalk;
  }, [onSelect, onWalk]);
  useEffect(() => {
    const element = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor("#10161c");
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xb9d2ed, 0x15100d, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(4, 8, 5);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 500);
    camera.position.set(9, 8, 12);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.update();
    const nodes = new Map<
      string,
      { group: THREE.Group; visual: string; light?: THREE.PointLight }
    >();
    const avatars = new Map<string, THREE.Group>();
    const dispose = (group: THREE.Group) => {
      group.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          const materials = Array.isArray(node.material)
            ? node.material
            : [node.material];
          materials.forEach((m) => m.dispose());
        }
      });
      scene.remove(group);
    };
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    });
    resize.observe(element);
    const ray = new THREE.Raycaster();
    let down = [0, 0];
    const pointerDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const pointerUp = (e: PointerEvent) => {
      if (
        e.button !== 0 ||
        Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5
      )
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((e.clientY - rect.top) / rect.height) * 2,
        ),
        camera,
      );
      const hit = ray.intersectObjects(
        [...nodes.values()].filter((n) => n.group.visible).map((n) => n.group),
        true,
      )[0];
      if (hit) {
        let node: THREE.Object3D | null = hit.object;
        while (node && !node.userData.entity) node = node.parent;
        if (node) {
          const entity = current.current.snapshot.entities.find(
            (e) => e.id === node!.userData.entity,
          );
          if (entity?.actions.length || entity?.components.collider)
            current.current.onSelect(node.userData.entity);
          else current.current.onWalk(hit.point.x, hit.point.z);
        }
      }
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    let frame = 0;
    const render = () => {
      const { snapshot: data, received } = current.current;
      const now = data.serverTime + (performance.now() - received) / 1000;
      for (const [id, avatar] of avatars)
        if (!data.walkers?.some((w) => w.id === id)) {
          dispose(avatar);
          avatars.delete(id);
        }
      for (const walker of data.walkers ?? []) {
        let avatar = avatars.get(walker.id);
        if (!avatar) {
          avatar = new THREE.Group();
          for (const [x, y, z, w, h, d, color] of [
            [0, 1.5, 0, 0.35, 0.35, 0.35, 0xddc8a0],
            [0, 1, 0, 0.45, 0.6, 0.25, 0x79a5ad],
            [-0.32, 1, 0, 0.16, 0.6, 0.2, 0x79a5ad],
            [0.32, 1, 0, 0.16, 0.6, 0.2, 0x79a5ad],
            [-0.13, 0.35, 0, 0.2, 0.7, 0.22, 0x303b47],
            [0.13, 0.35, 0, 0.2, 0.7, 0.22, 0x303b47],
          ]) {
            const mesh = new THREE.Mesh(
              new THREE.BoxGeometry(w, h, d),
              new THREE.MeshStandardMaterial({ color }),
            );
            mesh.position.set(x, y, z);
            avatar.add(mesh);
          }
          avatars.set(walker.id, avatar);
          scene.add(avatar);
        }
        const position = walkPosition(walker.walk, now),
          next = walkPosition(walker.walk, now + 0.05);
        avatar.position.fromArray(position);
        if (Math.hypot(next[0] - position[0], next[2] - position[2]) > 0.0001) {
          avatar.rotation.y = Math.atan2(
            next[0] - position[0],
            next[2] - position[2],
          );
          avatar.children[4].rotation.x = Math.sin(now * 10) * 0.3;
          avatar.children[5].rotation.x = -Math.sin(now * 10) * 0.3;
        } else {
          avatar.children[4].rotation.x = 0;
          avatar.children[5].rotation.x = 0;
        }
      }
      for (const [id, node] of nodes)
        if (!data.entities.some((e) => e.id === id)) {
          dispose(node.group);
          nodes.delete(id);
        }
      for (const e of data.entities) {
        const visual = JSON.stringify(e.components.visual ?? null);
        let node = nodes.get(e.id);
        if (!node || node.visual !== visual) {
          if (node) dispose(node.group);
          const group = new THREE.Group();
          group.userData.entity = e.id;
          const boxes =
            (e.components.visual as unknown as { boxes: Box[] } | undefined)
              ?.boxes ?? [];
          for (const box of boxes) {
            const mesh = new THREE.Mesh(
              new THREE.BoxGeometry(...box.size),
              surfaceMaterial(box),
            );
            mesh.position.fromArray(box.position);
            mesh.rotation.set(
              ...((box.rotation ?? [0, 0, 0]).map(THREE.MathUtils.degToRad) as [
                number,
                number,
                number,
              ]),
            );
            group.add(mesh);
          }
          node = { group, visual };
          nodes.set(e.id, node);
          scene.add(group);
        }
        node.group.visible = e.components.visibility !== false;
        const op = e.operations.find((o) => o.resource === "transform");
        const pose = op
          ? sampleOperation(op, now)
          : (e.components.transform as unknown as TransformValue | undefined);
        node.group.position.fromArray(pose?.position ?? [0, 0, 0]);
        node.group.rotation.set(
          ...((pose?.rotation ?? [0, 0, 0]).map(THREE.MathUtils.degToRad) as [
            number,
            number,
            number,
          ]),
        );
        const light = e.components.light as
          { color: string; intensity: number } | undefined;
        if (light) {
          if (!node.light) {
            node.light = new THREE.PointLight();
            node.group.add(node.light);
          }
          node.light.color.set(light.color);
          node.light.intensity = light.intensity;
          node.light.distance = 12;
        } else if (node.light) {
          node.group.remove(node.light);
          node.light = undefined;
        }
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      nodes.forEach((n) => dispose(n.group));
      avatars.forEach(dispose);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div
      ref={host}
      style={{ width: "100%", height: "100%", minHeight: 0 }}
      aria-label="Runtime world preview"
    />
  );
}
