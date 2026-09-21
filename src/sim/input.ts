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
  // Fresh-input gate (002): closed at every chooser/pause boundary so a menu gesture can
  // never steer the flight. While closed, "discrete" events are dropped but arm the gate;
  // "held" continuations (a finger dragged in from a menu) stay dropped until release.
  gateArmed: boolean;
}

export type GateEventKind = "discrete" | "held";

/** Close the gate and neutralise steering; throttle and idle history are untouched. */
export function disarmInputGate(input: FlightInput): void {
  input.gateArmed = false;
  input.steerX = 0;
  input.steerY = 0;
  input.active = false;
}

export function armInputGate(input: FlightInput): void {
  input.gateArmed = true;
}

export function inputGateArmed(input: FlightInput): boolean {
  return input.gateArmed;
}

/** A release event (pointerup/touchend-all-up/cancel/leave/blur): arms and neutralises. */
export function releaseInputGate(input: FlightInput): void {
  input.gateArmed = true;
  input.steerX = 0;
  input.steerY = 0;
  input.active = false;
}

/**
 * Event gate: returns true when the event may drive the steer/throttle mappers. While
 * disarmed, discrete events are dropped but arm the gate (the next one applies); held
 * continuations are dropped without arming so a menu-origin drag cannot steer until the
 * finger or button releases.
 */
export function passInputGate(input: FlightInput, kind: GateEventKind): boolean {
  if (input.gateArmed) return true;
  if (kind === "discrete") input.gateArmed = true;
  return false;
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
