// 002 T001/T033: golden fixtures for the Alien Planet world. Captured from the pre-Theme
// generator at BASELINE_REVISION; the Theme-aware generator must reproduce every value
// bit-for-bit through the WorldContext entry points (spec FR-008).
import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  BANDS,
  BASELINE_REVISION,
  BASELINE_SEEDS,
  DISTANT_HEIGHTS,
  DISTANT_POINTS,
  GRID,
  GRID_HEIGHTS,
  NORMAL_TRIPLES,
  SCAN,
  SCAN_HEIGHTS,
  SHORE,
  SHORE_MASK,
} from "../fixtures/alien";
import { bandWeight } from "../../src/sim/biome";
import { heightAt, normalAt, surfaceHeightAt, worldAlien } from "./theme-test-helpers";
import { PREVIEW_SEED } from "../../src/sim/themes";
import { WATER_LEVEL } from "../../src/constants";

function height(x: number, z: number, seed: number): number {
  return heightAt(x, z, worldAlien(seed));
}
function normal(x: number, z: number, seed: number, out: Vector3): Vector3 {
  return normalAt(x, z, worldAlien(seed), out);
}
function weight(x: number, seed: number): number {
  return bandWeight(x, seed);
}

describe("alien baseline fixtures", () => {
  it(`matches baseline revision ${BASELINE_REVISION}`, () => {
    expect(BASELINE_REVISION).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it("reproduces every recorded grid height, exactly", () => {
    for (const seed of BASELINE_SEEDS) {
      const heights = GRID_HEIGHTS[seed];
      let i = 0;
      for (let j = 0; j < GRID.count; j++) {
        for (let k = 0; k < GRID.count; k++) {
          const x = GRID.x0 + k * GRID.step;
          const z = GRID.z0 + j * GRID.step;
          expect(height(x, z, seed), `seed ${seed} @ (${x}, ${z})`).toBe(heights[i++]);
        }
      }
    }
  });

  it("reproduces the dense seed-42 x-scan, exactly", () => {
    for (let i = 0; i < SCAN.count; i++) {
      const x = SCAN.x0 + i * SCAN.step;
      expect(height(x, SCAN.z, 42), `scan @ ${x}`).toBe(SCAN_HEIGHTS[i]);
    }
  });

  it("reproduces every recorded normal, exactly", () => {
    const n = new Vector3();
    let i = 0;
    for (let j = 0; j < GRID.count; j += 2) {
      for (let k = 0; k < GRID.count; k += 2) {
        normal(GRID.x0 + k * GRID.step, GRID.z0 + j * GRID.step, 42, n);
        expect(n.x, `nx @${i}`).toBe(NORMAL_TRIPLES[i * 3]);
        expect(n.y, `ny @${i}`).toBe(NORMAL_TRIPLES[i * 3 + 1]);
        expect(n.z, `nz @${i}`).toBe(NORMAL_TRIPLES[i * 3 + 2]);
        i++;
      }
    }
  });

  it("reproduces band endpoints and transition centrelines", () => {
    for (const seed of BASELINE_SEEDS) {
      const b = BANDS[seed];
      expect(weight(b.aToF, seed)).toBeGreaterThanOrEqual(0.5);
      expect(weight(b.aToF - 0.001, seed)).toBeLessThan(0.5);
      expect(weight(b.fToA, seed)).toBeLessThan(0.5);
      expect(weight(b.fToA - 0.001, seed)).toBeGreaterThanOrEqual(0.5);
      expect(weight(b.alpineCentre, seed)).toBe(0);
      expect(weight(b.foothillsCentre, seed)).toBe(1);
    }
  });

  it("reproduces the shoreline water mask", () => {
    let i = 0;
    let below = 0;
    for (let j = 0; j < SHORE.count; j++) {
      for (let k = 0; k < SHORE.count; k++) {
        const h = height(SHORE.x0 + k * SHORE.step, SHORE.z0 + j * SHORE.step, 42);
        expect(h < WATER_LEVEL ? 1 : 0, `mask @${i}`).toBe(SHORE_MASK[i++]);
        if (h < WATER_LEVEL) below++;
      }
    }
    expect(below).toBeGreaterThan(0);
    expect(below).toBeLessThan(SHORE.count * SHORE.count);
  });

  it("reproduces heights at negative and distant coordinates", () => {
    for (let i = 0; i < DISTANT_POINTS.length; i++) {
      const [x, z] = DISTANT_POINTS[i];
      expect(height(x, z, 42), `distant @ (${x}, ${z})`).toBe(DISTANT_HEIGHTS[i]);
    }
    // negative coordinates sit inside the main grid (x0/z0 = -10000), asserted above
    expect(GRID.x0).toBeLessThan(0);
    expect(GRID.z0).toBeLessThan(0);
  });

  // T033: the same fixed values through the flight-floor and preview sampling entrypoints —
  // these are the paths main.ts/previews.ts actually consume, so parity must hold there too.
  it("flight-floor sampling (surfaceHeightAt) reproduces the grid at the water level", () => {
    const world = worldAlien(42);
    let i = 0;
    for (let j = 0; j < GRID.count; j++) {
      for (let k = 0; k < GRID.count; k++) {
        const x = GRID.x0 + k * GRID.step;
        const z = GRID.z0 + j * GRID.step;
        expect(surfaceHeightAt(x, z, world), `floor @ (${x}, ${z})`).toBe(
          Math.max(GRID_HEIGHTS[42][i++], WATER_LEVEL),
        );
      }
    }
  });

  it("preview-seed sampling is deterministic and diverges from fixture seeds", () => {
    const w = worldAlien(PREVIEW_SEED);
    let diverged = 0;
    let n = 0;
    for (let j = 0; j < GRID.count; j += 3) {
      for (let k = 0; k < GRID.count; k += 3) {
        const x = GRID.x0 + k * GRID.step;
        const z = GRID.z0 + j * GRID.step;
        expect(heightAt(x, z, w)).toBe(heightAt(x, z, worldAlien(PREVIEW_SEED)));
        if (heightAt(x, z, w) !== height(x, z, 42)) diverged++;
        n++;
      }
    }
    expect(diverged / n).toBeGreaterThan(0.9);
  });
});
