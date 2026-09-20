// One ShaderMaterial for terrain and the clipped water/ice sheet (R3, 002 T016). The vertex
// stage morphs each vertex toward its next-coarser lod height near the outer edge of its
// lod band (T056); surface verts carry aMorph = level so the sheet never lifts. The
// fragment stage does the altitude/slope palette, forest speckle, warm/cool sun shading,
// flat surface colour with a Blinn specular, and themed exponential fog that resolves to
// the shared skyGradient at the horizon (FR-022b/c/d/e/g). All palette/sky/fog/lighting
// values are Theme-owned uniforms staged together by applyThemeToMaterial.
import { Color, ShaderMaterial, Uniform, Vector2, Vector3 } from "three";
import { CHUNK_SIZE, SPECKLE_SIZE, WATER_LEVEL } from "../constants";
import { SKY_GRADIENT_GLSL, writeSkyUniforms } from "./sky";
import type { Theme } from "../sim/themes";

const VERTEX = `
attribute vec4 biomeA;
attribute vec4 biomeB;
attribute float aMorph;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vTerrainY;
varying vec4 vBiomeA;
varying vec4 vBiomeB;

uniform float uWaterLevel;
uniform float uChunkSize;
uniform vec2 uPlanePos;

void main() {
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  // lod morph (T056): as the chunk's Chebyshev distance from the plane nears the outer
  // edge of its lod band, pull vertices toward their next-coarser-grid height so the
  // lod swap is continuous. biomeB.y/z carry the band edges in chunk units.
  vec2 centre = modelMatrix[3].xz / uChunkSize + 0.5;
  vec2 planeC = uPlanePos / uChunkSize;
  float cheb = max(abs(centre.x - planeC.x), abs(centre.y - planeC.y));
  float y = mix(wp.y, aMorph, smoothstep(biomeB.y, biomeB.z, cheb));
  vTerrainY = y;
  wp.y = y;
  vWorldPos = wp;
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vNormal = n;
  vBiomeA = biomeA;
  vBiomeB = biomeB;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAGMENT = `
${SKY_GRADIENT_GLSL}
uniform float uWaterLevel;
uniform float uSpeckleSize;
uniform vec3 uCamPos;
uniform vec3 uSnow;
uniform vec3 uRock;
uniform vec3 uForest;
uniform vec3 uVegetation;
uniform vec3 uShoreline;
uniform vec3 uLakeNear;
uniform vec3 uLakeDeep;
uniform vec3 uFogNear;
uniform vec3 uFogFar;
uniform vec3 uSunHalo;
uniform vec3 uSunDir;
uniform vec3 uCoolTint;
uniform vec3 uWarmTint;
uniform float uFogScale;
uniform float uAmbient;
uniform float uKey;
uniform float uForestStrength;
uniform float uSpecStrength;
uniform float uSpecShininess;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vTerrainY;
varying vec4 vBiomeA;
varying vec4 vBiomeB;

void main() {
  // The surface sheet is real geometry at exactly uWaterLevel (biomeB.w = 1), so fragments
  // classify by flag, not by height — no depth-write trick needed.
  float wSurface = step(0.5, vBiomeB.w);
  vec3 surfacePos = vWorldPos;
  vec3 n = wSurface > 0.5 ? vec3(0.0, 1.0, 0.0) : normalize(vNormal);
  float h = surfacePos.y;
  float snowH = vBiomeA.x;
  float forestTop = vBiomeA.y;
  float forestBottom = vBiomeA.z;
  float rockSlope = vBiomeA.w;
  float fogDensity = vBiomeB.x * uFogScale;

  // altitude palette with smooth blends
  vec3 col = uVegetation;
  float forestW = smoothstep(forestBottom, forestBottom + 80.0, h)
    * (1.0 - smoothstep(forestTop - 80.0, forestTop, h));
  col = mix(col, uForest, forestW * uForestStrength);
  float rockW = smoothstep(forestTop - 40.0, forestTop + 120.0, h)
    * (1.0 - smoothstep(snowH - 120.0, snowH, h));
  float steepW = 1.0 - smoothstep(rockSlope - 0.08, rockSlope + 0.02, n.y);
  col = mix(col, uRock, max(rockW, steepW));
  col = mix(col, uSnow, smoothstep(snowH - 60.0, snowH + 60.0, h));

  // coarse forest speckle, seeded by position cell (FR-022d); Arctic zeroes it via strength
  vec2 cell = floor(vWorldPos.xz / uSpeckleSize);
  float sp = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  col *= mix(1.0, 0.8 + 0.35 * sp, forestW * uForestStrength);

  // soft shoreline blend toward the shore tint near the surface level
  col = mix(uShoreline, col, smoothstep(uWaterLevel, uWaterLevel + 8.0, h));

  // water/ice sheet: flat themed colour, sun-dominated specular (FR-022c)
  if (wSurface > 0.5) {
    col = mix(uLakeNear, uLakeDeep, 0.35 + 0.14 * sin(vWorldPos.z * 0.0015));
  }

  // sun-orientation shading, warm/cool, soft contrast (FR-022b)
  float dl = dot(n, uSunDir);
  vec3 lit = col * (uAmbient + uKey * max(dl, 0.0));
  lit *= mix(uCoolTint, uWarmTint, 0.5 + 0.5 * dl);

  // Blinn specular toward the sun on the surface sheet
  if (wSurface > 0.5) {
    vec3 vdir = normalize(uCamPos - surfacePos);
    vec3 hv = normalize(vdir + uSunDir);
    lit += uSunHalo * pow(max(dot(vec3(0.0, 1.0, 0.0), hv), 0.0), uSpecShininess) * uSpecStrength;
  }

  // themed exponential fog, denser in valleys, resolves to the sky gradient (FR-022g)
  vec3 toFrag = surfacePos - uCamPos;
  float dist = length(toFrag);
  float sigma = fogDensity * (0.00055 + 0.0011 * exp(-max(h - uWaterLevel, 0.0) / 150.0));
  float f = 1.0 - exp(-dist * dist * sigma * sigma);
  vec3 fogCol = mix(uFogNear, uFogFar, smoothstep(0.0, 4000.0, dist));
  fogCol = mix(fogCol, skyGradient(toFrag / dist), smoothstep(1500.0, 4000.0, dist));
  lit = mix(lit, fogCol, f);

  gl_FragColor = vec4(lit, 1.0);
}
`;

export function createTerrainMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uWaterLevel: new Uniform(WATER_LEVEL),
      uSpeckleSize: new Uniform(SPECKLE_SIZE),
      uChunkSize: new Uniform(CHUNK_SIZE),
      uPlanePos: new Uniform(new Vector2()),
      uCamPos: new Uniform(new Vector3()),
      uSnow: new Uniform(new Color(0xffffff)),
      uRock: new Uniform(new Color(0xffffff)),
      uForest: new Uniform(new Color(0xffffff)),
      uVegetation: new Uniform(new Color(0xffffff)),
      uShoreline: new Uniform(new Color(0xffffff)),
      uLakeNear: new Uniform(new Color(0xffffff)),
      uLakeDeep: new Uniform(new Color(0xffffff)),
      uFogNear: new Uniform(new Color(0xffffff)),
      uFogFar: new Uniform(new Color(0xffffff)),
      uSunHalo: new Uniform(new Color(0xffffff)),
      uSunDir: new Uniform(new Vector3(0, 1, 0)),
      uCoolTint: new Uniform(new Vector3(1, 1, 1)),
      uWarmTint: new Uniform(new Vector3(1, 1, 1)),
      uFogScale: new Uniform(1),
      uAmbient: new Uniform(0.72),
      uKey: new Uniform(0.3),
      uForestStrength: new Uniform(1),
      uSpecStrength: new Uniform(0.6),
      uSpecShininess: new Uniform(48),
      ...skyUniformObjects(),
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
}

// Preallocated uniform instances shared with the sky gradient include — kept in a single
// factory so both materials get identical names and staging stays atomic per Theme.
function skyUniformObjects(): Record<string, Uniform> {
  return {
    uSkyHorizon: new Uniform(new Color(0xffffff)),
    uSkyMid: new Uniform(new Color(0xffffff)),
    uSkyZenith: new Uniform(new Color(0xffffff)),
    uSunDisc: new Uniform(new Color(0xffffff)),
    uSkyHalo: new Uniform(new Color(0xffffff)),
    uSkySunDir: new Uniform(new Vector3(0, 1, 0)),
    uHaloStrength: new Uniform(0.45),
  };
}

/** Stage every Theme-owned uniform on the material in one call (atomic palette swap). */
export function applyThemeToMaterial(material: ShaderMaterial, theme: Theme): void {
  const u = material.uniforms;
  (u.uVegetation.value as Color).setHex(theme.palette.vegetation);
  (u.uForest.value as Color).setHex(theme.palette.forest);
  (u.uRock.value as Color).setHex(theme.palette.rock);
  (u.uSnow.value as Color).setHex(theme.palette.snow);
  (u.uShoreline.value as Color).setHex(theme.palette.shoreline);
  (u.uLakeNear.value as Color).setHex(theme.palette.lakeNear);
  (u.uLakeDeep.value as Color).setHex(theme.palette.lakeDeep);
  (u.uFogNear.value as Color).setHex(theme.fog.near);
  (u.uFogFar.value as Color).setHex(theme.fog.far);
  u.uFogScale.value = theme.fog.densityScale;
  u.uWaterLevel.value = theme.surface.level;
  (u.uSunHalo.value as Color).setHex(theme.sky.sunHalo);
  (u.uSunDir.value as Vector3).set(...theme.sky.sunDirection);
  u.uAmbient.value = theme.lighting.ambientStrength;
  u.uKey.value = theme.lighting.keyStrength;
  (u.uCoolTint.value as Vector3).set(...theme.lighting.coolTint);
  (u.uWarmTint.value as Vector3).set(...theme.lighting.warmTint);
  u.uForestStrength.value = theme.palette.forestStrength;
  u.uSpecStrength.value = theme.lighting.surfaceSpecularStrength;
  u.uSpecShininess.value = theme.lighting.surfaceShininess;
  writeSkyUniforms(u, theme);
}
