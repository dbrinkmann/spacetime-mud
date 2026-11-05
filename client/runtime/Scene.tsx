import { buildCharacter } from "../world/character";
import { poseFor } from "../world/animation";
import { neutralCharacter } from "../../shared/world";
import { parts } from "../../shared/geometry";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  styledBox,
  industrialPostprocessing,
  floorSeams,
  fadeRenderable,
} from "../world/render-style";
import { signMesh, loadSignFont } from "../world/signs";
import type { Sign, Character } from "../../shared/geometry";
import type { Box } from "../../shared/geometry";
import type { RoomPresentation } from "../../shared/runtime/presentation";
import { walkerPosition } from "../../shared/runtime/walking";
import {
  sampleOperation,
  type TransformValue,
} from "../../shared/runtime/operations";

/** Renders a projection only; behavior code never executes in the browser. */
export function RuntimeScene({
  snapshot,
  onSelect,
  onWalk,
  onSay,
  self,
  preview,
}: {
  snapshot: RoomPresentation;
  onSelect: (id: string) => void;
  onWalk: (x: number, z: number) => void;
  onSay: (text: string) => void;
  self: string;
  preview?: {
    focus?: [number, number, number];
    zoom?: number;
    yaw?: number;
    time?: number;
  };
}) {
  const [typing, setTyping] = useState(false),
    [draft, setDraft] = useState("");
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(
          (e.target as HTMLElement)?.tagName,
        )
      ) {
        e.preventDefault();
        setTyping(true);
      }
      if (e.key === "Escape") setTyping(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({
    snapshot,
    received: performance.now(),
    onSelect,
    onWalk,
    self,
  });
  useEffect(() => {
    current.current = {
      snapshot,
      received: performance.now(),
      onSelect,
      onWalk,
      self,
    };
  }, [snapshot]);
  useEffect(() => {
    current.current.onSelect = onSelect;
    current.current.onWalk = onWalk;
    current.current.self = self;
  }, [onSelect, onWalk, self]);
  useEffect(() => {
    const element = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor("#11171c");
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#11171c");
    scene.add(new THREE.HemisphereLight("#9fb6ce", "#39332f", 1.1));
    const sun = new THREE.DirectionalLight("#d3deeb", 1.65);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    let lightingScale = 0;
    const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 500);
    camera.position.set(11, 11, 15);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.screenSpacePanning = false;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.35;
    controls.target.set(0, 0.65, 0);
    if (preview) {
      controls.target.fromArray(preview.focus ?? [0, 0.65, 0]);
      camera.zoom = preview.zoom ?? 1;
      camera.position
        .set(11, 10.35, 15)
        .applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          THREE.MathUtils.degToRad(preview.yaw ?? 0),
        )
        .add(controls.target);
      controls.enabled = false;
    }
    controls.update();
    const nodes = new Map<
      string,
      {
        group: THREE.Group;
        visual: string;
        lights: Map<string, THREE.PointLight>;
        parts: Map<string, THREE.Group>;
        rig?: ReturnType<typeof buildCharacter>;
      }
    >();
    const avatars = new Map<string, THREE.Group>();
    const avatarDefinitions = new Map<string, string>();
    const rigs = new Map<string, ReturnType<typeof buildCharacter>>();
    const bubbles = new Map<string, HTMLDivElement>();
    const names = new Map<string, HTMLDivElement>();
    const tooltip = document.createElement("div");
    tooltip.className = "runtime-bubble";
    tooltip.hidden = true;
    element.appendChild(tooltip);
    let hovered = "";
    const dispose = (group: THREE.Group) => {
      group.traverse((node) => {
        if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
          node.geometry.dispose();
          const materials = Array.isArray(node.material)
            ? node.material
            : [node.material];
          materials.forEach((m) => {
            (m as THREE.MeshStandardMaterial).map?.dispose();
            m.dispose();
          });
        }
      });
      scene.remove(group);
    };
    const effects = industrialPostprocessing(renderer, scene, camera);
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(width, height);
      const aspect = width / Math.max(1, height);
      const span = Math.max(4.5, 3 / aspect);
      camera.left = -span * aspect;
      camera.right = span * aspect;
      camera.top = span;
      camera.bottom = -span;
      effects.resize(width, height);
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
          if (
            entity?.actions.length ||
            entity?.components.collider ||
            current.current.snapshot.interactions?.some((r) =>
              r.target?.kinds.includes("object"),
            )
          )
            current.current.onSelect(node.userData.entity);
          else current.current.onWalk(hit.point.x, hit.point.z);
        }
      }
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    const hover = (e: PointerEvent) => {
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
      let node: THREE.Object3D | null = hit?.object ?? null;
      while (node && !node.userData.entity) node = node.parent;
      hovered = node?.userData.entity ?? "";
      const entity = current.current.snapshot.entities.find(
        (e) => e.id === hovered,
      );
      if (!entity?.actions.length && !entity?.components.homeEntrance)
        hovered = "";
      tooltip.textContent = entity
        ? String(
            entity.components.label ??
              (entity.components.homeEntrance as { name: string } | undefined)
                ?.name ??
              entity.id,
          )
        : "";
      tooltip.style.left = `${e.clientX - rect.left}px`;
      tooltip.style.top = `${e.clientY - rect.top - 12}px`;
      tooltip.hidden = !hovered;
      renderer.domElement.style.cursor = hovered ? "pointer" : "default";
    };
    renderer.domElement.addEventListener("pointermove", hover);
    renderer.domElement.addEventListener("pointerleave", () => {
      tooltip.hidden = true;
      hovered = "";
    });
    let frame = 0;
    let lastPlayer: THREE.Vector3 | undefined;
    let cameraLocation = "";
    let manipulating = false;
    controls.addEventListener("start", () => {
      manipulating = true;
    });
    controls.addEventListener("end", () => {
      manipulating = false;
    });
    const render = () => {
      const { snapshot: data, received } = current.current;
      const surface = data.entities.find((e) => e.components.walkSurface)
        ?.components.walkSurface as
        { width: number; depth: number } | undefined;
      const scale = Math.max(
        1,
        (surface?.width ?? 20) / 20,
        (surface?.depth ?? 20) / 20,
      );
      if (scale !== lightingScale) {
        lightingScale = scale;
        sun.position.set(2 * scale, 10 * scale, 6 * scale);
        sun.shadow.camera.left = sun.shadow.camera.bottom = -10 * scale;
        sun.shadow.camera.right = sun.shadow.camera.top = 10 * scale;
        sun.shadow.camera.far = 100 * scale;
        sun.shadow.camera.updateProjectionMatrix();
        scene.fog = new THREE.Fog("#11171c", 28 * scale, 55 * scale);
      }
      const now =
        data.serverTime +
        (preview ? (preview.time ?? 0) : (performance.now() - received) / 1000);
      for (const [id, label] of names)
        if (!data.walkers?.some((w) => w.id === id)) {
          label.remove();
          names.delete(id);
        }
      for (const [id, avatar] of avatars)
        if (!data.walkers?.some((w) => w.id === id)) {
          dispose(avatar);
          avatars.delete(id);
          rigs.delete(id);
        }
      for (const walker of data.walkers ?? []) {
        let avatar = avatars.get(walker.id);
        const definition = JSON.stringify(walker.character ?? null);
        if (avatar && avatarDefinitions.get(walker.id) !== definition) {
          dispose(avatar);
          avatars.delete(walker.id);
          rigs.delete(walker.id);
          avatar = undefined;
        }
        avatarDefinitions.set(walker.id, definition);
        if (!avatar) {
          const rig = buildCharacter(
            walker.character ?? neutralCharacter("Traveler"),
            (parent, box) => {
              const mesh = styledBox(box);
              parent.add(mesh);
            },
          );
          avatar = rig.root;
          rigs.set(walker.id, rig);
          avatars.set(walker.id, avatar);
          scene.add(avatar);
        }
        const position = walkerPosition(walker, now),
          next = walkerPosition(walker, now + 0.05);
        avatar.position.fromArray(position);
        if (walker.seat) {
          const seat = data.entities.find((e) => e.id === walker.seat);
          const yaw =
            (seat?.components.seat as { yaw: number } | undefined)?.yaw ?? 0;
          const rotation =
            (
              seat?.components.transform as unknown as
                TransformValue | undefined
            )?.rotation[1] ?? 0;
          avatar.rotation.y = THREE.MathUtils.degToRad(yaw + rotation);
        }
        if (Math.hypot(next[0] - position[0], next[2] - position[2]) > 0.0001) {
          avatar.rotation.y = Math.atan2(
            next[0] - position[0],
            next[2] - position[2],
          );
        }
        const rig = rigs.get(walker.id)!;
        const pose = poseFor(
          walker.gesture && walker.gesture.until > now
            ? walker.gesture.animation
            : walker.seat
              ? "sit"
              : Math.hypot(next[0] - position[0], next[2] - position[2]) >
                  0.0001
                ? "walk"
                : "idle",
          now,
        );
        rig.body.position.y = pose.bob;
        for (const part of parts)
          rig.joints[part].rotation.set(...pose.rotation[part]);
        let label = names.get(walker.id);
        if (!label) {
          label = document.createElement("div");
          label.className = "runtime-name";
          element.appendChild(label);
          names.set(walker.id, label);
        }
        label.textContent =
          walker.name ??
          (walker.id === current.current.self ? "You" : "Traveler");
        const projected = avatar.position
          .clone()
          .add(new THREE.Vector3(0, 2.1, 0))
          .project(camera);
        label.style.left = `${((projected.x + 1) * element.clientWidth) / 2}px`;
        label.style.top = `${((1 - projected.y) * element.clientHeight) / 2}px`;
        label.hidden = projected.z > 1;
      }
      for (const [id, node] of nodes)
        if (!data.entities.some((e) => e.id === id)) {
          dispose(node.group);
          nodes.delete(id);
        }
      for (const e of data.entities) {
        const visuals = Object.entries(e.components).filter(
          ([key]) => key === "visual" || key.startsWith("visual."),
        );
        const signs = Object.entries(e.components).filter(
          ([key]) => key === "sign" || key.startsWith("sign."),
        );
        const texts = Object.entries(e.components).filter(
          ([key]) => key === "text" || key.startsWith("text."),
        );
        const visual = JSON.stringify([
          visuals,
          signs,
          e.components.character,
          e.components.walkSurface,
          texts,
        ]);
        let node = nodes.get(e.id);
        if (!node || node.visual !== visual) {
          if (node) dispose(node.group);
          const group = new THREE.Group();
          group.userData.entity = e.id;
          const parts = new Map<string, THREE.Group>();
          for (const [key, value] of visuals) {
            const part = key === "visual" ? group : new THREE.Group();
            if (part !== group) {
              group.add(part);
              parts.set(key.slice(7), part);
            }
            const boxes = (value as unknown as { boxes: Box[] }).boxes;
            for (const box of boxes) {
              const mesh = styledBox(box);
              part.add(mesh);
            }
          }
          const authoredSigns = [...signs];
          const surface = e.components.walkSurface as
            { width: number; depth: number } | undefined;
          const floorBox = (
            e.components.visual as unknown as { boxes: Box[] } | undefined
          )?.boxes[0];
          if (
            surface &&
            floorBox &&
            (!floorBox.material ||
              ["plain", "concrete"].includes(floorBox.material))
          )
            group.add(
              floorSeams(
                surface.width,
                surface.depth,
                floorBox.position[1] + floorBox.size[1] / 2 + 0.002,
              ),
            );
          for (const [key, text] of texts) {
            const signKey = key.replace(/^text/, "sign");
            const existing = authoredSigns.findIndex(
              ([key]) => key === signKey,
            );
            if (existing >= 0)
              authoredSigns[existing] = [
                signKey,
                { ...(authoredSigns[existing][1] as object), text },
              ];
            else
              authoredSigns.push([
                signKey,
                {
                  text,
                  position: [0, 2.5, 0],
                  yaw: 0,
                  width: 2,
                  height: 0.4,
                  color: "#ffffff",
                  emissive: true,
                },
              ]);
          }
          for (const [key, value] of authoredSigns) {
            const name = (key as string).slice(5);
            let parent = group;
            if ((key as string).startsWith("sign.")) {
              if (!parts.has(name)) {
                const part = new THREE.Group();
                parts.set(name, part);
                group.add(part);
              }
              parent = parts.get(name)!;
            }
            const sign = signMesh({
              ...(value as unknown as Sign),
              id: key as string,
            });
            parent.add(sign.mesh);
            void loadSignFont()
              .then(sign.redraw)
              .catch(() => {});
          }
          let rig: ReturnType<typeof buildCharacter> | undefined;
          if (e.components.character) {
            rig = buildCharacter(
              e.components.character as unknown as Character,
              (parent, box) => {
                const mesh = styledBox(box);
                parent.add(mesh);
              },
            );
            group.add(rig.root);
          }
          node = { group, visual, parts, rig, lights: new Map() };
          nodes.set(e.id, node);
          scene.add(group);
        }
        node.group.visible = e.components.visibility !== false;
        if (node.rig) {
          const pose = poseFor(
            (e.components.animation ??
              "idle") as import("../world/animation").Animation,
            now,
          );
          node.rig.body.position.y = pose.bob;
          for (const part of parts)
            node.rig.joints[part].rotation.set(...pose.rotation[part]);
        }
        const lights = Object.entries(e.components).filter(
          ([key]) => key === "light" || key.startsWith("light."),
        );
        for (const [key, light] of node.lights)
          if (!lights.some(([k]) => k === key)) {
            light.removeFromParent();
            node.lights.delete(key);
          }
        for (const [key, value] of lights) {
          let light = node.lights.get(key);
          if (!light) {
            light = new THREE.PointLight();
            node.lights.set(key, light);
            let parent = node.group;
            if (key.startsWith("light.")) {
              const name = key.slice(6);
              if (!node.parts.has(name)) {
                const part = new THREE.Group();
                node.parts.set(name, part);
                node.group.add(part);
              }
              parent = node.parts.get(name)!;
            }
            parent.add(light);
          }
          const spec = value as { color: string; intensity: number };
          light.color.set(spec.color);
          light.intensity = spec.intensity * 1.15;
          light.distance = 10;
          light.decay = 1.5;
        }
        for (const [name, part] of node.parts) {
          const op = e.operations.find(
            (o) => o.resource === `transform.${name}`,
          );
          const pose = op
            ? sampleOperation(op, now)
            : (e.components[`transform.${name}`] as unknown as
                TransformValue | undefined);
          part.position.fromArray(pose?.position ?? [0, 0, 0]);
          part.rotation.set(
            ...((pose?.rotation ?? [0, 0, 0]).map(THREE.MathUtils.degToRad) as [
              number,
              number,
              number,
            ]),
          );
          part.visible = e.components[`visibility.${name}`] !== false;
        }
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
        const floor = data.entities.find((e) => e.components.walkSurface)
          ?.components.walkSurface as
          { width: number; depth: number } | undefined;
        const outside = floor
          ? Math.max(
              0,
              Math.abs(node.group.position.x) - floor.width / 2,
              Math.abs(node.group.position.z) - floor.depth / 2,
            )
          : 0;
        const fade = Math.max(0, 1 - outside / 8);
        if (fade === 0) node.group.visible = false;
        const towardCamera = camera.position
          .clone()
          .sub(controls.target)
          .setY(0)
          .normalize();
        const wallFade =
          e.components.wall === true &&
          node.group.position.clone().sub(controls.target).dot(towardCamera) > 0
            ? 0.08
            : 1;
        fadeRenderable(node.group, fade * wallFade);
        for (const [name, part] of node.parts)
          if (e.components[`wall.${name}`] === true) {
            const position = new THREE.Vector3();
            part.getWorldPosition(position);
            fadeRenderable(
              part,
              fade *
                (position.sub(controls.target).dot(towardCamera) > 0
                  ? 0.08
                  : 1),
            );
          }
      }
      const local = avatars.get(current.current.self);
      if (local) {
        const location =
          data.location &&
          `${data.location.property}/${data.location.room}/${current.current.self}`;
        if (!preview && location && location !== cameraLocation) {
          const target = local.position
            .clone()
            .add(new THREE.Vector3(0, 0.65, 0));
          camera.position.add(target.clone().sub(controls.target));
          controls.target.copy(target);
          cameraLocation = location;
          lastPlayer = local.position.clone();
        }
        const moved =
          lastPlayer && local.position.distanceToSquared(lastPlayer) > 1e-8;
        if (moved && !manipulating) {
          const ndc = local.position
            .clone()
            .add(new THREE.Vector3(0, 1, 0))
            .project(camera);
          const x = THREE.MathUtils.clamp(ndc.x, -0.35, 0.35),
            y = THREE.MathUtils.clamp(ndc.y, -0.35, 0.35);
          if (x !== ndc.x || y !== ndc.y) {
            ray.setFromCamera(new THREE.Vector2(x, y), camera);
            const at = new THREE.Vector3();
            if (
              ray.ray.intersectPlane(
                new THREE.Plane(
                  new THREE.Vector3(0, 1, 0),
                  -local.position.y - 1,
                ),
                at,
              )
            ) {
              const shift = local.position
                .clone()
                .add(new THREE.Vector3(0, 1, 0))
                .sub(at)
                .multiplyScalar(0.12);
              camera.position.add(shift);
              controls.target.add(shift);
            }
          }
        }
        lastPlayer = local.position.clone();
      } else lastPlayer = undefined;
      controls.update();
      const composer = element.querySelector<HTMLElement>("[data-composer]");
      const me = avatars.get(current.current.self);
      if (composer && me) {
        const point = me.position
          .clone()
          .add(new THREE.Vector3(0, 2, 0))
          .project(camera);
        composer.style.left = `${((point.x + 1) * element.clientWidth) / 2}px`;
        composer.style.top = `${((1 - point.y) * element.clientHeight) / 2}px`;
      }
      const speech = (data.interactions ?? []).filter(
        (r) => r.kind === "speech" && r.expires > now,
      );
      for (const [id, label] of bubbles)
        if (!speech.some((r) => r.id === id)) {
          label.remove();
          bubbles.delete(id);
        }
      for (const record of speech) {
        const anchor =
          nodes.get(record.entity)?.group ??
          avatars.get(record.entity.replace(/^player:/, ""));
        if (!anchor) continue;
        let label = bubbles.get(record.id);
        if (!label) {
          label = document.createElement("div");
          label.className = "runtime-bubble";
          label.textContent = record.text;
          element.appendChild(label);
          bubbles.set(record.id, label);
        }
        const point = anchor.position
          .clone()
          .add(new THREE.Vector3(0, 2, 0))
          .project(camera);
        label.style.left = `${((point.x + 1) * element.clientWidth) / 2}px`;
        label.style.top = `${((1 - point.y) * element.clientHeight) / 2}px`;
        label.hidden = point.z > 1 || !anchor.visible;
      }
      effects.render();
      frame = requestAnimationFrame(render);
    };
    render();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      nodes.forEach((n) => dispose(n.group));
      avatars.forEach(dispose);
      bubbles.forEach((b) => b.remove());
      names.forEach((n) => n.remove());
      tooltip.remove();
      effects.dispose();
      sun.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div
      ref={host}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        position: "relative",
        overflow: "hidden",
      }}
      aria-label="Runtime world preview"
    >
      {typing && (
        <form
          data-composer
          className="runtime-composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) onSay(draft.trim());
            setDraft("");
            setTyping(false);
          }}
        >
          <input
            autoFocus
            aria-label="Say something"
            maxLength={1000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Say something…"
          />
        </form>
      )}
    </div>
  );
}
