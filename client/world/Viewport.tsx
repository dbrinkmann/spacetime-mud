import { loadSignFont, signMesh } from "./signs";
import { serverNow } from "./clock";
import { deadZoneShift } from "./camera";
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
import { routineMotion } from "../../shared/community-motion";
export type LiveTraveler = {
  id: string;
  name: string;
  character: Character;
  motion: Motion;
  away?: boolean;
};
type WorldSpeech = {
  id: string;
  speakerId: string;
  speaker: string;
  scripted: boolean;
  kind: string;
  message: string;
  createdAt: number;
};
type Props = {
  speech?: WorldSpeech[];
  onObject?: (id: string) => void;
  showGuest?: boolean;
  preview?: { yaw: number; time: number };
  entrances?: Record<string, { label: string; onClick: () => void }>;
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
    const roomScale = Math.max(1, props.room.width / 20, props.room.depth / 20);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#161b20");
    scene.fog = new THREE.Fog("#161b20", 28 * roomScale, 55 * roomScale);
    const camera = new THREE.OrthographicCamera(
      -10,
      10,
      7,
      -7,
      0.1,
      80 * roomScale,
    );
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = true;
    controls.screenSpacePanning = false;
    let manualPan = false,
      returningToPlayer = false,
      wasMoving = false;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.35;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    const reset = () => {
      manualPan = false;
      returningToPlayer = false;
      const live = callbacks.current.live;
      const me = live?.travelers.find((t) => t.id === live.identity);
      const origin = live
        ? me
          ? sampleMotion(me.motion, props.room, serverNow()).position
          : props.room.spawn
        : [0, 0, 0];
      const distanceScale = live ? 1 : roomScale;
      camera.position.set(
        origin[0] + 11 * distanceScale,
        11 * distanceScale,
        origin[2] + 15 * distanceScale,
      );
      if (props.preview)
        camera.position.applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          THREE.MathUtils.degToRad(props.preview.yaw),
        );
      camera.zoom = 1;
      controls.target.set(origin[0], 0.65, origin[2]);
      camera.updateProjectionMatrix();
      controls.update();
    };
    reset();
    scene.add(new THREE.HemisphereLight("#cfdef0", "#7d6048", 2));
    const sun = new THREE.DirectionalLight("#ffe4be", 3.2);
    sun.position.set(2 * roomScale, 10 * roomScale, 6 * roomScale);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -10 * roomScale;
    sun.shadow.camera.right = 10 * roomScale;
    sun.shadow.camera.top = 10 * roomScale;
    sun.shadow.camera.bottom = -10 * roomScale;
    sun.shadow.camera.far = 100 * roomScale;
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
    const signs = (room.signs ?? []).map(signMesh);
    signs.forEach((s) => scene.add(s.mesh));
    let disposed = false;
    if (signs.length)
      void loadSignFont()
        .then(() => {
          if (!disposed) signs.forEach((s) => s.redraw());
        })
        .catch(() =>
          callbacks.current.onError(
            "Sign font failed to load. Reopen the room to retry.",
          ),
        );
    const npcs = (room.npcs ?? []).map((n) => {
      const actor = rig(n.character);
      if (n.objectId) {
        actor.root.traverse((mesh) => {
          mesh.userData.scriptObjectId = n.objectId;
        });
        pickables.push(actor.root);
      }
      actor.root.position.fromArray(n.position);
      actor.root.rotation.y = THREE.MathUtils.degToRad(n.yaw);
      return { actor, definition: n };
    });
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
      lastMessage =
        "Click the floor to walk. Drag to orbit. Right-drag to pan. Scroll to zoom.";
    const speechBubbles = new Map<
      string,
      { element: HTMLDivElement; signature: string }
    >();
    const entranceLabels = room.objects
      .filter((o) => (o.homeEntrance || o.exit) && props.entrances?.[o.id])
      .map((o) => {
        const element = document.createElement("div");
        element.className = "poc-nameplate community-entrance";
        element.setAttribute("role", "tooltip");
        element.style.visibility = "hidden";
        container.appendChild(element);
        return { element, id: o.id, root: objects.get(o.id)! };
      });
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
      const entrance = callbacks.current.entrances?.[o.id];
      if (entrance) {
        entrance.onClick();
        return;
      }
      if (o.objectId && callbacks.current.onObject) {
        callbacks.current.onObject(o.objectId);
        return;
      }
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
    let hoverPointer: [number, number] | undefined;
    const pointerMove = (e: PointerEvent) => {
      hoverPointer =
        e.pointerType === "touch" || e.buttons
          ? undefined
          : [e.clientX, e.clientY];
    };
    const pointerLeave = () => {
      hoverPointer = undefined;
    };
    let down = [0, 0];
    const pointerDown = (e: PointerEvent) => {
      hoverPointer = undefined;
      if (
        e.button === 2 ||
        (e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey))
      ) {
        manualPan = true;
        returningToPlayer = false;
      }
      down = [e.clientX, e.clientY];
    };
    const pointerUp = (e: PointerEvent) => {
      if (
        e.button !== 0 ||
        e.shiftKey ||
        e.ctrlKey ||
        e.metaKey ||
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
      if (hit.object.userData.scriptObjectId) {
        callbacks.current.onObject?.(hit.object.userData.scriptObjectId);
        return;
      }
      const id = hit.object.userData.objectId;
      if (id) {
        const placement = room.objects.find((o) => o.id === id)!;
        if (
          callbacks.current.live &&
          !placement.collision &&
          !placement.seat &&
          !placement.objectId &&
          !placement.homeEntrance &&
          !placement.exit
        ) {
          // Roads, rugs and other non-colliding scenery do not consume movement
          // clicks. Navigation remains on the ground plane and server-validated.
          callbacks.current.live.onMove(hit.point.x, hit.point.z, "", "idle");
        } else choose(placement);
      } else if (hit.object.userData.floor) {
        if (callbacks.current.live)
          callbacks.current.live.onMove(hit.point.x, hit.point.z, "", "idle");
        else move([hit.point.x, 0, hit.point.z]);
      }
    };
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerleave", pointerLeave);
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
      const w = Math.max(1, container.clientWidth),
        h = Math.max(1, container.clientHeight);
      const extent = Math.max(room.width, room.depth);
      // Live play frames the character at a consistent scale, irrespective of
      // the room footprint. Authoring previews still show the complete scene.
      const span = props.live
        ? Math.max(4.5, 3 / (w / h))
        : Math.max(extent * 0.61, (extent * 0.78) / (w / h));
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
          ...sampleMotion(
            t.away ? routineMotion(t.motion, serverNow()) : t.motion,
            room,
            serverNow(),
          ),
        })),
        npcs: npcs.map((n) => ({
          id: n.definition.id,
          animation: n.definition.animation,
          position: n.actor.root.position.toArray(),
          head: n.actor.joints.head.rotation.toArray(),
        })),
        signs: (room.signs ?? []).map((s) => s.text),
        walls: walls.map((g) => ({
          position: g.position.toArray(),
          opacity: (
            (g.children[0] as THREE.Mesh)
              ?.material as THREE.MeshStandardMaterial
          )?.opacity,
        })),
        camera: {
          span: camera.top,
          zoom: camera.zoom,
          target: controls.target.toArray(),
          manualPan,
          returningToPlayer,
        },
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
      elapsed = props.preview ? props.preview.time : elapsed + dt;
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
            if (v.label.textContent !== t.name) v.label.textContent = t.name;
          }
          const sampled = sampleMotion(
            t.away ? routineMotion(t.motion, serverNow()) : t.motion,
            room,
            serverNow(),
          );
          current.root.position.fromArray(sampled.position);
          current.root.rotation.y +=
            Math.atan2(
              Math.sin(sampled.yaw - current.root.rotation.y),
              Math.cos(sampled.yaw - current.root.rotation.y),
            ) * Math.min(1, dt * 12);
          animateRig(current, sampled.animation, elapsed, dt);
          if (t.id === live.identity) {
            const nameplate = `${t.name} · you`;
            if (label.textContent !== nameplate) label.textContent = nameplate;
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
      for (const n of npcs)
        animateRig(
          n.actor,
          n.definition.animation,
          elapsed,
          props.preview ? 1 : dt,
        );
      animateRig(companion, guestSeat ? "sit" : "idle", elapsed + 0.5, dt);
      controls.update();
      if (live) {
        const destination = new THREE.Vector3(
          player.root.position.x,
          0.65,
          player.root.position.z,
        );
        const moving = mode === "walk";
        const outside = deadZoneShift(camera, destination);
        if (manualPan && moving && !wasMoving) {
          manualPan = false;
          returningToPlayer = outside.lengthSq() > 0.0001;
        }
        wasMoving = moving;
        if (!manualPan) {
          const shift = returningToPlayer
            ? destination
                .clone()
                .sub(controls.target)
                .multiplyScalar(1 - Math.exp(-8 * dt))
            : outside;
          camera.position.add(shift);
          controls.target.add(shift);
          camera.updateMatrixWorld();
          if (
            returningToPlayer &&
            controls.target.distanceToSquared(destination) < 0.0025
          )
            returningToPlayer = false;
        }
      }
      // Fade walls on the camera side of the current focus, including when
      // following a character far from the room origin.
      for (const g of walls) {
        const toward = new THREE.Vector3(
            g.position.x - controls.target.x,
            0,
            g.position.z - controls.target.z,
          ),
          eye = new THREE.Vector3(
            camera.position.x - controls.target.x,
            0,
            camera.position.z - controls.target.z,
          );
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
      for (const entry of entranceLabels)
        entry.element.textContent =
          callbacks.current.entrances?.[entry.id]?.label ?? "Entrance";
      for (const [element, root] of [
        ...entranceLabels.map((e) => [e.element, e.root] as const),
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
      const speaking = new Map<string, WorldSpeech[]>();
      for (const m of callbacks.current.speech ?? []) {
        const age = serverNow() - m.createdAt;
        if (
          age > Math.min(30000, Math.max(12000, m.message.length * 60)) ||
          age < -5000
        )
          continue;
        const key = (m.scripted ? "object:" : "player:") + m.speakerId;
        const messages = speaking.get(key) ?? [];
        messages.push(m);
        speaking.set(key, messages);
      }
      for (const [key, bubble] of speechBubbles)
        if (!speaking.has(key)) {
          bubble.element.remove();
          speechBubbles.delete(key);
        }
      for (const [key, messages] of speaking) {
        const recent = messages
          .sort(
            (a, b) =>
              a.createdAt - b.createdAt ||
              (BigInt(a.id) < BigInt(b.id) ? -1 : 1),
          )
          .slice(-3);
        const latest = recent[recent.length - 1];
        let bubble = speechBubbles.get(key);
        if (!bubble) {
          const element = document.createElement("div");
          element.className = "world-speech-bubble";
          element.setAttribute("role", "status");
          element.setAttribute("aria-live", "polite");
          container.appendChild(element);
          bubble = { element, signature: "" };
          speechBubbles.set(key, bubble);
        }
        const signature = recent.map((m) => m.id).join(",");
        if (bubble.signature !== signature) {
          bubble.element.replaceChildren();
          for (const m of recent) {
            const line = document.createElement("p");
            const name = document.createElement("strong");
            name.textContent =
              m.speaker +
              (m.scripted ? " (object)" : "") +
              (m.kind === "tell" ? " (to you)" : "");
            line.append(
              name,
              document.createTextNode(
                (m.kind === "emote" ? " " : ": ") + m.message,
              ),
            );
            if (m.kind === "emote") line.className = "speech-emote";
            bubble.element.appendChild(line);
          }
          bubble.signature = signature;
        }
        let anchor: THREE.Vector3 | undefined;
        if (!latest.scripted) {
          const actor =
            latest.speakerId === callbacks.current.live?.identity
              ? player
              : visitors.get(latest.speakerId)?.rig;
          if (actor)
            anchor = actor.root.position
              .clone()
              .add(new THREE.Vector3(0, 2.6, 0));
        } else {
          const npc = npcs.find(
            (n) => n.definition.objectId === latest.speakerId,
          );
          const placement = room.objects.find(
            (o) => o.objectId === latest.speakerId,
          );
          if (npc)
            anchor = npc.actor.root.position
              .clone()
              .add(new THREE.Vector3(0, 2.6, 0));
          else if (placement) {
            const bounds = new THREE.Box3().setFromObject(
              objects.get(placement.id)!,
            );
            anchor = bounds.getCenter(new THREE.Vector3());
            anchor.y = bounds.max.y + 0.4;
          }
        }
        const projected = anchor?.project(camera);
        bubble.element.classList.toggle("room-voice", !anchor);
        bubble.element.style.visibility =
          projected &&
          (Math.abs(projected.x) > 1 ||
            Math.abs(projected.y) > 1 ||
            Math.abs(projected.z) > 1)
            ? "hidden"
            : "visible";
        const width = container.clientWidth;
        const half = Math.min(150, (width - 16) / 2);
        bubble.element.style.left = `${projected ? THREE.MathUtils.clamp(((projected.x + 1) / 2) * width, half + 8, width - half - 8) : width / 2}px`;
        bubble.element.style.top = `${projected ? Math.max(bubble.element.offsetHeight + 8, ((1 - projected.y) / 2) * container.clientHeight) : bubble.element.offsetHeight + 12}px`;
      }
      // Raycast the door geometry rather than the projected label. Re-evaluate as
      // the camera moves so a stationary pointer cannot leave a stale tooltip.
      let hoveredEntrance: string | undefined;
      if (hoverPointer) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((hoverPointer[0] - rect.left) / rect.width) * 2 - 1,
          -((hoverPointer[1] - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(pickables, true)[0];
        const id = hit?.object.userData.objectId;
        if (id && callbacks.current.entrances?.[id]) hoveredEntrance = id;
      }
      for (const entry of entranceLabels) {
        if (entry.id !== hoveredEntrance)
          entry.element.style.visibility = "hidden";
      }
      renderer.domElement.style.cursor = hoveredEntrance ? "pointer" : "";
      renderer.render(scene, camera);
    });
    emit();
    return () => {
      disposed = true;
      signs.forEach((s) => s.dispose());
      controller.current = null;
      delete window.boxWorld;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerleave", pointerLeave);
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
      entranceLabels.forEach((e) => e.element.remove());
      speechBubbles.forEach((b) => b.element.remove());
      label.remove();
      guestLabel.remove();
      visitors.forEach((v) => v.label.remove());
      materials.forEach((m) => m.dispose());
    };
  }, [
    props.room,
    props.character,
    props.guest,
    !!props.live,
    props.showGuest,
    props.preview,
  ]);
  useEffect(() => {
    if (!props.live || props.command.id > 0)
      controller.current?.(props.command);
  }, [props.command]);
  return <div className="poc-viewport" ref={host} />;
}
