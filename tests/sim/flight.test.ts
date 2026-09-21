import { describe, expect, it } from "vitest";
import { Vector3 } from "three/src/math/Vector3.js";
import { createPlaneState, stepFlight, type PlaneState } from "../../src/sim/flight";
import type { FlightInput } from "../../src/sim/input";
import { heightAt, surfaceHeightAt } from "../../src/sim/terrain";
import { worldAlien } from "./theme-test-helpers";
import {
  LEVEL_OUT_TIME,
  MAX_ACCEL,
  MAX_PITCH,
  MAX_ROLL,
  MAX_SPEED,
  MIN_ALTITUDE_ABOVE_TERRAIN,
  MIN_SPEED,
  SIM_DT,
  WATER_LEVEL,
} from "../../src/constants";

const SEED = 42;

function makeInput(over: Partial<FlightInput> = {}): FlightInput {
  return { steerX: 0, steerY: 0, throttle: 0.5, active: true, lastInputTime: 0, gateArmed: true, ...over };
}

function run(state: PlaneState, input: FlightInput, seconds: number, seed = SEED): void {
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) stepFlight(state, input, SIM_DT, worldAlien(seed));
}

describe("createPlaneState", () => {
  it("starts airborne above the floor at half throttle speed", () => {
    const s = createPlaneState(worldAlien(SEED));
    expect(s.position.y).toBeGreaterThanOrEqual(
      surfaceHeightAt(s.position.x, s.position.z, worldAlien(SEED)) + MIN_ALTITUDE_ABOVE_TERRAIN,
    );
    expect(s.speed).toBeCloseTo((MIN_SPEED + MAX_SPEED) / 2, 9);
  });
});

describe("stepFlight steering", () => {
  it("steerX = 1 rolls right and turns monotonically", () => {
    const s = createPlaneState(worldAlien(SEED));
    const input = makeInput({ steerX: 1 });
    let prevHeading = s.heading;
    for (let t = 0; t < 3; t += SIM_DT) {
      stepFlight(s, input, SIM_DT, worldAlien(SEED));
      expect(s.heading).toBeGreaterThanOrEqual(prevHeading);
      prevHeading = s.heading;
    }
    expect(s.roll).toBeGreaterThan(MAX_ROLL * 0.9);
    expect(s.roll).toBeLessThanOrEqual(MAX_ROLL);
    expect(s.heading).toBeGreaterThan(0.5);
  });

  it("steerY clamps pitch to +/-MAX_PITCH", () => {
    const s = createPlaneState(worldAlien(SEED));
    run(s, makeInput({ steerY: 1 }), 5);
    expect(s.pitch).toBeCloseTo(MAX_PITCH, 5);
    run(s, makeInput({ steerY: -1 }), 10);
    expect(s.pitch).toBeCloseTo(-MAX_PITCH, 5);
  });

  it("orientation nose matches the flight direction for positive and negative pitch", () => {
    const nose = new Vector3();
    for (const steerY of [1, -1]) {
      const s = createPlaneState(worldAlien(SEED));
      run(s, makeInput({ steerY }), 1);
      nose.set(0, 0, 1).applyQuaternion(s.orientation).normalize();
      const cp = Math.cos(s.pitch);
      expect(nose.x).toBeCloseTo(Math.sin(s.heading) * cp, 5);
      expect(nose.y).toBeCloseTo(Math.sin(s.pitch), 5);
      expect(nose.z).toBeCloseTo(Math.cos(s.heading) * cp, 5);
    }
  });

  it("levels out within LEVEL_OUT_TIME at zero steer", () => {
    const s = createPlaneState(worldAlien(SEED));
    s.roll = MAX_ROLL;
    s.pitch = -MAX_PITCH * 0.5;
    run(s, makeInput(), LEVEL_OUT_TIME);
    expect(Math.abs(s.roll)).toBeLessThan(Math.PI / 180);
    expect(Math.abs(s.pitch)).toBeLessThan(Math.PI / 180);
  });
});

describe("stepFlight floor and speed", () => {
  it("full nose-down for 30 s never breaches the floor", () => {
    const s = createPlaneState(worldAlien(SEED));
    const input = makeInput({ steerY: -1 });
    for (let i = 0; i < 30 / SIM_DT; i++) {
      stepFlight(s, input, SIM_DT, worldAlien(SEED));
      const floor = surfaceHeightAt(s.position.x, s.position.z, worldAlien(SEED)) + MIN_ALTITUDE_ABOVE_TERRAIN;
      expect(s.position.y).toBeGreaterThanOrEqual(floor - 1e-6);
    }
  });

  it("speed stays in [MIN_SPEED, MAX_SPEED] and forward progress is positive", () => {
    const s = createPlaneState(worldAlien(SEED));
    const input = makeInput({ steerX: 0.5, throttle: 1 });
    let prevX = s.position.x;
    let prevZ = s.position.z;
    for (let i = 0; i < 5 / SIM_DT; i++) {
      stepFlight(s, input, SIM_DT, worldAlien(SEED));
      expect(s.speed).toBeGreaterThanOrEqual(MIN_SPEED);
      expect(s.speed).toBeLessThanOrEqual(MAX_SPEED);
      expect(Math.hypot(s.position.x - prevX, s.position.z - prevZ)).toBeGreaterThan(0);
      prevX = s.position.x;
      prevZ = s.position.z;
    }
  });

  it("throttle 1 accelerates smoothly to MAX_SPEED; throttle 0 decelerates to MIN_SPEED", () => {
    const s = createPlaneState(worldAlien(SEED));
    const fast = makeInput({ throttle: 1 });
    let prev = s.speed;
    for (let i = 0; i < 30 / SIM_DT; i++) {
      stepFlight(s, fast, SIM_DT, worldAlien(SEED));
      expect(Math.abs(s.speed - prev)).toBeLessThanOrEqual(MAX_ACCEL * SIM_DT + 1e-12);
      prev = s.speed;
    }
    expect(s.speed).toBeCloseTo(MAX_SPEED, 6);
    const slow = makeInput({ throttle: 0 });
    for (let i = 0; i < 30 / SIM_DT; i++) {
      stepFlight(s, slow, SIM_DT, worldAlien(SEED));
      expect(Math.abs(s.speed - prev)).toBeLessThanOrEqual(MAX_ACCEL * SIM_DT + 1e-12);
      prev = s.speed;
    }
    expect(s.speed).toBeCloseTo(MIN_SPEED, 6);
  });

  it("the floor is measured from the water surface over lakes", () => {
    // find a seed/point where terrain dips below WATER_LEVEL, place the plane there nose-down
    let lakeSeed = -1;
    for (let s = 0; s < 200; s++) {
      let found = false;
      for (let x = -2000; x <= 2000 && !found; x += 50) {
        for (let z = -2000; z <= 2000; z += 50) {
          if (heightAt(x, z, worldAlien(s)) < WATER_LEVEL - 20) {
            lakeSeed = s;
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }
    expect(lakeSeed).toBeGreaterThanOrEqual(0);
    const s = createPlaneState(worldAlien(lakeSeed));
    const input = makeInput({ steerY: -1 });
    for (let i = 0; i < 60 / SIM_DT; i++) {
      stepFlight(s, input, SIM_DT, worldAlien(lakeSeed));
      expect(s.position.y).toBeGreaterThanOrEqual(WATER_LEVEL + MIN_ALTITUDE_ABOVE_TERRAIN - 30 - 1e-6);
    }
    // after easing, the plane must never end up below the water surface
    expect(s.position.y).toBeGreaterThanOrEqual(WATER_LEVEL - 1e-6);
  });

  it("is deterministic: identical inputs give bit-identical state", () => {
    const a = createPlaneState(worldAlien(SEED));
    const b = createPlaneState(worldAlien(SEED));
    const input = makeInput({ steerX: 0.3, steerY: -0.2 });
    for (let i = 0; i < 600; i++) {
      stepFlight(a, input, SIM_DT, worldAlien(SEED));
      stepFlight(b, input, SIM_DT, worldAlien(SEED));
    }
    expect(a.position.x).toBe(b.position.x);
    expect(a.position.y).toBe(b.position.y);
    expect(a.heading).toBe(b.heading);
    expect(a.roll).toBe(b.roll);
  });

  it("never replaces position/orientation object identities", () => {
    const s = createPlaneState(worldAlien(SEED));
    const p = s.position;
    const q = s.orientation;
    run(s, makeInput({ steerX: 1 }), 1);
    expect(s.position).toBe(p);
    expect(s.orientation).toBe(q);
  });
});

// --- 002 T007: WorldContext floor clearance ---
import { themeById, type WorldContext } from "../../src/sim/themes";

const worldOf = (id: "nature" | "alien" | "arctic", seed: number): WorldContext => ({
  theme: themeById(id),
  seed,
});

describe("stepFlight with WorldContext", () => {
  it("createPlaneState starts above the surface floor for every theme", () => {
    for (const id of ["nature", "alien", "arctic"] as const) {
      const s = createPlaneState(worldOf(id, 42));
      expect(s.position.y).toBeGreaterThanOrEqual(
        surfaceHeightAt(s.position.x, s.position.z, worldOf(id, 42)) + MIN_ALTITUDE_ABOVE_TERRAIN,
      );
    }
  });

  it("never dips below surfaceHeightAt + clearance under full nose-down", () => {
    for (const id of ["nature", "alien", "arctic"] as const) {
      const world = worldOf(id, 42);
      const s = createPlaneState(world);
      const input = makeInput({ steerY: -1 });
      for (let i = 0; i < 20 / SIM_DT; i++) {
        stepFlight(s, input, SIM_DT, world);
        const floor = surfaceHeightAt(s.position.x, s.position.z, world) + MIN_ALTITUDE_ABOVE_TERRAIN;
        expect(s.position.y).toBeGreaterThanOrEqual(floor - 1e-6);
      }
    }
  });

  it("the plane floor respects a surface level above the terrain", () => {
    // a custom world whose surface level exceeds the local terrain: floor = level
    const theme = { ...themeById("arctic"), surface: { ...themeById("arctic").surface, level: 2500 } };
    const world: WorldContext = { theme, seed: 42 };
    const s = createPlaneState(world);
    const input = makeInput({ steerY: -1 });
    for (let i = 0; i < 30 / SIM_DT; i++) {
      stepFlight(s, input, SIM_DT, world);
      expect(s.position.y).toBeGreaterThanOrEqual(2500 + MIN_ALTITUDE_ABOVE_TERRAIN - 1e-6);
    }
  });

  // T040: a scripted route per theme — determinism across reruns, clearance over the
  // theme's surface, speed envelope, and continuous heading (no teleport/NaN).
  it("a scripted route stays deterministic, clear of the surface, and in the speed envelope", () => {
    for (const id of ["nature", "alien", "arctic"] as const) {
      const world = worldOf(id, 42);
      const runRoute = () => {
        const s = createPlaneState(world);
        const trace: number[] = [];
        const script = [
          { steerX: 0.6, steerY: -0.2, throttle: 0.9 },
          { steerX: -0.4, steerY: 0.3, throttle: 0.3 },
          { steerX: 0.0, steerY: 0.0, throttle: 0.5 },
        ];
        let step = 0;
        for (const inp of script) {
          const input = makeInput(inp);
          for (let i = 0; i < 12 / SIM_DT; i++) {
            stepFlight(s, input, SIM_DT, world);
            const floor = surfaceHeightAt(s.position.x, s.position.z, world);
            expect(s.position.y).toBeGreaterThanOrEqual(floor + MIN_ALTITUDE_ABOVE_TERRAIN - 1e-6);
            expect(s.speed).toBeGreaterThanOrEqual(MIN_SPEED - 1e-9);
            expect(s.speed).toBeLessThanOrEqual(MAX_SPEED + 1e-9);
            trace.push(s.position.x, s.position.y, s.position.z, s.heading);
            step++;
          }
        }
        return trace;
      };
      const a = runRoute();
      const b = runRoute();
      expect(a).toEqual(b); // bit-identical across identical preparation
      expect(a.length).toBeGreaterThan(100);
    }
  });
});
