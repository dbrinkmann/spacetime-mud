import * as THREE from "three";

// Object-local, meter-scaled shading: detail follows moving characters and does
// not stretch across large room slabs. No textures or per-box draw calls added.
export function wornMaterial(color: string, emissive = false) {
  const pigment = new THREE.Color(color);
  if (!emissive) {
    const luminance =
      pigment.r * 0.2126 + pigment.g * 0.7152 + pigment.b * 0.0722;
    pigment
      .lerp(new THREE.Color().setRGB(luminance, luminance, luminance), 0.48)
      .multiplyScalar(0.72)
      .addScalar(0.012);
  }
  const material = new THREE.MeshStandardMaterial({
    color: pigment,
    roughness: 0.86,
    metalness: 0.08,
    emissive: emissive ? color : "#000000",
    emissiveIntensity: emissive ? 1.35 : 0,
  });
  if (emissive) return material;
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
      // The second-smallest distance is distance to a box edge, excluding its face.
      vec3 d = max(vec3(0.0), (vec3(0.5) - abs(vBox)) * vSize);
      float edge = min(max(d.x,d.y), min(max(d.x,d.z),max(d.y,d.z)));
      float wear = (1.0-smoothstep(0.0,0.018,edge)) * (0.4+0.6*mottling);
      diffuseColor.rgb *= 0.65 + mottling*0.45 + grain*0.18;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*1.35+vec3(0.025),wear*0.45);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `
      #include <normal_fragment_maps>
      vec3 surfaceDx = dFdx(-vViewPosition), surfaceDy = dFdy(-vViewPosition);
      vec3 surfaceS = cross(surfaceDy, normal), surfaceT = cross(normal, surfaceDx);
      float surfaceDet = dot(surfaceDx, surfaceS);
      float relief = (grain * 0.003 + mottling * 0.012);
      normal = normalize(abs(surfaceDet) * normal - sign(surfaceDet) * (dFdx(relief)*surfaceS + dFdy(relief)*surfaceT));
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (mottling-0.5)*0.18,0.55,1.0);
    `,
    );
  };
  material.customProgramCacheKey = () => "lantern-worn-box-v1";
  return material;
}
