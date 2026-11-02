import { serverNow } from "./clock";
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  type Room,
  type Character,
  type Box,
  type Part,
  type Vec3,
  type Placement,
  parts,
  pivots,
  worldPoint,
} from "../../shared/geometry";
import { poseFor, type Animation } from "./animation";
import { route } from "../../shared/navigation";
export type ViewCommand = {
  id: number;
  action:
    Animation | "stand" | "reset" | "anchors" | "sitSelected" | "cosmetics";
  value?: boolean;
};
export type ViewStatus = {
  animation: string;
  seat: string | null;
  selected: string | null;
  boxes: number;
  message: string;
};
declare global {
  interface Window {
    boxWorld?: {
      inspect: () => unknown;
      project: (point: Vec3) => { x: number; y: number };
    };
  }
}
import { sampleMotion, type Motion } from "../../shared/world";
export type LiveTraveler = {
  id: string;
  name: string;
  character: Character;
  motion: Motion;
};
type Props = {
  showGuest?: boolean;
  live?: {
    identity: string;
    travelers: LiveTraveler[];
    onMove: (x: number, z: number, seat: string, pose: string) => void;
  };
  room: Room;
  character: Character;
  guest: Character;
  command: ViewCommand;
  onStatus: (s: ViewStatus) => void;
  onError: (s: string) => void;
};
export function Viewport(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    controller = useRef<((c: ViewCommand) => void) | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      });
    } catch (e) {
      callbacks.current.onError(`WebGL is unavailable: ${String(e)}`);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "Interactive 3D room");
    renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#161b20");
    scene.fog = new THREE.Fog("#161b20", 28, 55);
    const camera = new THREE.OrthographicCamera(-10, 10, 7, -7, 0.1, 80);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.35;
    controls.minZoom = 0.65;
    controls.maxZoom = 2.7;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    const reset = () => {
      camera.position.set(11, 11, 15);
      camera.zoom = 1;
      controls.target.set(0, 0.65, 0);
      camera.updateProjectionMatrix();
      controls.update();
    };
    reset();
    scene.add(new THREE.HemisphereLight("#cfdef0", "#7d6048", 2));
    const sun = new THREE.DirectionalLight("#ffe4be", 3.2);
    sun.position.set(2, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    const { room, character, guest } = props;
    room.lights.forEach((l) => {
      const light = new THREE.PointLight(l.color, l.intensity, 8, 1.4);
      light.position.fromArray(l.position);
      scene.add(light);
    });
    const geometry = new THREE.BoxGeometry(1, 1, 1),
      materials = new Map<string, THREE.MeshStandardMaterial>();
    function material(color: string, emissive = false) {
      const key = color + emissive;
      let m = materials.get(key);
      if (!m) {
        m = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.85,
          emissive: emissive ? color : "#000000",
          emissiveIntensity: emissive ? 0.9 : 0,
        });
        materials.set(key, m);
      }
      return m;
    }
    let boxCount = 0;
    const addBox = (parent: THREE.Object3D, b: Box, id?: string) => {
      const mesh = new THREE.Mesh(geometry, material(b.color, b.emissive));
      mesh.position.fromArray(b.position);
      mesh.scale.fromArray(b.size);
      if (b.rotation)
        mesh.rotation.set(
          ...(b.rotation.map((x) => THREE.MathUtils.degToRad(x)) as Vec3),
        );
      mesh.castShadow = !b.emissive;
      mesh.receiveShadow = true;
      mesh.userData.objectId = id;
      parent.add(mesh);
      boxCount++;
      return mesh;
    };
    const floor = addBox(scene, {
      position: [0, -0.14, 0],
      size: [room.width, 0.25, room.depth],
      color: room.floorColor,
    });
    floor.userData.floor = true;
    // Floor seams are runtime surface treatment, not gameplay entities.
    const seams = new THREE.GridHelper(
      Math.max(room.width, room.depth),
      24,
      "#725b49",
      "#725b49",
    );
    seams.scale.set(
      room.width / Math.max(room.width, room.depth),
      1,
      room.depth / Math.max(room.width, room.depth),
    );
    seams.position.y = -0.008;
    scene.add(seams);
    const objects = new Map<string, THREE.Group>(),
      walls: THREE.Group[] = [];
    const pickables: THREE.Object3D[] = [floor];
    for (const o of room.objects) {
      const g = new THREE.Group();
      g.position.fromArray(o.position);
      g.rotation.y = THREE.MathUtils.degToRad(o.yaw);
      for (const b of room.models[o.model].boxes) addBox(g, b, o.id);
      scene.add(g);
      objects.set(o.id, g);
      if (o.wall) {
        walls.push(g);
        g.traverse((c) => {
          if (c instanceof THREE.Mesh) {
            c.material = (c.material as THREE.MeshStandardMaterial).clone();
            c.material.transparent = true;
          }
        });
      } else pickables.push(g);
    }
    function rig(def: Character) {
      const root = new THREE.Group(),
        body = new THREE.Group(),
        joints = {} as Record<Part, THREE.Group>;
      root.add(body);
      for (const part of parts) {
        const group = new THREE.Group();
        group.position.fromArray(pivots[part]);
        body.add(group);
        joints[part] = group;
        def.parts[part].forEach((b) => addBox(group, b));
      }
      const cosmetics: THREE.Group[] = [];
      for (const a of def.cosmetics) {
        const group = new THREE.Group();
        group.name = a.name;
        group.position.fromArray(a.position);
        if (a.rotation)
          group.rotation.set(
            ...(a.rotation.map((x) => THREE.MathUtils.degToRad(x)) as Vec3),
          );
        a.boxes.forEach((b) => addBox(group, b));
        joints[a.parent].add(group);
        cosmetics.push(group);
      }
      scene.add(root);
      return { root, body, joints, cosmetics };
    }
    const player = rig(character),
      companion = rig(guest);
    player.root.position.fromArray(room.spawn);
    const guestSeat =
      props.showGuest === false
        ? undefined
        : room.objects.filter((o) => o.seat)[1];
    if (guestSeat?.seat) {
      const p = worldPoint(guestSeat, guestSeat.seat.position);
      companion.root.position.set(p[0], p[1] - 0.76, p[2]);
      companion.root.rotation.y = THREE.MathUtils.degToRad(
        guestSeat.yaw + guestSeat.seat.yaw,
      );
    } else companion.root.position.set(room.spawn[0] + 1, 0, room.spawn[2]);
    const debug = new THREE.Group();
    debug.visible = false;
    scene.add(debug);
    for (const o of room.objects) {
      if (o.collision) {
        const g = new THREE.EdgesGeometry(
          new THREE.BoxGeometry(o.collision[0], 0.1, o.collision[1]),
        );
        const m = new THREE.LineBasicMaterial({ color: "#df977c" });
        const outline = new THREE.LineSegments(g, m);
        outline.position.set(o.position[0], 0.06, o.position[2]);
        outline.rotation.y = THREE.MathUtils.degToRad(o.yaw);
        debug.add(outline);
      }
      if (o.seat) {
        for (const [p, color] of [
          [o.seat.position, "#f5ca68"],
          [o.seat.approach, "#73dac0"],
        ] as const) {
          const marker = addBox(debug, {
            position: worldPoint(o, p),
            size: [0.14, 0.14, 0.14],
            color,
          });
          marker.position.y += 0.08;
        }
      }
    }
    const target = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.2, 32),
      new THREE.MeshBasicMaterial({ color: "#f4c967", side: THREE.DoubleSide }),
    );
    target.rotation.x = -Math.PI / 2;
    target.position.y = 0.025;
    target.visible = false;
    scene.add(target);
    const selection = new THREE.Box3Helper(
      new THREE.Box3(),
      new THREE.Color("#f3cc74"),
    );
    selection.visible = false;
    scene.add(selection);
    let mode: Animation = "idle",
      preview: Animation = "idle",
      selected: Placement | undefined,
      seated: Placement | undefined,
      pendingSeat: Placement | undefined,
      path: Vec3[] = [],
      elapsed = 0,
      previous = 0,
      lastMessage = "Click the floor to walk. Drag to orbit. Scroll to zoom.";
    const label = document.createElement("div");
    label.className = "poc-nameplate";
    label.textContent = `${character.name} · you`;
    container.appendChild(label);
    const guestLabel = document.createElement("div");
    guestLabel.className = "poc-nameplate guest";
    guestLabel.textContent = `${guest.name} · preview`;
    container.appendChild(guestLabel);
    if (props.live || props.showGuest === false) {
      companion.root.visible = false;
      guestLabel.style.display = "none";
    }
    const visitors = new Map<
      string,
      {
        rig: ReturnType<typeof rig>;
        label: HTMLDivElement;
        definition: Character;
      }
    >();
    const emit = (message = lastMessage) => {
      lastMessage = message;
      callbacks.current.onStatus({
        animation: mode,
        seat: seated?.id ?? null,
        selected: selected?.id ?? null,
        boxes: boxCount,
        message,
      });
      renderer.domElement.dataset.animation = mode;
      renderer.domElement.dataset.seat = seated?.id ?? "";
    };
    const stand = () => {
      if (seated?.seat) {
        const p = worldPoint(seated, seated.seat.approach);
        player.root.position.fromArray(p);
      }
      seated = undefined;
      pendingSeat = undefined;
      mode = "idle";
      preview = "idle";
      path = [];
      target.visible = false;
    };
    const move = (destination: Vec3, seat?: Placement) => {
      if (seated) stand();
      const start = player.root.position.toArray() as Vec3;
      const next = route(room, start, destination);
      if (!next) {
        emit("That position is blocked or unreachable.");
        return;
      }
      path = next;
      pendingSeat = seat;
      mode = "walk";
      preview = "idle";
      target.position.set(destination[0], 0.025, destination[2]);
      target.visible = true;
      emit(seat ? `Walking to ${seat.name}…` : "Walking.");
    };
    const choose = (o: Placement) => {
      selected = o;
      selection.box.setFromObject(objects.get(o.id)!);
      selection.visible = true;
      emit(
        o.seat
          ? "Seat available. Choose Sit here to approach it."
          : `${o.name} · ${room.models[o.model].boxes.length} boxes, defined in room JSON.`,
      );
    };
    const pointer = new THREE.Vector2(),
      raycaster = new THREE.Raycaster();
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
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickables, true)[0];
      if (!hit) return;
      const id = hit.object.userData.objectId;
      if (id) {
        choose(room.objects.find((o) => o.id === id)!);
      } else if (hit.object.userData.floor) {
        if (callbacks.current.live)
          callbacks.current.live.onMove(hit.point.x, hit.point.z, "", "idle");
        else move([hit.point.x, 0, hit.point.z]);
      }
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    controller.current = (c) => {
      if (c.action === "reset") {
        reset();
        return;
      }
      if (c.action === "anchors") {
        debug.visible = c.value ?? !debug.visible;
        return;
      }
      if (c.action === "cosmetics") {
        player.cosmetics.forEach((g) => (g.visible = c.value ?? true));
        return;
      }
      if (callbacks.current.live) {
        if (c.action === "sitSelected" && !selected?.seat) {
          emit("Select a seat first.");
          return;
        }
        callbacks.current.live.onMove(
          player.root.position.x,
          player.root.position.z,
          c.action === "sitSelected" ? selected!.id : "",
          c.action === "wave" || c.action === "talk" ? c.action : "stand",
        );
        return;
      }
      if (c.action === "stand") {
        stand();
        emit("Standing.");
        return;
      }
      if (c.action === "sitSelected") {
        if (!selected?.seat) {
          emit("Select a chair in the room first.");
          return;
        }
        if (selected.id === guestSeat?.id) {
          emit("This seat is occupied by the preview character.");
          return;
        }
        move(worldPoint(selected, selected.seat.approach), selected);
        return;
      }
      stand();
      preview = c.action;
      mode = c.action;
      emit(
        c.action === "sit"
          ? "Seated pose preview. Select a chair to test actual alignment."
          : `${c.action} animation preview.`,
      );
    };
    const size = () => {
      const w = container.clientWidth,
        h = container.clientHeight;
      const extent = Math.max(room.width, room.depth);
      const span = Math.max(extent * 0.61, (extent * 0.78) / (w / h));
      camera.left = (-span * w) / h;
      camera.right = (span * w) / h;
      camera.top = span;
      camera.bottom = -span;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const observer = new ResizeObserver(size);
    observer.observe(container);
    size();
    const project = (p: Vec3) => {
      const point = new THREE.Vector3(...p).project(camera),
        rect = renderer.domElement.getBoundingClientRect();
      return {
        x: rect.left + ((point.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - point.y) / 2) * rect.height,
      };
    };
    window.boxWorld = {
      inspect: () => ({
        travelers: callbacks.current.live?.travelers.map((t) => ({
          id: t.id,
          name: t.name,
          ...sampleMotion(t.motion, room, serverNow()),
        })),
        position: player.root.position.toArray(),
        animation: mode,
        seat: seated?.id ?? null,
        selected: selected?.id ?? null,
        boxes: boxCount,
        cosmetics: player.cosmetics.map((c) => ({
          name: c.name,
          parent:
            c.parent === player.joints.head
              ? "head"
              : parts.find((p) => player.joints[p] === c.parent),
          visible: c.visible,
        })),
        joints: Object.fromEntries(
          parts.map((p) => [
            p,
            player.joints[p].rotation.toArray().slice(0, 3),
          ]),
        ),
      }),
      project,
    };
    const animateRig = (
      r: ReturnType<typeof rig>,
      animation: Animation,
      time: number,
      dt: number,
    ) => {
      const pose = poseFor(animation, time);
      r.body.position.y = THREE.MathUtils.damp(
        r.body.position.y,
        pose.bob,
        12,
        dt,
      );
      for (const p of parts) {
        const joint = r.joints[p],
          to = pose.rotation[p];
        joint.rotation.x = THREE.MathUtils.damp(
          joint.rotation.x,
          to[0],
          12,
          dt,
        );
        joint.rotation.y = THREE.MathUtils.damp(
          joint.rotation.y,
          to[1],
          12,
          dt,
        );
        joint.rotation.z = THREE.MathUtils.damp(
          joint.rotation.z,
          to[2],
          12,
          dt,
        );
      }
    };
    renderer.setAnimationLoop((now) => {
      const dt = Math.min((now - previous) / 1000 || 0.016, 0.05);
      previous = now;
      elapsed += dt;
      if (!callbacks.current.live && path.length) {
        const goal = new THREE.Vector3(...path[0]),
          delta = goal.clone().sub(player.root.position);
        delta.y = 0;
        const distance = delta.length();
        if (distance < 0.035) {
          player.root.position.x = goal.x;
          player.root.position.z = goal.z;
          path.shift();
        } else {
          const desired = Math.atan2(delta.x, delta.z);
          player.root.rotation.y +=
            Math.atan2(
              Math.sin(desired - player.root.rotation.y),
              Math.cos(desired - player.root.rotation.y),
            ) * Math.min(1, dt * 12);
          player.root.position.add(
            delta.normalize().multiplyScalar(Math.min(distance, dt * 1.8)),
          );
        }
        if (!path.length) {
          target.visible = false;
          if (pendingSeat?.seat) {
            seated = pendingSeat;
            pendingSeat = undefined;
            mode = "sit";
            player.root.rotation.y = THREE.MathUtils.degToRad(
              seated.yaw + seated.seat!.yaw,
            );
          } else mode = preview;
          emit(seated ? `Seated in ${seated.name}.` : "Arrived.");
        }
      }
      if (!callbacks.current.live && seated?.seat) {
        const p = worldPoint(seated, seated.seat.position);
        player.root.position.lerp(
          new THREE.Vector3(p[0], p[1] - 0.76, p[2]),
          Math.min(1, dt * 10),
        );
      }
      const live = callbacks.current.live;
      if (live) {
        const visible = new Set(live.travelers.map((t) => t.id));
        for (const [id, v] of visitors)
          if (!visible.has(id)) {
            scene.remove(v.rig.root);
            v.label.remove();
            visitors.delete(id);
          }
        for (const t of live.travelers) {
          let current = player;
          if (t.id !== live.identity) {
            let v = visitors.get(t.id);
            if (!v || v.definition !== t.character) {
              if (v) {
                scene.remove(v.rig.root);
                v.label.remove();
              }
              const tag = document.createElement("div");
              tag.className = "poc-nameplate";
              tag.textContent = t.name;
              container.appendChild(tag);
              v = {
                rig: rig(t.character),
                label: tag,
                definition: t.character,
              };
              visitors.set(t.id, v);
            }
            current = v.rig;
          }
          const sampled = sampleMotion(t.motion, room, serverNow());
          current.root.position.fromArray(sampled.position);
          current.root.rotation.y +=
            Math.atan2(
              Math.sin(sampled.yaw - current.root.rotation.y),
              Math.cos(sampled.yaw - current.root.rotation.y),
            ) * Math.min(1, dt * 12);
          animateRig(current, sampled.animation, elapsed, dt);
          if (t.id === live.identity) {
            const nextSeat = room.objects.find((o) => o.id === t.motion.seat);
            if (mode !== sampled.animation || seated?.id !== nextSeat?.id) {
              mode = sampled.animation;
              seated = nextSeat;
              emit(
                seated
                  ? `Seat reserved: ${seated.name}`
                  : "Shared room. Click the floor to walk.",
              );
            }
          }
        }
      } else animateRig(player, mode, elapsed, dt);
      animateRig(companion, guestSeat ? "sit" : "idle", elapsed + 0.5, dt);
      controls.update();
      // Only walls between the camera and the room center fade.
      for (const g of walls) {
        const toward = new THREE.Vector3(g.position.x, 0, g.position.z),
          eye = new THREE.Vector3(camera.position.x, 0, camera.position.z);
        const obstructs = toward.dot(eye) > 0;
        g.traverse((c) => {
          if (c instanceof THREE.Mesh) {
            const m = c.material as THREE.MeshStandardMaterial;
            m.opacity = THREE.MathUtils.damp(
              m.opacity,
              obstructs ? 0.12 : 1,
              8,
              dt,
            );
            m.depthWrite = m.opacity > 0.8;
            c.castShadow = m.opacity > 0.8;
          }
        });
      }
      for (const [element, root] of [
        [label, player.root],
        [guestLabel, companion.root],
        ...[...visitors.values()].map((v) => [v.label, v.rig.root] as const),
      ] as const) {
        const point = root.position
          .clone()
          .add(new THREE.Vector3(0, 2.15, 0))
          .project(camera);
        element.style.left = `${((point.x + 1) / 2) * container.clientWidth}px`;
        element.style.top = `${((1 - point.y) / 2) * container.clientHeight}px`;
        element.style.visibility =
          Math.abs(point.x) > 1 || Math.abs(point.y) > 1 ? "hidden" : "visible";
      }
      renderer.render(scene, camera);
    });
    emit();
    return () => {
      controller.current = null;
      delete window.boxWorld;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      const geometries = new Set<THREE.BufferGeometry>(),
        mats = new Set<THREE.Material>();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          geometries.add(o.geometry);
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) => mats.add(m));
        }
      });
      geometries.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      label.remove();
      guestLabel.remove();
      visitors.forEach((v) => v.label.remove());
      materials.forEach((m) => m.dispose());
    };
  }, [props.room, props.character, props.guest, !!props.live, props.showGuest]);
  useEffect(() => {
    if (!props.live || props.command.id > 0)
      controller.current?.(props.command);
  }, [props.command]);
  return <div className="poc-viewport" ref={host} />;
}
