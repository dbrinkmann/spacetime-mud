import * as THREE from "three";
import type { Box } from "../../shared/geometry";

// Object-local, meter-scaled shading: detail follows moving characters and does
// not stretch across large room slabs. No textures or per-box draw calls added.
export function surfaceMaterial(box: Box) {
  const { color, emissive = false, material: kind = "plain", wear = 0 } = box;
  const roughness =
    box.roughness ??
    {
      plain: 0.8,
      asphalt: 0.96,
      concrete: 0.9,
      metal: 0.35,
      wood: 0.75,
      fabric: 1,
      glass: 0.12,
    }[kind];
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: kind === "metal" ? 0.7 : 0,
    transparent: kind === "glass",
    opacity: kind === "glass" ? 0.28 : 1,
    depthWrite: kind !== "glass",
    emissive: emissive ? color : "#000000",
    emissiveIntensity: emissive ? 1.35 : 0,
  });
  if (emissive || (kind === "plain" && wear === 0) || kind === "glass")
    return material;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `varying vec3 vSurface; varying vec3 vBox; varying vec3 vSize;\n` +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `
      #include <begin_vertex>
      vSize = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
      vSurface = position * vSize;
      vBox = position;
    `,
    );
    shader.fragmentShader =
      `
      varying vec3 vSurface; varying vec3 vBox; varying vec3 vSize;
      float surfaceHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
      float surfaceNoise(vec3 p) {
        vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(surfaceHash(i),surfaceHash(i+vec3(1,0,0)),f.x),mix(surfaceHash(i+vec3(0,1,0)),surfaceHash(i+vec3(1,1,0)),f.x),f.y),
        mix(mix(surfaceHash(i+vec3(0,0,1)),surfaceHash(i+vec3(1,0,1)),f.x),mix(surfaceHash(i+vec3(0,1,1)),surfaceHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `
      #include <color_fragment>
      float mottling = surfaceNoise(vSurface * 5.0);
      float grain = surfaceNoise(vSurface * 110.0);
      float pattern = ${kind === "wood" ? "surfaceNoise(vSurface * vec3(35.0, 2.0, 35.0))" : kind === "fabric" ? "0.5 + 0.25*sin(vSurface.x*340.0)*sin((vSurface.y+vSurface.z)*340.0)" : "grain"};
      // The second-smallest distance is distance to a box edge, excluding its face.
      vec3 d = max(vec3(0.0), (vec3(0.5) - abs(vBox)) * vSize);
      float edge = min(max(d.x,d.y), min(max(d.x,d.z),max(d.y,d.z)));
      float wear = (1.0-smoothstep(0.0,0.018,edge)) * (0.4+0.6*mottling);
      diffuseColor.rgb *= ${kind === "concrete" ? "0.88 + mottling*0.16 + grain*0.06" : kind === "wood" ? "0.78 + pattern*0.28" : kind === "asphalt" ? "0.94 + grain*0.1" : kind === "fabric" ? "0.93 + pattern*0.1" : "1.0"};
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*1.35+vec3(0.025),wear*${wear.toFixed(4)}*0.45);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `
      #include <normal_fragment_maps>
      vec3 surfaceDx = dFdx(-vViewPosition), surfaceDy = dFdy(-vViewPosition);
      vec3 surfaceS = cross(surfaceDy, normal), surfaceT = cross(normal, surfaceDx);
      float surfaceDet = dot(surfaceDx, surfaceS);
      float relief = ${kind === "asphalt" ? "grain * 0.0008" : kind === "concrete" ? "grain*0.001 + mottling*0.003" : kind === "wood" ? "pattern*0.001" : kind === "fabric" ? "pattern*0.0008" : "0.0"};
      normal = normalize(abs(surfaceDet) * normal - sign(surfaceDet) * (dFdx(relief)*surfaceS + dFdy(relief)*surfaceT));
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (grain-0.5)*0.04,0.0,1.0);
    `,
    );
  };
  material.customProgramCacheKey = () => `lantern-surface-v2:${kind}:${wear}`;
  return material;
}
