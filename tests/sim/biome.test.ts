import { describe, expect, it } from "vitest";
import {
  ALPINE,
  bandWeight,
  biomeParamsAt,
  FOOTHILLS,
  type BiomeParams,
} from "../../src/sim/biome";
import { BAND_WIDTH, TRANSITION_WIDTH } from "../../src/constants";

const SEED = 42;

function makeParams(): BiomeParams {
  return {
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
}

describe("biome constants", () => {
  it("match the data-model table verbatim", () => {
    expect(ALPINE).toEqual({
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
    expect(FOOTHILLS).toEqual({
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
    expect(Object.isFrozen(ALPINE)).toBe(true);
    expect(Object.isFrozen(FOOTHILLS)).toBe(true);
  });
});

const PERIOD = 2 * BAND_WIDTH;

/** Binary-search a w=0.5 crossing in (lo, hi]; upward=true for A->F, false for F->A. */
function findCrossing(lo: number, hi: number, upward: boolean, seed: number): number {
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const below = bandWeight(mid, seed) < 0.5;
    if (below === upward) lo = mid;
    else hi = mid;
  }
  return hi;
}

function findBoundaries(seed: number): { bAF: number; bFA: number } {
  // upward crossing (A->F) and downward crossing (F->A), each found by 10 m scan
  let bAF = -1;
  let bFA = -1;
  for (let x = -PERIOD; x < 2 * PERIOD && (bAF < 0 || bFA < 0); x += 10) {
    const w0 = bandWeight(x, seed);
    const w1 = bandWeight(x + 10, seed);
    if (bAF < 0 && w0 < 0.5 && w1 >= 0.5) bAF = findCrossing(x, x + 10, true, seed);
    if (bFA < 0 && w0 >= 0.5 && w1 < 0.5) bFA = findCrossing(x, x + 10, false, seed);
  }
  return { bAF, bFA };
}

/** Arc midpoint between the F->A boundary and the next A->F boundary = Alpine centre. */
function bandCentre(seed: number, target: 0 | 1): number {
  const { bAF, bFA } = findBoundaries(seed);
  if (target === 0) {
    const arc = ((bAF - bFA) % PERIOD + PERIOD) % PERIOD;
    return bFA + arc / 2;
  }
  const arc = ((bFA - bAF) % PERIOD + PERIOD) % PERIOD;
  return bAF + arc / 2;
}

describe("bandWeight", () => {
  it("is 0 at an Alpine band centre and 1 at a Foothills centre", () => {
    const xA = bandCentre(SEED, 0);
    const xF = bandCentre(SEED, 1);
    expect(bandWeight(xA, SEED)).toBe(0);
    expect(bandWeight(xF, SEED)).toBe(1);
  });

  it("is 0.5 at a boundary and monotonic across TRANSITION_WIDTH", () => {
    const xB = findBoundaries(SEED).bAF;
    expect(xB).toBeGreaterThan(0);
    expect(bandWeight(xB, SEED)).toBeCloseTo(0.5, 6);
    // monotonic non-decreasing across the whole transition zone
    let prev = -1;
    for (let d = -TRANSITION_WIDTH / 2; d <= TRANSITION_WIDTH / 2; d += 20) {
      const w = bandWeight(xB + d, SEED);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
    expect(bandWeight(xB - TRANSITION_WIDTH / 2, SEED)).toBe(0);
    expect(bandWeight(xB + TRANSITION_WIDTH / 2, SEED)).toBe(1);
  });

  it("has period 2 * BAND_WIDTH", () => {
    for (let x = -5000; x < 5000; x += 137) {
      expect(bandWeight(x, SEED)).toBe(bandWeight(x + 2 * BAND_WIDTH, SEED));
    }
  });

  it("is constant outside transition zones", () => {
    const xA = bandCentre(SEED, 0);
    const half = (BAND_WIDTH - TRANSITION_WIDTH) / 2 - 50;
    for (let d = -half; d <= half; d += 100) {
      expect(bandWeight(xA + d, SEED)).toBe(0);
    }
  });

  it("is a function of x and seed only", () => {
    expect(bandWeight.length).toBe(2);
  });

  it("phase changes with seed", () => {
    let identical = true;
    for (let x = 0; x < 2 * BAND_WIDTH; x += 50) {
      if (bandWeight(x, 42) !== bandWeight(x, 43)) {
        identical = false;
        break;
      }
    }
    expect(identical).toBe(false);
  });
});

describe("biomeParamsAt", () => {
  const out = makeParams();

  it("returns ALPINE field-by-field at w = 0", () => {
    const xA = bandCentre(SEED, 0);
    const p = biomeParamsAt(xA, SEED, out);
    expect(p).toBe(out);
    for (const k of Object.keys(ALPINE) as (keyof BiomeParams)[]) {
      expect(p[k]).toBe(ALPINE[k]);
    }
  });

  it("returns FOOTHILLS field-by-field at w = 1", () => {
    const xF = bandCentre(SEED, 1);
    const p = biomeParamsAt(xF, SEED, out);
    for (const k of Object.keys(FOOTHILLS) as (keyof BiomeParams)[]) {
      expect(p[k]).toBe(FOOTHILLS[k]);
    }
  });

  it("returns the mean at w = 0.5", () => {
    const xB = findBoundaries(SEED).bAF;
    expect(xB).toBeGreaterThan(0);
    const p = biomeParamsAt(xB, SEED, out);
    for (const k of Object.keys(ALPINE) as (keyof BiomeParams)[]) {
      expect(p[k]).toBeCloseTo((ALPINE[k] + FOOTHILLS[k]) / 2, 5);
    }
  });
});
