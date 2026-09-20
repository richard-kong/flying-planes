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
  return { steerX: 0, steerY: 0, throttle: 0.5, active: false, lastInputTime: -100 };
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

  it("updates lastInputTime only when steer changes", () => {
    const out = makeInput();
    pointerToSteer(600, 300, 800, 600, out, 5);
    expect(out.lastInputTime).toBe(5);
    pointerToSteer(600, 300, 800, 600, out, 7);
    expect(out.lastInputTime).toBe(7 - 2); // unchanged: same steer
    pointerToSteer(650, 300, 800, 600, out, 9);
    expect(out.lastInputTime).toBe(9);
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

  it("updates lastInputTime only when throttle changes", () => {
    const out = makeInput();
    wheelToThrottle(-120, out, 4);
    expect(out.lastInputTime).toBe(4);
    out.throttle = 1;
    wheelToThrottle(-120, out, 6); // clamped: no change
    expect(out.lastInputTime).toBe(4);
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
