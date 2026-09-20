// heightAt(x, z, world) is the single source of truth for terrain (R1): it feeds the mesh,
// the flight floor (FR-006), and the camera clamp (FR-015). Biome params blend across
// transitions (R5) so a single noise evaluation serves both sides. The Theme supplies the
// band endpoints, warp/detail amplitudes, and valley shaping; Alien bypasses the transform
// with valleyFlatness 0, so its arithmetic is unchanged from the baseline generator.
// surfaceHeightAt adds the Theme's water/ice plane: max(heightAt, theme.surface.level).
import { Vector3 } from "three/src/math/Vector3.js";
import { biomeParamsAt, type BiomeParams } from "./biome";
import { domainWarp, fbm } from "./noise";
import type { ThemeShaping, WorldContext } from "./themes";

const scratchParams: BiomeParams = {
  amplitude: 0,
  baseFrequency: 0,
  ridgeSharpness: 0,
  heightOffset: 0,
  snowHeight: 0,
  forestTop: 0,
  forestBottom: 0,
  rockSlope: 0,
  fogDensity: 0,
};
const warpScratch = new Float64Array(2);

const RIDGE_OCTAVES = 5;

// Post-ridge valley shaping (data-model): blend the normalised shape s toward
// smoothstep(valleyWidth, 1, s) by valleyFlatness — continuous and monotonic in s, so
// Arctic's broad floors flatten while ridgelines survive. valleyFlatness 0 bypasses the
// transform entirely (Alien, Nature) without touching the noise arithmetic.
export function applyValleyShape(s: number, shaping: ThemeShaping): number {
  const f = shaping.valleyFlatness;
  if (f === 0) return s;
  const w = shaping.valleyWidth;
  let t: number;
  if (s <= w) t = 0;
  else if (s >= 1) t = 1;
  else {
    const u = (s - w) / (1 - w);
    t = u * u * (3 - 2 * u);
  }
  return s + (t - s) * f;
}

export function heightAt(x: number, z: number, world: WorldContext): number {
  const seed = world.seed;
  const shaping = world.theme.shaping;
  const p = biomeParamsAt(x, world, scratchParams);
  domainWarp(x, z, seed, shaping.warpStrength, warpScratch);
  const wx = warpScratch[0];
  const wz = warpScratch[1];
  const n = fbm(wx * p.baseFrequency, wz * p.baseFrequency, seed, RIDGE_OCTAVES, 2, 0.5);
  // ridged shape sharpened by ridgeSharpness, blended back toward plain fbm for round biomes
  const ridged = Math.pow(1 - Math.abs(2 * n - 1), 1 + 2 * p.ridgeSharpness);
  const roundness = (1 - p.ridgeSharpness) * (1 - p.ridgeSharpness);
  const shaped = ridged * (1 - roundness) + n * roundness;
  const s = applyValleyShape(shaped, shaping);
  const detail =
    (fbm(x * 0.01, z * 0.01, seed + 500, 2, 2, 0.5) - 0.5) * p.amplitude * shaping.detailAmplitude;
  return p.heightOffset + p.amplitude * s + detail;
}

// The visible surface: terrain clamped up to the theme's water/ice level. Flight floors and
// camera clearance always measure from this, never the raw terrain.
export function surfaceHeightAt(x: number, z: number, world: WorldContext): number {
  const level = world.theme.surface.level;
  const h = heightAt(x, z, world);
  return h < level ? level : h;
}

const NORMAL_EPSILON = 1;

export function normalAt(x: number, z: number, world: WorldContext, out: Vector3): Vector3 {
  const e = NORMAL_EPSILON;
  const dhdx = (heightAt(x + e, z, world) - heightAt(x - e, z, world)) / (2 * e);
  const dhdz = (heightAt(x, z + e, world) - heightAt(x, z - e, world)) / (2 * e);
  return out.set(-dhdx, 1, -dhdz).normalize();
}
