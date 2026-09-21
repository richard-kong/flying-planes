import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { heightAt, normalAt } from "../../src/sim/terrain";
import { bandWeight } from "../../src/sim/biome";
import { BAND_WIDTH, TRANSITION_WIDTH, WATER_LEVEL } from "../../src/constants";
import { worldAlien } from "./theme-test-helpers";

const W42 = worldAlien(42);

describe("heightAt", () => {
  it("is deterministic (bit-identical)", () => {
    expect(heightAt(123.4, -567.8, W42)).toBe(heightAt(123.4, -567.8, W42));
  });

  it("a different seed gives different heights", () => {
    expect(heightAt(123.4, -567.8, W42)).not.toBe(heightAt(123.4, -567.8, worldAlien(43)));
  });

  it("stays bounded over a 20 km x 20 km grid", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let ix = 0; ix <= 200; ix++) {
      for (let iz = 0; iz <= 200; iz++) {
        const h = heightAt(ix * 100 - 10_000, iz * 100 - 10_000, W42);
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
    }
    expect(min).toBeGreaterThan(WATER_LEVEL - 400);
    expect(max).toBeLessThan(1400);
    expect(max).toBeGreaterThan(300); // actually produces mountains somewhere
  });
});

describe("normalAt", () => {
  const out = new Vector3();

  it("returns the same object it is given (zero-alloc)", () => {
    expect(normalAt(100, 200, W42, out)).toBe(out);
  });

  it("is unit length and matches a central-difference gradient", () => {
    const e = 1;
    for (const [x, z] of [
      [0, 0],
      [500, -800],
      [-1234, 4321],
    ]) {
      const n = normalAt(x, z, W42, out);
      expect(n.length()).toBeCloseTo(1, 6);
      const dhdx = (heightAt(x + e, z, W42) - heightAt(x - e, z, W42)) / (2 * e);
      const dhdz = (heightAt(x, z + e, W42) - heightAt(x, z - e, W42)) / (2 * e);
      const expected = new Vector3(-dhdx, 1, -dhdz).normalize();
      expect(n.x).toBeCloseTo(expected.x, 3);
      expect(n.y).toBeCloseTo(expected.y, 3);
      expect(n.z).toBeCloseTo(expected.z, 3);
    }
  });
});

// T029: biome-dependent height profile
describe("heightAt across biomes", () => {
  const SEED = 42;

  const PERIOD = 2 * BAND_WIDTH;

  function findCrossing(lo: number, hi: number, upward: boolean): number {
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if ((bandWeight(mid, SEED) < 0.5) === upward) lo = mid;
      else hi = mid;
    }
    return hi;
  }

  function bandCentre(target: 0 | 1): number {
    let bAF = -1;
    let bFA = -1;
    for (let x = -PERIOD; x < 2 * PERIOD && (bAF < 0 || bFA < 0); x += 10) {
      const w0 = bandWeight(x, SEED);
      const w1 = bandWeight(x + 10, SEED);
      if (bAF < 0 && w0 < 0.5 && w1 >= 0.5) bAF = findCrossing(x, x + 10, true);
      if (bFA < 0 && w0 >= 0.5 && w1 < 0.5) bFA = findCrossing(x, x + 10, false);
    }
    if (target === 0) {
      const arc = ((bAF - bFA) % PERIOD + PERIOD) % PERIOD;
      return bFA + arc / 2;
    }
    const arc = ((bFA - bAF) % PERIOD + PERIOD) % PERIOD;
    return bAF + arc / 2;
  }

  function samplePatch(
    x0: number,
    halfExtent: number,
  ): { max: number; belowWater: number; count: number } {
    let max = -Infinity;
    let belowWater = 0;
    let count = 0;
    for (let dx = -halfExtent; dx <= halfExtent; dx += 100) {
      for (let dz = -halfExtent; dz <= halfExtent; dz += 100) {
        const h = heightAt(x0 + dx, dz, worldAlien(SEED));
        max = Math.max(max, h);
        if (h < WATER_LEVEL) belowWater++;
        count++;
      }
    }
    return { max, belowWater, count };
  }

  it("Alpine centre exceeds 900 m; Foothills centre stays below 450 m", () => {
    const xA = bandCentre(0);
    const xF = bandCentre(1);
    expect(bandWeight(xA, SEED)).toBe(0);
    expect(bandWeight(xF, SEED)).toBe(1);
    // alpine peak found within a 4 km sweep; the foothills bound is checked on the
    // pure-zone interior (the band itself is only 3.6 km wide minus transitions)
    const alpine = samplePatch(xA, 2000);
    const foothills = samplePatch(xF, 1000);
    expect(alpine.max).toBeGreaterThan(900);
    expect(foothills.max).toBeLessThan(450);
  });

  it("Foothills has a larger fraction of terrain below WATER_LEVEL than Alpine", () => {
    const xA = bandCentre(0);
    const xF = bandCentre(1);
    const alpine = samplePatch(xA, 1000);
    const foothills = samplePatch(xF, 1000);
    expect(foothills.belowWater / foothills.count).toBeGreaterThan(
      alpine.belowWater / alpine.count,
    );
  });

  it("max height per 100 m slab does not jump across a transition", () => {
    // find an A->F boundary
    let xB = -1;
    for (let x = 0; x < 2 * BAND_WIDTH; x += 10) {
      if (bandWeight(x, SEED) < 0.5 && bandWeight(x + 10, SEED) >= 0.5) {
        xB = x + 10;
        break;
      }
    }
    expect(xB).toBeGreaterThan(0);
    // slab maxima across the transition zone change smoothly (bounded delta)
    const slabs: number[] = [];
    for (
      let x0 = xB - TRANSITION_WIDTH - 500;
      x0 < xB + TRANSITION_WIDTH + 500;
      x0 += 100
    ) {
      let max = -Infinity;
      for (let dx = 0; dx < 100; dx += 20) {
        for (let dz = -600; dz <= 600; dz += 50) {
          max = Math.max(max, heightAt(x0 + dx, dz, worldAlien(SEED)));
        }
      }
      slabs.push(max);
    }
    for (let i = 1; i < slabs.length; i++) {
      expect(Math.abs(slabs[i] - slabs[i - 1])).toBeLessThan(500);
    }
    // and the overall trend descends from Alpine toward Foothills
    expect(slabs[slabs.length - 1]).toBeLessThan(slabs[0]);
  });
});

// --- 002 T006: WorldContext terrain sampling ---
import { themeById, type WorldContext } from "../../src/sim/themes";
import { surfaceHeightAt } from "../../src/sim/terrain";

const worldOf = (id: "nature" | "alien" | "arctic", seed: number): WorldContext => ({
  theme: themeById(id),
  seed,
});

describe("heightAt with WorldContext", () => {
  it("is bit-identical across equivalent world contexts", () => {
    for (const id of ["nature", "alien", "arctic"] as const) {
      for (const [x, z] of [[0, 0], [123.4, -567.8], [-9876, 5432], [250000, -750000]]) {
        expect(heightAt(x, z, worldOf(id, 42))).toBe(heightAt(x, z, worldOf(id, 42)));
      }
    }
  });

  it("differs across themes at the same seed", () => {
    let natureDiff = 0;
    let arcticDiff = 0;
    let n = 0;
    for (let x = -8000; x <= 8000; x += 400) {
      for (let z = -8000; z <= 8000; z += 400) {
        if (heightAt(x, z, worldOf("nature", 42)) !== heightAt(x, z, worldOf("alien", 42))) natureDiff++;
        if (heightAt(x, z, worldOf("arctic", 42)) !== heightAt(x, z, worldOf("alien", 42))) arcticDiff++;
        n++;
      }
    }
    expect(natureDiff / n).toBeGreaterThan(0.5);
    expect(arcticDiff / n).toBeGreaterThan(0.5);
  });

  it("returns finite heights at negative and distant coordinates for every theme", () => {
    for (const id of ["nature", "alien", "arctic"] as const) {
      for (const [x, z] of [[-1e6, 250000], [250000, -12345], [-777777, 555555], [1e6, -2e5]]) {
        const h = heightAt(x, z, worldOf(id, 42));
        expect(Number.isFinite(h), `${id} @ (${x}, ${z})`).toBe(true);
      }
    }
  });
});

describe("surfaceHeightAt", () => {
  it("equals max(heightAt, theme surface level)", () => {
    for (const id of ["nature", "alien", "arctic"] as const) {
      const world = worldOf(id, 42);
      for (let x = -12000; x <= 12000; x += 500) {
        for (let z = -4000; z <= 4000; z += 500) {
          const h = heightAt(x, z, world);
          const level = themeById(id).surface.level;
          expect(surfaceHeightAt(x, z, world)).toBe(Math.max(h, level));
        }
      }
    }
  });
});

// Arctic valley shaping (data-model): blend shaped height s toward smoothstep(valleyWidth,1,s)
// by valleyFlatness — the transform must be continuous and monotonic in s.
import { applyValleyShape } from "../../src/sim/terrain";
describe("arctic valley shaping transform", () => {
  const shaping = themeById("arctic").shaping;

  it("is continuous over s in [0,1]", () => {
    let prev = applyValleyShape(0, shaping);
    for (let i = 1; i <= 10000; i++) {
      const s = i / 10000;
      const v = applyValleyShape(s, shaping);
      expect(Math.abs(v - prev)).toBeLessThan(0.01);
      prev = v;
    }
  });

  it("is monotonic non-decreasing and flattens low terrain", () => {
    let prev = -Infinity;
    for (let i = 0; i <= 1000; i++) {
      const s = i / 1000;
      const v = applyValleyShape(s, shaping);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // the transform pushes the bottom of the range toward 0 = flat valley floor
    expect(applyValleyShape(0.3, shaping)).toBeLessThan(0.3);
    expect(applyValleyShape(0, shaping)).toBe(0);
    expect(applyValleyShape(1, shaping)).toBe(1);
  });
});

describe("alien bypasses valley shaping", () => {
  it("alien shaping leaves s untouched (valleyFlatness = 0)", () => {
    const shaping = themeById("alien").shaping;
    expect(shaping.valleyFlatness).toBe(0);
    for (const s of [0, 0.2, 0.5, 0.8, 1]) {
      expect(applyValleyShape(s, shaping)).toBe(s);
    }
  });
});

// --- 002 T032: per-theme quantitative landform measurements ---
// These establish the tuning assertions BEFORE N4/A4 calibration: Nature must measure
// gentler than Alien with comparable lakes; Arctic must produce broad flat floors and
// distinct sculpted ridges. Values measured over a 24 km x 24 km grid at 200 m.
describe("per-theme landform measurements (T032)", () => {
  const SEED = 42;
  const GRID_RANGE = 12000;
  const GRID_STEP = 200;
  const n3 = new Vector3();

  interface Stats {
    n: number;
    heights: number[];
    belowSurface: number; // fraction of samples below the theme's surface level
    flat: number; // fraction of samples with normal.y > 0.99 (~< 8 degrees)
    roughness: number; // rms of 200 m height differences
    ridgeMax: number;
    p10: number;
    p90: number;
  }

  const statsCache = new Map<string, Stats>();
  function stats(id: "nature" | "alien" | "arctic"): Stats {
    const cached = statsCache.get(id);
    if (cached) return cached;
    const world = worldOf(id, SEED);
    const heights: number[] = [];
    let below = 0;
    let flat = 0;
    let sd = 0;
    let sdN = 0;
    for (let x = -GRID_RANGE; x <= GRID_RANGE; x += GRID_STEP) {
      for (let z = -GRID_RANGE; z <= GRID_RANGE; z += GRID_STEP) {
        const h = heightAt(x, z, world);
        heights.push(h);
        if (h < world.theme.surface.level) below++;
        if (normalAt(x, z, world, n3).y > 0.99) flat++;
        if (x + GRID_STEP <= GRID_RANGE) {
          const d = heightAt(x + GRID_STEP, z, world) - h;
          sd += d * d;
          sdN++;
        }
      }
    }
    heights.sort((a, b) => a - b);
    const q = (p: number) => heights[Math.floor(p * (heights.length - 1))];
    const out: Stats = {
      n: heights.length,
      heights,
      belowSurface: below / heights.length,
      flat: flat / heights.length,
      roughness: Math.sqrt(sd / sdN),
      ridgeMax: heights[heights.length - 1],
      p10: q(0.1),
      p90: q(0.9),
    };
    statsCache.set(id, out);
    return out;
  }

  it("Nature is gentler than Alien (lower relief and roughness) with comparable lakes", () => {
    const nat = stats("nature");
    const ali = stats("alien");
    expect(nat.roughness).toBeLessThan(ali.roughness * 0.85);
    expect(nat.p90 - nat.p10).toBeLessThan(ali.p90 - ali.p10);
    expect(nat.belowSurface).toBeGreaterThan(0.05); // turquoise lakes actually present
    expect(nat.ridgeMax).toBeGreaterThan(800); // still mountainous
    expect(nat.ridgeMax).toBeLessThan(ali.ridgeMax);
  });

  it("Arctic has broad flat basins and sculpted ridges distinct from both others", () => {
    const arc = stats("arctic");
    const ali = stats("alien");
    // valley shaping floods >40% of sampled terrain below the ice level
    expect(arc.belowSurface).toBeGreaterThan(0.4);
    // and keeps sharper relief between floors and ridgelines than Alien's rolling mix
    expect(arc.roughness).toBeGreaterThan(ali.roughness);
    expect(arc.ridgeMax).toBeGreaterThan(1100);
  });

  it("every theme produces both land and surface regions (lakes exist everywhere)", () => {
    for (const id of ["nature", "alien", "arctic"] as const) {
      const s = stats(id);
      expect(s.belowSurface, `${id} below-surface`).toBeGreaterThan(0.02);
      expect(s.belowSurface, `${id} below-surface`).toBeLessThan(0.8);
    }
  });

  it("heights are finite and normals unit-length at negative/distant coordinates", () => {
    for (const id of ["nature", "alien", "arctic"] as const) {
      const world = worldOf(id, SEED);
      for (const [x, z] of [
        [-1e6, 250000],
        [250000, -12345],
        [-777777, 555555],
        [1e6, -2e5],
      ]) {
        const h = heightAt(x, z, world);
        expect(Number.isFinite(h), `${id} h @(${x},${z})`).toBe(true);
        const nrm = normalAt(x, z, world, n3);
        expect(nrm.length(), `${id} n @(${x},${z})`).toBeCloseTo(1, 5);
      }
    }
  });

  it("slab maxima change gradually across a band transition for every theme", () => {
    // deterministic transition route: find an A->F boundary then sweep across it
    let xB = -1;
    for (let x = 0; x < 2 * BAND_WIDTH; x += 10) {
      if (bandWeight(x, SEED) < 0.5 && bandWeight(x + 10, SEED) >= 0.5) {
        xB = x + 10;
        break;
      }
    }
    expect(xB).toBeGreaterThan(0);
    for (const id of ["nature", "alien", "arctic"] as const) {
      const world = worldOf(id, SEED);
      const slabs: number[] = [];
      for (
        let x0 = xB - TRANSITION_WIDTH - 500;
        x0 < xB + TRANSITION_WIDTH + 500;
        x0 += 100
      ) {
        let max = -Infinity;
        for (let dx = 0; dx < 100; dx += 20) {
          for (let dz = -600; dz <= 600; dz += 50) {
            max = Math.max(max, heightAt(x0 + dx, dz, world));
          }
        }
        slabs.push(max);
      }
      // arctic's valley-shaping transform plus its larger amplitude contrast produces
      // continuous but steep sculpted ridges at the seam; bound both the 90th-percentile
      // step (the seam must be mostly gradual) and the worst spike by each theme's own
      // band amplitude swing — deltas above the swing would mean a hard break
      const swing =
        Math.abs(world.theme.bands[0].amplitude - world.theme.bands[1].amplitude);
      const deltas = slabs.slice(1).map((s, i) => Math.abs(s - slabs[i]));
      deltas.sort((a, b) => a - b);
      const p90 = deltas[Math.floor(deltas.length * 0.9)];
      const worst = deltas[deltas.length - 1];
      expect(p90, `${id} p90`).toBeLessThan(Math.max(400, swing * 0.75));
      expect(worst, `${id} max`).toBeLessThan(Math.max(500, swing * 1.2));
    }
  });
});
