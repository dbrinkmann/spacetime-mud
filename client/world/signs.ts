import * as THREE from "three";
import type { Sign } from "../../shared/geometry";
let loaded: Promise<void> | undefined;
export function loadSignFont() {
  return (loaded ??= (async () => {
    const face = new FontFace(
      "LanternSigns",
      `url(${import.meta.env.BASE_URL}fonts/NotoSansJP.ttf)`,
    );
    document.fonts.add(await face.load());
  })());
}
export function signMesh(sign: Sign) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.max(
    64,
    Math.min(1024, Math.round((1024 * sign.height) / sign.width)),
  );
  const ctx = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  let text = sign.text;
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (sign.background) {
      ctx.fillStyle = sign.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const lines = text.split("\n");
    let fontSize = Math.min(160, (canvas.height * 0.8) / lines.length);
    ctx.font = `${fontSize}px LanternSigns`;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 1);
    fontSize *= Math.min(1, (canvas.width * 0.9) / widest);
    ctx.font = `${fontSize}px LanternSigns`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = sign.color;
    lines.forEach((line, i) =>
      ctx.fillText(
        line,
        canvas.width / 2,
        canvas.height / 2 + (i - (lines.length - 1) / 2) * fontSize * 1.1,
      ),
    );
    texture.needsUpdate = true;
  };
  draw();
  const material = sign.emissive
    ? new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    : new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
      });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sign.width, sign.height),
    material,
  );
  mesh.position.fromArray(sign.position);
  mesh.rotation.y = THREE.MathUtils.degToRad(sign.yaw);
  return {
    mesh,
    getText: () => text,
    redraw: draw,
    setText: (next: string) => {
      if (next !== text) {
        text = next;
        draw();
      }
    },
    dispose: () => texture.dispose(),
  };
}
