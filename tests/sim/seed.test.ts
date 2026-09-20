import { describe, expect, it } from "vitest";
import { parseSeed, randomSeed } from "../../src/sim/seed";

describe("parseSeed", () => {
  it("parses a whole-number seed", () => {
    expect(parseSeed("?seed=42")).toBe(42);
    expect(parseSeed("?seed=007")).toBe(7);
    expect(parseSeed("?seed=4294967295")).toBe(4294967295);
  });

  it("accepts a seed amid other params", () => {
    expect(parseSeed("?a=1&seed=9&b=2")).toBe(9);
  });

  it("rejects missing, empty, and malformed seeds", () => {
    for (const q of [
      "",
      "?",
      "?other=1",
      "?seed=",
      "?seed=abc",
      "?seed=1.5",
      "?seed=-3",
      "?seed=4294967296",
      "?seed=1e3",
      "?seed= 42",
    ]) {
      expect(parseSeed(q), q).toBeUndefined();
    }
  });
});

describe("randomSeed", () => {
  it("returns uint32 integers", () => {
    for (let i = 0; i < 100; i++) {
      const s = randomSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(4294967295);
    }
  });

  it("two calls differ", () => {
    expect(randomSeed()).not.toBe(randomSeed());
  });
});
