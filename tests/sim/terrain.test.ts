import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { heightAt, normalAt } from "../../src/sim/terrain";
import { bandWeight } from "../../src/sim/biome";
import { BAND_WIDTH, TRANSITION_WIDTH, WATER_LEVEL } from "../../src/constants";

describe("heightAt", () => {
  it("is deterministic (bit-identical)", () => {
    expect(heightAt(123.4, -567.8, 42)).toBe(heightAt(123.4, -567.8, 42));
  });

  it("a different seed gives different heights", () => {
    expect(heightAt(123.4, -567.8, 42)).not.toBe(heightAt(123.4, -567.8, 43));
  });

  it("stays bounded over a 20 km x 20 km grid", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let ix = 0; ix <= 200; ix++) {
      for (let iz = 0; iz <= 200; iz++) {
        const h = heightAt(ix * 100 - 10_000, iz * 100 - 10_000, 42);
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
    expect(normalAt(100, 200, 42, out)).toBe(out);
  });

  it("is unit length and matches a central-difference gradient", () => {
    const e = 1;
    for (const [x, z] of [
      [0, 0],
      [500, -800],
      [-1234, 4321],
    ]) {
      const n = normalAt(x, z, 42, out);
      expect(n.length()).toBeCloseTo(1, 6);
      const dhdx = (heightAt(x + e, z, 42) - heightAt(x - e, z, 42)) / (2 * e);
      const dhdz = (heightAt(x, z + e, 42) - heightAt(x, z - e, 42)) / (2 * e);
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
        const h = heightAt(x0 + dx, dz, SEED);
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
          max = Math.max(max, heightAt(x0 + dx, dz, SEED));
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
