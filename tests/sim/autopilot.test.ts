import { describe, expect, it } from "vitest";
import { stepAutopilot, createAutopilotState } from "../../src/sim/autopilot";
import { wheelToThrottle } from "../../src/sim/input";
import { createPlaneState, stepFlight } from "../../src/sim/flight";
import { heightAt } from "../../src/sim/terrain";
import type { FlightInput } from "../../src/sim/input";
import {
  AUTOPILOT_BANK_AMPL,
  AUTOPILOT_BANK_HZ,
  IDLE_TO_AUTOPILOT,
  LEVEL_OUT_TIME,
  MAX_ROLL,
  MAX_SPEED,
  MIN_ALTITUDE_ABOVE_TERRAIN,
  MIN_SPEED,
  SIM_DT,
} from "../../src/constants";

const SEED = 42;

function makeInput(over: Partial<FlightInput> = {}): FlightInput {
  return { steerX: 0, steerY: 0, throttle: 0.5, active: false, lastInputTime: -100, ...over };
}

function makeSteerOut(): FlightInput {
  return { steerX: 1, steerY: 1, throttle: 0, active: false, lastInputTime: 0 };
}

describe("stepAutopilot", () => {
  it("does not engage before IDLE_TO_AUTOPILOT and leaves steerOut untouched", () => {
    const ap = createAutopilotState();
    const input = makeInput({ lastInputTime: 10 });
    const out = makeSteerOut();
    stepAutopilot(ap, input, 10 + IDLE_TO_AUTOPILOT - 0.001, SIM_DT, out);
    expect(ap.engaged).toBe(false);
    expect(out.steerX).toBe(1);
    expect(out.steerY).toBe(1);
  });

  it("engages at exactly IDLE_TO_AUTOPILOT and levels out first", () => {
    const ap = createAutopilotState();
    const input = makeInput({ lastInputTime: 0 });
    const out = makeSteerOut();
    const t = IDLE_TO_AUTOPILOT;
    stepAutopilot(ap, input, t, SIM_DT, out);
    expect(ap.engaged).toBe(true);
    expect(ap.engagedAt).toBe(t);
    // level-out sub-phase: steer driven to zero
    stepAutopilot(ap, input, t + LEVEL_OUT_TIME / 2, SIM_DT, out);
    expect(out.steerX).toBe(0);
    expect(out.steerY).toBe(0);
    expect(out.throttle).toBe(0.5);
  });

  it("banks gently after level-out, |steerX| < 0.5 always, steerY stays 0", () => {
    const ap = createAutopilotState();
    const input = makeInput({ lastInputTime: 0 });
    const out = makeSteerOut();
    let maxAbs = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let t = IDLE_TO_AUTOPILOT + LEVEL_OUT_TIME; t < IDLE_TO_AUTOPILOT + LEVEL_OUT_TIME + 20; t += SIM_DT) {
      stepAutopilot(ap, input, t, SIM_DT, out);
      maxAbs = Math.max(maxAbs, Math.abs(out.steerX));
      minX = Math.min(minX, out.steerX);
      maxX = Math.max(maxX, out.steerX);
      expect(out.steerY).toBe(0);
    }
    const expected = AUTOPILOT_BANK_AMPL / MAX_ROLL; // 12deg / 45deg ~ 0.267
    expect(maxAbs).toBeLessThan(0.5);
    expect(maxX).toBeCloseTo(expected, 1);
    expect(minX).toBeCloseTo(-expected, 1);
  });

  it("phase advances at AUTOPILOT_BANK_HZ", () => {
    const ap = createAutopilotState();
    const input = makeInput({ lastInputTime: 0 });
    const out = makeSteerOut();
    // engagement happens at t0; banking starts LEVEL_OUT_TIME after that
    const t0 = IDLE_TO_AUTOPILOT + 0.5;
    stepAutopilot(ap, input, t0, SIM_DT, out);
    const quarter = t0 + LEVEL_OUT_TIME + 0.25 / AUTOPILOT_BANK_HZ;
    stepAutopilot(ap, input, quarter, SIM_DT, out);
    expect(out.steerX).toBeCloseTo(AUTOPILOT_BANK_AMPL / MAX_ROLL, 1);
  });

  it("any input change disengages on the same step", () => {
    const ap = createAutopilotState();
    const input = makeInput({ lastInputTime: 0 });
    const out = makeSteerOut();
    stepAutopilot(ap, input, IDLE_TO_AUTOPILOT + 1, SIM_DT, out);
    expect(ap.engaged).toBe(true);
    input.lastInputTime = IDLE_TO_AUTOPILOT + 1.5;
    stepAutopilot(ap, input, IDLE_TO_AUTOPILOT + 1.5, SIM_DT, out);
    expect(ap.engaged).toBe(false);
  });

  it("input at a clamped limit still disengages (wheel at max throttle)", () => {
    const ap = createAutopilotState();
    const input = makeInput({ lastInputTime: 0, throttle: 1 });
    const out = makeSteerOut();
    stepAutopilot(ap, input, IDLE_TO_AUTOPILOT + 1, SIM_DT, out);
    expect(ap.engaged).toBe(true);
    // scrolling further at maximum throttle: throttle cannot change but the event
    // is fresh activity and must disengage on the same step (T058, SC-008)
    const t = IDLE_TO_AUTOPILOT + 1.5;
    wheelToThrottle(-120, input, t);
    stepAutopilot(ap, input, t, SIM_DT, out);
    expect(ap.engaged).toBe(false);
  });

  it("60 s of engaged autopilot through stepFlight never violates floor or speed limits", () => {
    const ap = createAutopilotState();
    const input = makeInput({ lastInputTime: 0 });
    const out = makeSteerOut();
    const s = createPlaneState(SEED);
    for (let i = 0; i < 60 / SIM_DT; i++) {
      const t = i * SIM_DT;
      stepAutopilot(ap, input, t, SIM_DT, out);
      stepFlight(s, ap.engaged ? out : input, SIM_DT, SEED);
      expect(s.speed).toBeGreaterThanOrEqual(MIN_SPEED - 1e-9);
      expect(s.speed).toBeLessThanOrEqual(MAX_SPEED + 1e-9);
      const floor = heightAt(s.position.x, s.position.z, SEED) + MIN_ALTITUDE_ABOVE_TERRAIN;
      expect(s.position.y).toBeGreaterThanOrEqual(floor - 1e-6);
    }
  });
});
