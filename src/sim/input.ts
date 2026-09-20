// The only producer of Steer Vector / Throttle (constitution V). Every function writes into
// the caller's FlightInput; lastInputTime records the latest genuine input event — a call
// made for a real device event bumps it even when the clamped value does not change
// (input at a limit is still activity, FR-027/T058). Callers recomputing a value without a
// user event (e.g. viewport resize) pass recordActivity = false.
import { THROTTLE_STEP, TOUCH_FULL_DEFLECTION_PX } from "../constants";

export interface FlightInput {
  steerX: number; // [-1, 1] right positive
  steerY: number; // [-1, 1] screen-up = -1 = nose down
  throttle: number; // [0, 1]
  active: boolean;
  lastInputTime: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampSteer(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

export function pointerToSteer(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
  out: FlightInput,
  simTime: number,
  recordActivity = true,
): void {
  const x = clampSteer((clientX - width / 2) / (width / 2));
  const y = clampSteer((clientY - height / 2) / (height / 2));
  if (recordActivity) out.lastInputTime = simTime;
  out.steerX = x;
  out.steerY = y;
  out.active = true;
}

export function touchDragToSteer(
  dx: number,
  dy: number,
  out: FlightInput,
  simTime: number,
): void {
  const x = clampSteer(dx / TOUCH_FULL_DEFLECTION_PX);
  const y = clampSteer(dy / TOUCH_FULL_DEFLECTION_PX);
  out.lastInputTime = simTime;
  out.steerX = x;
  out.steerY = y;
  out.active = true;
}

export function wheelToThrottle(deltaY: number, out: FlightInput, simTime: number): void {
  const next = clamp01(out.throttle + (deltaY < 0 ? THROTTLE_STEP : -THROTTLE_STEP));
  out.throttle = next;
  out.lastInputTime = simTime;
}

export function pinchToThrottle(scaleDelta: number, out: FlightInput, simTime: number): void {
  const next = clamp01(out.throttle + (scaleDelta - 1) * 0.5);
  out.throttle = next;
  out.lastInputTime = simTime;
}

export function inputInactive(out: FlightInput): void {
  out.steerX = 0;
  out.steerY = 0;
  out.active = false;
}
