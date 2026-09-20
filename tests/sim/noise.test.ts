import { describe, expect, it } from "vitest";
import { fbm, hash2, valueNoise } from "../../src/sim/noise";

const SAMPLES = 10_000;

describe("hash2", () => {
  it("stays in [0, 1) over 10k samples", () => {
    let min = 1;
    let max = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const v = hash2(Math.floor(i / 100), i % 100, 42);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    // distribution sanity: spread across most of the range
    expect(max - min).toBeGreaterThan(0.5);
  });

  it("is deterministic and seed-dependent", () => {
    expect(hash2(3, 7, 42)).toBe(hash2(3, 7, 42));
    expect(hash2(3, 7, 42)).not.toBe(hash2(3, 7, 43));
  });
});

describe("valueNoise", () => {
  it("stays in [0, 1] over 10k samples", () => {
    for (let i = 0; i < SAMPLES; i++) {
      const x = (i * 0.1234) % 1000;
      const z = (i * 0.5678) % 1000;
      const v = valueNoise(x, z, 42);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic and seed-dependent", () => {
    expect(valueNoise(12.5, 34.25, 42)).toBe(valueNoise(12.5, 34.25, 42));
    expect(valueNoise(12.5, 34.25, 42)).not.toBe(valueNoise(12.5, 34.25, 43));
  });

  it("is continuous for small steps", () => {
    for (let i = 0; i < 1000; i++) {
      const x = i * 0.7;
      const z = i * 0.3;
      expect(Math.abs(valueNoise(x + 1e-3, z, 42) - valueNoise(x, z, 42))).toBeLessThan(0.01);
    }
  });
});

describe("fbm", () => {
  it("stays in [0, 1] over 10k samples", () => {
    for (let i = 0; i < SAMPLES; i++) {
      const x = (i * 0.137) % 500;
      const z = (i * 0.291) % 500;
      const v = fbm(x, z, 42, 4, 2, 0.5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("with 1 octave equals valueNoise", () => {
    for (let i = 0; i < 100; i++) {
      const x = i * 1.31;
      const z = i * 0.77;
      expect(fbm(x, z, 42, 1, 2, 0.5)).toBeCloseTo(valueNoise(x, z, 42), 9);
    }
  });

  it("is deterministic and seed-dependent", () => {
    expect(fbm(1.5, 2.5, 42, 4, 2, 0.5)).toBe(fbm(1.5, 2.5, 42, 4, 2, 0.5));
    expect(fbm(1.5, 2.5, 42, 4, 2, 0.5)).not.toBe(fbm(1.5, 2.5, 43, 4, 2, 0.5));
  });
});
