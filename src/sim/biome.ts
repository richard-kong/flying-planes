// Two Biomes in parallel bands along X (FR-019, FR-020). bandWeight returns the blend weight:
// 0 = Alpine, 1 = Foothills, 0.5 at each boundary, smoothstep over TRANSITION_WIDTH.
import { BAND_WIDTH, TRANSITION_WIDTH } from "../constants";
import { hash2 } from "./noise";

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

export function biomeParamsAt(x: number, seed: number, out: BiomeParams): BiomeParams {
  const w = bandWeight(x, seed);
  if (w === 0) {
    out.amplitude = ALPINE.amplitude;
    out.baseFrequency = ALPINE.baseFrequency;
    out.ridgeSharpness = ALPINE.ridgeSharpness;
    out.heightOffset = ALPINE.heightOffset;
    out.snowHeight = ALPINE.snowHeight;
    out.forestTop = ALPINE.forestTop;
    out.forestBottom = ALPINE.forestBottom;
    out.rockSlope = ALPINE.rockSlope;
    out.fogDensity = ALPINE.fogDensity;
    return out;
  }
  if (w === 1) {
    out.amplitude = FOOTHILLS.amplitude;
    out.baseFrequency = FOOTHILLS.baseFrequency;
    out.ridgeSharpness = FOOTHILLS.ridgeSharpness;
    out.heightOffset = FOOTHILLS.heightOffset;
    out.snowHeight = FOOTHILLS.snowHeight;
    out.forestTop = FOOTHILLS.forestTop;
    out.forestBottom = FOOTHILLS.forestBottom;
    out.rockSlope = FOOTHILLS.rockSlope;
    out.fogDensity = FOOTHILLS.fogDensity;
    return out;
  }
  out.amplitude = ALPINE.amplitude + (FOOTHILLS.amplitude - ALPINE.amplitude) * w;
  out.baseFrequency = ALPINE.baseFrequency + (FOOTHILLS.baseFrequency - ALPINE.baseFrequency) * w;
  out.ridgeSharpness =
    ALPINE.ridgeSharpness + (FOOTHILLS.ridgeSharpness - ALPINE.ridgeSharpness) * w;
  out.heightOffset = ALPINE.heightOffset + (FOOTHILLS.heightOffset - ALPINE.heightOffset) * w;
  out.snowHeight = ALPINE.snowHeight + (FOOTHILLS.snowHeight - ALPINE.snowHeight) * w;
  out.forestTop = ALPINE.forestTop + (FOOTHILLS.forestTop - ALPINE.forestTop) * w;
  out.forestBottom = ALPINE.forestBottom + (FOOTHILLS.forestBottom - ALPINE.forestBottom) * w;
  out.rockSlope = ALPINE.rockSlope + (FOOTHILLS.rockSlope - ALPINE.rockSlope) * w;
  out.fogDensity = ALPINE.fogDensity + (FOOTHILLS.fogDensity - ALPINE.fogDensity) * w;
  return out;
}
