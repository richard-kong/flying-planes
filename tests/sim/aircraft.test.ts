// T001: pure aircraft records. No Three.js, no renderer — the catalogue is data
// consumed by src/render/aircraft.ts and the Flight Chooser.
import { describe, expect, it } from "vitest";
import {
  AIRCRAFT,
  DEFAULT_AIRCRAFT,
  PLANE_FOOTPRINT,
  aircraftById,
  footprintScale,
  stepSpin,
} from "../../src/sim/aircraft";

describe("AIRCRAFT catalogue", () => {
  it("has exactly six records in the chooser's display order", () => {
    expect(AIRCRAFT.map((a) => a.id)).toEqual([
      "helicopter",
      "light",
      "fighter",
      "airliner",
      "biplane",
      "glider",
    ]);
  });

  it("has unique ids and names", () => {
    expect(new Set(AIRCRAFT.map((a) => a.id)).size).toBe(AIRCRAFT.length);
    expect(new Set(AIRCRAFT.map((a) => a.name)).size).toBe(AIRCRAFT.length);
    for (const a of AIRCRAFT) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
    }
  });

  it("selects the light plane by default", () => {
    expect(DEFAULT_AIRCRAFT).toBe("light");
    expect(aircraftById(DEFAULT_AIRCRAFT).id).toBe("light");
  });

  it("normalises every type to the plane footprint on its largest axis", () => {
    expect(PLANE_FOOTPRINT).toBeCloseTo(8 * 0.64);
    for (const a of AIRCRAFT) {
      const dominant = Math.max(a.footprint.length, a.footprint.span);
      expect(footprintScale(a) * dominant).toBeCloseTo(PLANE_FOOTPRINT);
      // the smaller axis must keep the aircraft substantial, not a speck
      const minor = Math.min(a.footprint.length, a.footprint.span);
      expect(footprintScale(a) * minor).toBeGreaterThanOrEqual(PLANE_FOOTPRINT * 0.35);
    }
  });

  it("declares spinners only for powered types, in record order", () => {
    const byId = Object.fromEntries(AIRCRAFT.map((a) => [a.id, a.spinners]));
    expect(byId.helicopter?.map((s) => s.name)).toEqual(["mainRotor", "tailRotor"]);
    expect(byId.helicopter?.map((s) => s.axis)).toEqual(["y", "x"]);
    expect(byId.light?.map((s) => s.name)).toEqual(["propeller"]);
    expect(byId.light?.map((s) => s.axis)).toEqual(["z"]);
    expect(byId.biplane?.map((s) => s.name)).toEqual(["propeller"]);
    expect(byId.biplane?.map((s) => s.axis)).toEqual(["z"]);
    expect(byId.fighter).toHaveLength(0);
    expect(byId.airliner).toHaveLength(0);
    expect(byId.glider).toHaveLength(0);
    for (const a of AIRCRAFT) {
      for (const s of a.spinners) expect(s.rate).toBeGreaterThan(0);
    }
  });
});

describe("stepSpin", () => {
  it("advances the phase by dt and wraps at 2π", () => {
    expect(stepSpin(0, 0.5)).toBeCloseTo(0.5);
    expect(stepSpin(6.0, 0.5)).toBeCloseTo(6.5 - 2 * Math.PI);
    let p = 0;
    for (let i = 0; i < 1_000_000; i++) p = stepSpin(p, 1 / 60);
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(2 * Math.PI);
  });
});
