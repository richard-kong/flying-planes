// 002 T005: Theme preset contract — exactly nature/alien/arctic, immutable, valid ranges.
import { describe, expect, it } from "vitest";
import { heightAt } from "../../src/sim/terrain";
import {
  PREVIEW_SEED,
  THEMES,
  themeById,
  type Theme,
  type ThemeId,
} from "../../src/sim/themes";

const IDS: readonly ThemeId[] = ["nature", "alien", "arctic"];

describe("THEMES presets", () => {
  it("contains exactly nature, alien, arctic in order", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["nature", "alien", "arctic"]);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(3);
  });

  it("themeById returns each preset", () => {
    for (const id of IDS) {
      const theme = themeById(id);
      expect(theme.id).toBe(id);
      expect(theme.name.length).toBeGreaterThan(0);
      expect(theme.description.length).toBeGreaterThan(0);
    }
  });

  it("records and nested fields are read-only", () => {
    for (const theme of THEMES) {
      expect(Object.isFrozen(theme)).toBe(true);
      expect(Object.isFrozen(theme.bands[0])).toBe(true);
      expect(Object.isFrozen(theme.bands[1])).toBe(true);
      expect(Object.isFrozen(theme.shaping)).toBe(true);
      expect(Object.isFrozen(theme.surface)).toBe(true);
      expect(Object.isFrozen(theme.palette)).toBe(true);
      expect(Object.isFrozen(theme.sky)).toBe(true);
      expect(Object.isFrozen(theme.fog)).toBe(true);
      expect(Object.isFrozen(theme.lighting)).toBe(true);
      expect(Object.isFrozen(theme.preview)).toBe(true);
    }
  });

  it("all numeric fields are finite and ranges hold", () => {
    for (const theme of THEMES) {
      for (const band of theme.bands) {
        expect(Number.isFinite(band.amplitude)).toBe(true);
        expect(band.amplitude).toBeGreaterThan(0);
        expect(band.baseFrequency).toBeGreaterThan(0);
        expect(band.ridgeSharpness).toBeGreaterThanOrEqual(0);
        expect(band.ridgeSharpness).toBeLessThanOrEqual(1);
        expect(band.fogDensity).toBeGreaterThan(0);
        // altitude thresholds ordered: snow above forest top above forest bottom
        expect(band.snowHeight).toBeGreaterThan(band.forestTop);
        expect(band.forestTop).toBeGreaterThan(band.forestBottom);
      }
      const sh = theme.shaping;
      expect(sh.warpStrength).toBeGreaterThanOrEqual(0);
      expect(sh.detailAmplitude).toBeGreaterThanOrEqual(0);
      expect(sh.valleyWidth).toBeGreaterThanOrEqual(0);
      expect(sh.valleyWidth).toBeLessThan(1);
      expect(sh.valleyFlatness).toBeGreaterThanOrEqual(0);
      expect(sh.valleyFlatness).toBeLessThanOrEqual(1);
      expect(theme.fog.densityScale).toBeGreaterThan(0);
      expect(Number.isFinite(theme.surface.level)).toBe(true);
      expect(["water", "ice"]).toContain(theme.surface.kind);
      for (const c of theme.sky.sunDirection) expect(Number.isFinite(c)).toBe(true);
      const len = Math.hypot(...theme.sky.sunDirection);
      expect(len).toBeCloseTo(1, 3);
    }
  });

  it("every theme produces both land and surface regions at seed 42", () => {
    for (const theme of THEMES) {
      const world = { theme, seed: 42 };
      let land = 0;
      let surface = 0;
      for (let x = -20000; x <= 20000; x += 400) {
        for (let z = -8000; z <= 8000; z += 400) {
          const h = heightAt(x, z, world);
          if (h < theme.surface.level) surface++;
          else land++;
        }
      }
      expect(land, `${theme.id} land`).toBeGreaterThan(0);
      expect(surface, `${theme.id} surface`).toBeGreaterThan(0);
    }
  });

  it("Nature and Alien retain forest blending; Arctic has none", () => {
    expect(themeById("nature").palette.forestStrength).toBeGreaterThan(0);
    expect(themeById("alien").palette.forestStrength).toBeGreaterThan(0);
    expect(themeById("arctic").palette.forestStrength).toBe(0);
  });

  it("PREVIEW_SEED is a fixed valid Seed distinct per card use", () => {
    expect(Number.isInteger(PREVIEW_SEED)).toBe(true);
    expect(PREVIEW_SEED).toBeGreaterThanOrEqual(0);
    expect(PREVIEW_SEED).toBeLessThanOrEqual(4294967295);
  });
});
