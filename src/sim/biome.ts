// Two Biomes in parallel bands along X (FR-019, FR-020). bandWeight returns the blend weight:
// 0 = Alpine, 1 = Foothills, 0.5 at each boundary, smoothstep over TRANSITION_WIDTH.
import { BAND_WIDTH, TRANSITION_WIDTH } from "../constants";
import { hash2 } from "./noise";
import type { WorldContext } from "./themes";

export interface BiomeParams {
  amplitude: number;
  baseFrequency: number;
  ridgeSharpness: number;
  heightOffset: number;
  snowHeight: number;
  forestTop: number;
  forestBottom: number;
  rockSlope: number;
  fogDensity: number;
}

export const ALPINE: Readonly<BiomeParams> = Object.freeze({
  amplitude: 1200,
  baseFrequency: 1 / 1800,
  ridgeSharpness: 0.8,
  heightOffset: 40,
  snowHeight: 700,
  forestTop: 520,
  forestBottom: 220,
  rockSlope: 0.75,
  fogDensity: 1.0,
});

export const FOOTHILLS: Readonly<BiomeParams> = Object.freeze({
  amplitude: 400,
  baseFrequency: 1 / 1100,
  ridgeSharpness: 0.15,
  heightOffset: -60,
  snowHeight: 450,
  forestTop: 380,
  forestBottom: 140,
  rockSlope: 0.85,
  fogDensity: 0.8,
});

const PERIOD = 2 * BAND_WIDTH;
const HALF_T = TRANSITION_WIDTH / 2;

function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

export function bandWeight(x: number, seed: number): number {
  const phase = hash2(0, 0, seed) * PERIOD;
  let s = (x + phase) % PERIOD;
  if (s < 0) s += PERIOD;
  const i = s >= BAND_WIDTH ? 1 : 0; // 0 = Alpine band, 1 = Foothills band
  const q = s - i * BAND_WIDTH; // [0, BAND_WIDTH), boundaries at q=0 and q=BAND_WIDTH
  if (i === 0) {
    if (q < HALF_T) return 0.5 * smoothstep(1 - q / HALF_T);
    if (q > BAND_WIDTH - HALF_T) return 0.5 * smoothstep((q - (BAND_WIDTH - HALF_T)) / HALF_T);
    return 0;
  }
  if (q < HALF_T) return 0.5 + 0.5 * smoothstep(q / HALF_T);
  if (q > BAND_WIDTH - HALF_T) {
    return 1 - 0.5 * smoothstep((q - (BAND_WIDTH - HALF_T)) / HALF_T);
  }
  return 1;
}

// WorldContext (002): the blend weight stays a pure function of (x, seed) — the theme only
// supplies the two regional endpoints. Alien's endpoints are the original ALPINE/FOOTHILLS
// constants, so its output is bit-identical to the pre-Theme generator.
export function biomeParamsAt(x: number, world: WorldContext, out: BiomeParams): BiomeParams {
  const w = bandWeight(x, world.seed);
  const lo = world.theme.bands[0];
  const hi = world.theme.bands[1];
  if (w === 0) {
    out.amplitude = lo.amplitude;
    out.baseFrequency = lo.baseFrequency;
    out.ridgeSharpness = lo.ridgeSharpness;
    out.heightOffset = lo.heightOffset;
    out.snowHeight = lo.snowHeight;
    out.forestTop = lo.forestTop;
    out.forestBottom = lo.forestBottom;
    out.rockSlope = lo.rockSlope;
    out.fogDensity = lo.fogDensity;
    return out;
  }
  if (w === 1) {
    out.amplitude = hi.amplitude;
    out.baseFrequency = hi.baseFrequency;
    out.ridgeSharpness = hi.ridgeSharpness;
    out.heightOffset = hi.heightOffset;
    out.snowHeight = hi.snowHeight;
    out.forestTop = hi.forestTop;
    out.forestBottom = hi.forestBottom;
    out.rockSlope = hi.rockSlope;
    out.fogDensity = hi.fogDensity;
    return out;
  }
  out.amplitude = lo.amplitude + (hi.amplitude - lo.amplitude) * w;
  out.baseFrequency = lo.baseFrequency + (hi.baseFrequency - lo.baseFrequency) * w;
  out.ridgeSharpness = lo.ridgeSharpness + (hi.ridgeSharpness - lo.ridgeSharpness) * w;
  out.heightOffset = lo.heightOffset + (hi.heightOffset - lo.heightOffset) * w;
  out.snowHeight = lo.snowHeight + (hi.snowHeight - lo.snowHeight) * w;
  out.forestTop = lo.forestTop + (hi.forestTop - lo.forestTop) * w;
  out.forestBottom = lo.forestBottom + (hi.forestBottom - lo.forestBottom) * w;
  out.rockSlope = lo.rockSlope + (hi.rockSlope - lo.rockSlope) * w;
  out.fogDensity = lo.fogDensity + (hi.fogDensity - lo.fogDensity) * w;
  return out;
}
