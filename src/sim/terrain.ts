// heightAt(x, z, seed) is the single source of truth for terrain (R1): it feeds the mesh,
// the flight floor (FR-006), and the camera clamp (FR-015). Biome params blend across
// transitions (R5) so a single noise evaluation serves both sides.
import { Vector3 } from "three/src/math/Vector3.js";
import { biomeParamsAt, type BiomeParams } from "./biome";
import { domainWarp, fbm } from "./noise";

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

const WARP_STRENGTH = 300;
const RIDGE_OCTAVES = 5;
const DETAIL_AMPLITUDE = 0.06;

export function heightAt(x: number, z: number, seed: number): number {
  const p = biomeParamsAt(x, seed, scratchParams);
  domainWarp(x, z, seed, WARP_STRENGTH, warpScratch);
  const wx = warpScratch[0];
  const wz = warpScratch[1];
  const n = fbm(wx * p.baseFrequency, wz * p.baseFrequency, seed, RIDGE_OCTAVES, 2, 0.5);
  // ridged shape sharpened by ridgeSharpness, blended back toward plain fbm for round biomes
  const ridged = Math.pow(1 - Math.abs(2 * n - 1), 1 + 2 * p.ridgeSharpness);
  const roundness = (1 - p.ridgeSharpness) * (1 - p.ridgeSharpness);
  const shaped = ridged * (1 - roundness) + n * roundness;
  const detail =
    (fbm(x * 0.01, z * 0.01, seed + 500, 2, 2, 0.5) - 0.5) * p.amplitude * DETAIL_AMPLITUDE;
  return p.heightOffset + p.amplitude * shaped + detail;
}

const NORMAL_EPSILON = 1;

export function normalAt(x: number, z: number, seed: number, out: Vector3): Vector3 {
  const e = NORMAL_EPSILON;
  const dhdx = (heightAt(x + e, z, seed) - heightAt(x - e, z, seed)) / (2 * e);
  const dhdz = (heightAt(x, z + e, seed) - heightAt(x, z - e, seed)) / (2 * e);
  return out.set(-dhdx, 1, -dhdz).normalize();
}
