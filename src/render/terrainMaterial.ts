// One ShaderMaterial for terrain and lakes (R3). Vertex stage morphs each vertex toward its
// next-coarser lod height near the outer edge of its lod band (T056), and flattens
// below-water vertices to the water level. Water classification happens per FRAGMENT from
// the interpolated unflattened terrain height, so shoreline triangles that mix land and
// water keep the water region pinned to the fixed water plane (T057). Fragment stage does
// the altitude/slope palette, forest speckle, warm/cool sun shading, gold lakes with a
// Blinn specular, and lavender fog that resolves to the shared skyGradient at the horizon
// (FR-022b/c/d/e/g).
import { Color, ShaderMaterial, Uniform, Vector2, Vector3 } from "three";
import {
  CHUNK_SIZE,
  COLOR_FOG_FAR,
  COLOR_FOG_NEAR,
  COLOR_FOREST,
  COLOR_LAKE_DEEP,
  COLOR_LAKE_NEAR,
  COLOR_ROCK,
  COLOR_SHORELINE,
  COLOR_SNOW,
  COLOR_SUN_HALO,
  COLOR_VEGETATION,
  SPECKLE_SIZE,
  WATER_LEVEL,
} from "../constants";
import { SKY_GRADIENT_GLSL } from "./sky";

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
  float isWater = step(y, uWaterLevel);
  if (isWater > 0.5) wp.y = uWaterLevel;
  else wp.y = y;
  vWorldPos = wp;
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vNormal = mix(n, vec3(0.0, 1.0, 0.0), isWater);
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

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vTerrainY;
varying vec4 vBiomeA;
varying vec4 vBiomeB;

void main() {
  // water is classified per fragment on the true (unflattened) terrain height, so a
  // triangle straddling the shoreline splits exactly where terrain crosses the level
  float wWater = step(vTerrainY, uWaterLevel);
  vec3 n = wWater > 0.5 ? vec3(0.0, 1.0, 0.0) : normalize(vNormal);
  float h = vWorldPos.y;
  float snowH = vBiomeA.x;
  float forestTop = vBiomeA.y;
  float forestBottom = vBiomeA.z;
  float rockSlope = vBiomeA.w;
  float fogDensity = vBiomeB.x;

  // altitude palette with smooth blends
  vec3 col = uVegetation;
  float forestW = smoothstep(forestBottom, forestBottom + 80.0, h)
    * (1.0 - smoothstep(forestTop - 80.0, forestTop, h));
  col = mix(col, uForest, forestW);
  float rockW = smoothstep(forestTop - 40.0, forestTop + 120.0, h)
    * (1.0 - smoothstep(snowH - 120.0, snowH, h));
  float steepW = 1.0 - smoothstep(rockSlope - 0.08, rockSlope + 0.02, n.y);
  col = mix(col, uRock, max(rockW, steepW));
  col = mix(col, uSnow, smoothstep(snowH - 60.0, snowH + 60.0, h));

  // coarse forest speckle, seeded by position cell (FR-022d)
  vec2 cell = floor(vWorldPos.xz / uSpeckleSize);
  float sp = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  col *= mix(1.0, 0.8 + 0.35 * sp, forestW);

  // soft shoreline blend toward grey-mauve near the water level
  col = mix(uShoreline, col, smoothstep(uWaterLevel, uWaterLevel + 8.0, h));

  // lakes: flat gold, soft rim, sun-dominated (FR-022c)
  if (wWater > 0.5) {
    float depth = uWaterLevel - vTerrainY;
    vec3 lake = mix(uLakeNear, uLakeDeep, smoothstep(0.0, 8.0, depth));
    col = mix(uShoreline, lake, smoothstep(0.0, 2.0, depth));
  }

  // sun-orientation shading, warm/cool, soft contrast (FR-022b)
  float dl = dot(n, SUN_DIR);
  vec3 lit = col * (0.72 + 0.30 * max(dl, 0.0));
  lit *= mix(vec3(0.92, 0.95, 1.08), vec3(1.06, 1.0, 0.94), 0.5 + 0.5 * dl);

  // Blinn specular toward the sun on lakes
  if (wWater > 0.5) {
    vec3 vdir = normalize(uCamPos - vWorldPos);
    vec3 hv = normalize(vdir + SUN_DIR);
    lit += uSunHalo * pow(max(dot(vec3(0.0, 1.0, 0.0), hv), 0.0), 48.0) * 0.6;
  }

  // lavender exponential fog, denser in valleys, resolves to the sky gradient (FR-022g)
  vec3 toFrag = vWorldPos - uCamPos;
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
      uSnow: new Uniform(new Color(COLOR_SNOW)),
      uRock: new Uniform(new Color(COLOR_ROCK)),
      uForest: new Uniform(new Color(COLOR_FOREST)),
      uVegetation: new Uniform(new Color(COLOR_VEGETATION)),
      uShoreline: new Uniform(new Color(COLOR_SHORELINE)),
      uLakeNear: new Uniform(new Color(COLOR_LAKE_NEAR)),
      uLakeDeep: new Uniform(new Color(COLOR_LAKE_DEEP)),
      uFogNear: new Uniform(new Color(COLOR_FOG_NEAR)),
      uFogFar: new Uniform(new Color(COLOR_FOG_FAR)),
      uSunHalo: new Uniform(new Color(COLOR_SUN_HALO)),
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
}
