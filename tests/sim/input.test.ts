import { describe, expect, it } from "vitest";
import {
  inputInactive,
  pinchToThrottle,
  pointerToSteer,
  touchDragToSteer,
  wheelToThrottle,
  type FlightInput,
} from "../../src/sim/input";
import { THROTTLE_STEP, TOUCH_FULL_DEFLECTION_PX } from "../../src/constants";

function makeInput(): FlightInput {
  return { steerX: 0, steerY: 0, throttle: 0.5, active: false, lastInputTime: -100, gateArmed: true };
}

describe("pointerToSteer", () => {
  it("centre is (0, 0)", () => {
    const out = makeInput();
    pointerToSteer(400, 300, 800, 600, out, 1);
    expect(out.steerX).toBe(0);
    expect(out.steerY).toBe(0);
    expect(out.active).toBe(true);
  });

  it("right edge is x = 1, left edge is x = -1", () => {
    const out = makeInput();
    pointerToSteer(800, 300, 800, 600, out, 1);
    expect(out.steerX).toBe(1);
    pointerToSteer(0, 300, 800, 600, out, 2);
    expect(out.steerX).toBe(-1);
  });

  it("top edge is y = -1 (nose down), bottom edge is y = 1 (nose up)", () => {
    const out = makeInput();
    pointerToSteer(400, 0, 800, 600, out, 1);
    expect(out.steerY).toBe(-1);
    pointerToSteer(400, 600, 800, 600, out, 2);
    expect(out.steerY).toBe(1);
  });

  it("clamps beyond the viewport", () => {
    const out = makeInput();
    pointerToSteer(2000, -500, 800, 600, out, 1);
    expect(out.steerX).toBe(1);
    expect(out.steerY).toBe(-1);
  });

  it("every event is fresh activity, even at a clamped value", () => {
    const out = makeInput();
    pointerToSteer(600, 300, 800, 600, out, 5);
    expect(out.lastInputTime).toBe(5);
    // held at a clamped position: a further event still counts as activity (T058)
    pointerToSteer(2000, 300, 800, 600, out, 7);
    expect(out.lastInputTime).toBe(7);
    pointerToSteer(4000, 300, 800, 600, out, 9);
    expect(out.steerX).toBe(1); // still clamped
    expect(out.lastInputTime).toBe(9);
  });

  it("recordActivity=false recomputes steer without bumping lastInputTime", () => {
    const out = makeInput();
    pointerToSteer(600, 300, 800, 600, out, 5);
    expect(out.steerX).toBe(0.5);
    // same pointer position, wider viewport (resize recompute): value recentres,
    // but no fresh activity is recorded (T063)
    pointerToSteer(600, 300, 1200, 600, out, 9, false);
    expect(out.steerX).toBe(0);
    expect(out.lastInputTime).toBe(5);
    expect(out.active).toBe(true);
  });
});

describe("touchDragToSteer", () => {
  it("full deflection at TOUCH_FULL_DEFLECTION_PX, clamped beyond", () => {
    const out = makeInput();
    touchDragToSteer(TOUCH_FULL_DEFLECTION_PX, 0, out, 3);
    expect(out.steerX).toBe(1);
    touchDragToSteer(TOUCH_FULL_DEFLECTION_PX * 3, -TOUCH_FULL_DEFLECTION_PX * 3, out, 4);
    expect(out.steerX).toBe(1);
    expect(out.steerY).toBe(-1);
    touchDragToSteer(-40, 80, out, 5);
    expect(out.steerX).toBeCloseTo(-0.25, 9);
    expect(out.steerY).toBeCloseTo(0.5, 9);
    expect(out.active).toBe(true);
  });

  it("a zero-delta touch is still fresh activity (touch-down / drag-origin reset)", () => {
    const out = makeInput();
    out.steerX = 0.6;
    touchDragToSteer(0, 0, out, 12);
    expect(out.steerX).toBe(0);
    expect(out.steerY).toBe(0);
    expect(out.active).toBe(true);
    expect(out.lastInputTime).toBe(12);
  });
});

describe("wheelToThrottle", () => {
  it("deltaY < 0 raises throttle by THROTTLE_STEP; > 0 lowers", () => {
    const out = makeInput();
    wheelToThrottle(-120, out, 2);
    expect(out.throttle).toBeCloseTo(0.5 + THROTTLE_STEP, 9);
    wheelToThrottle(240, out, 3);
    expect(out.throttle).toBeCloseTo(0.5, 9);
  });

  it("clamps to [0, 1]", () => {
    const out = makeInput();
    out.throttle = 0.97;
    wheelToThrottle(-120, out, 1);
    expect(out.throttle).toBe(1);
    out.throttle = 0.03;
    wheelToThrottle(120, out, 2);
    expect(out.throttle).toBe(0);
  });

  it("scrolling at the limit is still fresh activity", () => {
    const out = makeInput();
    wheelToThrottle(-120, out, 4);
    expect(out.lastInputTime).toBe(4);
    out.throttle = 1;
    wheelToThrottle(-120, out, 6); // clamped: value cannot change but the event counts
    expect(out.throttle).toBe(1);
    expect(out.lastInputTime).toBe(6);
  });
});

describe("pinchToThrottle", () => {
  it("scaleDelta > 1 raises throttle, < 1 lowers", () => {
    const out = makeInput();
    pinchToThrottle(1.2, out, 1);
    expect(out.throttle).toBeCloseTo(0.6, 9);
    pinchToThrottle(0.8, out, 2);
    expect(out.throttle).toBeCloseTo(0.5, 9);
  });

  it("clamps to [0, 1] and bumps lastInputTime", () => {
    const out = makeInput();
    out.throttle = 0.95;
    pinchToThrottle(1.5, out, 7);
    expect(out.throttle).toBe(1);
    expect(out.lastInputTime).toBe(7);
  });
});

describe("inputInactive", () => {
  it("zeroes steer and clears active", () => {
    const out = makeInput();
    out.steerX = 0.8;
    out.steerY = -0.4;
    out.active = true;
    inputInactive(out);
    expect(out.steerX).toBe(0);
    expect(out.steerY).toBe(0);
    expect(out.active).toBe(false);
  });
});

// --- 002 T010: fresh-input gate (chooser/pause boundaries) ---
import {
  armInputGate,
  disarmInputGate,
  inputGateArmed,
  passInputGate,
  releaseInputGate,
} from "../../src/sim/input";

describe("input gate", () => {
  it("disarm neutralises steering but preserves throttle and idle history", () => {
    const out = makeInput();
    out.steerX = 0.7;
    out.steerY = -0.3;
    out.throttle = 0.9;
    out.active = true;
    out.lastInputTime = 55;
    disarmInputGate(out);
    expect(out.steerX).toBe(0);
    expect(out.steerY).toBe(0);
    expect(out.active).toBe(false);
    expect(out.throttle).toBe(0.9);
    expect(out.lastInputTime).toBe(55);
    expect(inputGateArmed(out)).toBe(false);
  });

  it("the first discrete event while disarmed is dropped but arms the gate", () => {
    const out = makeInput();
    disarmInputGate(out);
    expect(passInputGate(out, "discrete")).toBe(false);
    expect(inputGateArmed(out)).toBe(true);
    // the next event applies normally
    expect(passInputGate(out, "discrete")).toBe(true);
  });

  it("held continuations while disarmed are dropped without arming", () => {
    const out = makeInput();
    disarmInputGate(out);
    for (const t of [10, 11, 12]) {
      expect(passInputGate(out, "held")).toBe(false);
      expect(inputGateArmed(out)).toBe(false);
    }
    // a release then arms: menu drags cannot steer until the finger lifts
    releaseInputGate(out);
    expect(inputGateArmed(out)).toBe(true);
    expect(passInputGate(out, "held")).toBe(true);
  });

  it("release events while disarmed arm and neutralise", () => {
    const out = makeInput();
    out.steerX = 0.4;
    disarmInputGate(out);
    out.steerX = 0.4; // menu code could have written steer while disarmed
    releaseInputGate(out);
    expect(inputGateArmed(out)).toBe(true);
    expect(out.steerX).toBe(0);
    expect(out.steerY).toBe(0);
    expect(out.active).toBe(false);
  });

  it("armed gate passes every event kind", () => {
    const out = makeInput();
    armInputGate(out);
    expect(passInputGate(out, "discrete")).toBe(true);
    expect(passInputGate(out, "held")).toBe(true);
  });

  it("an event at sim-time zero still counts as fresh activity", () => {
    const out = makeInput();
    pointerToSteer(600, 300, 800, 600, out, 0);
    expect(out.lastInputTime).toBe(0);
    expect(out.active).toBe(true);
  });
});
