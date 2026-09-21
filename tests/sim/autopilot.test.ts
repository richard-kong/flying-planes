import { describe, expect, it } from "vitest";
import { stepAutopilot, createAutopilotState } from "../../src/sim/autopilot";
import { copyAutopilot } from "../../src/sim/session";
import { wheelToThrottle } from "../../src/sim/input";
import { createPlaneState, stepFlight } from "../../src/sim/flight";
import { surfaceHeightAt } from "../../src/sim/terrain";
import { worldAlien } from "./theme-test-helpers";
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
  return { steerX: 0, steerY: 0, throttle: 0.5, active: false, lastInputTime: -100, gateArmed: true, ...over };
}

function makeSteerOut(): FlightInput {
  return { steerX: 1, steerY: 1, throttle: 0, active: false, lastInputTime: 0, gateArmed: true };
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
    const s = createPlaneState(worldAlien(SEED));
    for (let i = 0; i < 60 / SIM_DT; i++) {
      const t = i * SIM_DT;
      stepAutopilot(ap, input, t, SIM_DT, out);
      stepFlight(s, ap.engaged ? out : input, SIM_DT, worldAlien(SEED));
      expect(s.speed).toBeGreaterThanOrEqual(MIN_SPEED - 1e-9);
      expect(s.speed).toBeLessThanOrEqual(MAX_SPEED + 1e-9);
      const floor = surfaceHeightAt(s.position.x, s.position.z, worldAlien(SEED)) + MIN_ALTITUDE_ABOVE_TERRAIN;
      expect(s.position.y).toBeGreaterThanOrEqual(floor - 1e-6);
    }
  });
});

// --- 002 T010: autopilot across chooser/pause boundaries ---
import { disarmInputGate } from "../../src/sim/input";

describe("autopilot across input-gate boundaries", () => {
  it("disarming preserves lastInputTime, so sim-time pause never re-engages spuriously", () => {
    const input = makeInput({ lastInputTime: 100, throttle: 0.8, steerX: 0.5 });
    disarmInputGate(input);
    // autopilot must see the same idle window after resume (simTime is paused by caller)
    const ap = createAutopilotState();
    const out = makeSteerOut();
    stepAutopilot(ap, input, 100 + IDLE_TO_AUTOPILOT - 1, SIM_DT, out);
    expect(ap.engaged).toBe(false);
    // and a non-default throttle survives a Fly/Cancel boundary untouched
    expect(input.throttle).toBe(0.8);
  });

  it("a boundary while engaged disengages exactly as before (fresh event resumes manual)", () => {
    const ap = createAutopilotState();
    const input = makeInput({ lastInputTime: 0 });
    const out = makeSteerOut();
    stepAutopilot(ap, input, IDLE_TO_AUTOPILOT + 1, SIM_DT, out);
    expect(ap.engaged).toBe(true);
    // simulate: pause boundary disarms, then a fresh input event arrives post-resume
    disarmInputGate(input);
    const t = IDLE_TO_AUTOPILOT + 2;
    input.lastInputTime = t;
    stepAutopilot(ap, input, t, SIM_DT, out);
    expect(ap.engaged).toBe(false);
  });

  it("an engaged Autopilot snapshots round-trip: restored state does not re-engage early", () => {
    const ap = createAutopilotState();
    const input = makeInput({ lastInputTime: 0 });
    const out = makeSteerOut();
    stepAutopilot(ap, input, IDLE_TO_AUTOPILOT + 1, SIM_DT, out);
    expect(ap.engaged).toBe(true);
    const engagedAt = ap.engagedAt;
    // snapshot copy (same helpers main.ts uses in the FlightSnapshot)
    const copy = { engaged: false, engagedAt: 0, lastSeenInputTime: 0 };
    copyAutopilot(copy, ap);
    copyAutopilot(ap, copy); // restore into the live record
    expect(ap.engaged).toBe(true);
    expect(ap.engagedAt).toBe(engagedAt);
    // engaged flight continues seamlessly — no re-engagement delay, no disengage glitch
    stepAutopilot(ap, input, IDLE_TO_AUTOPILOT + 1.5, SIM_DT, out);
    expect(ap.engaged).toBe(true);
    // menu time must not count: stepping at a far-future time with a stale input clock
    // keeps the bank going rather than treating the gap as fresh activity
    stepAutopilot(ap, input, IDLE_TO_AUTOPILOT + 60, SIM_DT, out);
    expect(ap.engaged).toBe(true);
  });
});
