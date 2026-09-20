import { describe, expect, it } from "vitest";
import { createPlaneState, stepFlight, type PlaneState } from "../../src/sim/flight";
import type { FlightInput } from "../../src/sim/input";
import { heightAt } from "../../src/sim/terrain";
import {
  LEVEL_OUT_TIME,
  MAX_ACCEL,
  MAX_PITCH,
  MAX_ROLL,
  MAX_SPEED,
  MIN_ALTITUDE_ABOVE_TERRAIN,
  MIN_SPEED,
  SIM_DT,
} from "../../src/constants";

const SEED = 42;

function makeInput(over: Partial<FlightInput> = {}): FlightInput {
  return { steerX: 0, steerY: 0, throttle: 0.5, active: true, lastInputTime: 0, ...over };
}

function run(state: PlaneState, input: FlightInput, seconds: number, seed = SEED): void {
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) stepFlight(state, input, SIM_DT, seed);
}

describe("createPlaneState", () => {
  it("starts airborne above the floor at half throttle speed", () => {
    const s = createPlaneState(SEED);
    expect(s.position.y).toBeGreaterThanOrEqual(
      heightAt(s.position.x, s.position.z, SEED) + MIN_ALTITUDE_ABOVE_TERRAIN,
    );
    expect(s.speed).toBeCloseTo((MIN_SPEED + MAX_SPEED) / 2, 9);
  });
});

describe("stepFlight steering", () => {
  it("steerX = 1 rolls right and turns monotonically", () => {
    const s = createPlaneState(SEED);
    const input = makeInput({ steerX: 1 });
    let prevHeading = s.heading;
    for (let t = 0; t < 3; t += SIM_DT) {
      stepFlight(s, input, SIM_DT, SEED);
      expect(s.heading).toBeGreaterThanOrEqual(prevHeading);
      prevHeading = s.heading;
    }
    expect(s.roll).toBeGreaterThan(MAX_ROLL * 0.9);
    expect(s.roll).toBeLessThanOrEqual(MAX_ROLL);
    expect(s.heading).toBeGreaterThan(0.5);
  });

  it("steerY clamps pitch to +/-MAX_PITCH", () => {
    const s = createPlaneState(SEED);
    run(s, makeInput({ steerY: 1 }), 5);
    expect(s.pitch).toBeCloseTo(MAX_PITCH, 5);
    run(s, makeInput({ steerY: -1 }), 10);
    expect(s.pitch).toBeCloseTo(-MAX_PITCH, 5);
  });

  it("levels out within LEVEL_OUT_TIME at zero steer", () => {
    const s = createPlaneState(SEED);
    s.roll = MAX_ROLL;
    s.pitch = -MAX_PITCH * 0.5;
    run(s, makeInput(), LEVEL_OUT_TIME);
    expect(Math.abs(s.roll)).toBeLessThan(Math.PI / 180);
    expect(Math.abs(s.pitch)).toBeLessThan(Math.PI / 180);
  });
});

describe("stepFlight floor and speed", () => {
  it("full nose-down for 30 s never breaches the floor", () => {
    const s = createPlaneState(SEED);
    const input = makeInput({ steerY: -1 });
    for (let i = 0; i < 30 / SIM_DT; i++) {
      stepFlight(s, input, SIM_DT, SEED);
      const floor = heightAt(s.position.x, s.position.z, SEED) + MIN_ALTITUDE_ABOVE_TERRAIN;
      expect(s.position.y).toBeGreaterThanOrEqual(floor - 1e-6);
    }
  });

  it("speed stays in [MIN_SPEED, MAX_SPEED] and forward progress is positive", () => {
    const s = createPlaneState(SEED);
    const input = makeInput({ steerX: 0.5, throttle: 1 });
    let prevX = s.position.x;
    let prevZ = s.position.z;
    for (let i = 0; i < 5 / SIM_DT; i++) {
      stepFlight(s, input, SIM_DT, SEED);
      expect(s.speed).toBeGreaterThanOrEqual(MIN_SPEED);
      expect(s.speed).toBeLessThanOrEqual(MAX_SPEED);
      expect(Math.hypot(s.position.x - prevX, s.position.z - prevZ)).toBeGreaterThan(0);
      prevX = s.position.x;
      prevZ = s.position.z;
    }
  });

  it("throttle 1 accelerates smoothly to MAX_SPEED; throttle 0 decelerates to MIN_SPEED", () => {
    const s = createPlaneState(SEED);
    const fast = makeInput({ throttle: 1 });
    let prev = s.speed;
    for (let i = 0; i < 30 / SIM_DT; i++) {
      stepFlight(s, fast, SIM_DT, SEED);
      expect(Math.abs(s.speed - prev)).toBeLessThanOrEqual(MAX_ACCEL * SIM_DT + 1e-12);
      prev = s.speed;
    }
    expect(s.speed).toBeCloseTo(MAX_SPEED, 6);
    const slow = makeInput({ throttle: 0 });
    for (let i = 0; i < 30 / SIM_DT; i++) {
      stepFlight(s, slow, SIM_DT, SEED);
      expect(Math.abs(s.speed - prev)).toBeLessThanOrEqual(MAX_ACCEL * SIM_DT + 1e-12);
      prev = s.speed;
    }
    expect(s.speed).toBeCloseTo(MIN_SPEED, 6);
  });

  it("is deterministic: identical inputs give bit-identical state", () => {
    const a = createPlaneState(SEED);
    const b = createPlaneState(SEED);
    const input = makeInput({ steerX: 0.3, steerY: -0.2 });
    for (let i = 0; i < 600; i++) {
      stepFlight(a, input, SIM_DT, SEED);
      stepFlight(b, input, SIM_DT, SEED);
    }
    expect(a.position.x).toBe(b.position.x);
    expect(a.position.y).toBe(b.position.y);
    expect(a.heading).toBe(b.heading);
    expect(a.roll).toBe(b.roll);
  });

  it("never replaces position/orientation object identities", () => {
    const s = createPlaneState(SEED);
    const p = s.position;
    const q = s.orientation;
    run(s, makeInput({ steerX: 1 }), 1);
    expect(s.position).toBe(p);
    expect(s.orientation).toBe(q);
  });
});
