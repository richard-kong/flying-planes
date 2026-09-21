// The Flight Model (FR-002): (PlaneState, FlightInput, dt) -> next state, in place.
import { Quaternion } from "three/src/math/Quaternion.js";
import { Vector3 } from "three/src/math/Vector3.js";
import { Euler } from "three/src/math/Euler.js";
import {
  LEVEL_OUT_TIME,
  MAX_ACCEL,
  MAX_PITCH,
  MAX_ROLL,
  MAX_SPEED,
  MIN_ALTITUDE_ABOVE_TERRAIN,
  MIN_SPEED,
  TURN_RATE_PER_ROLL,
} from "../constants";
import { surfaceHeightAt } from "./terrain";
import type { FlightInput } from "./input";
import type { WorldContext } from "./themes";

export interface PlaneState {
  position: Vector3;
  orientation: Quaternion;
  heading: number; // radians, 0 = +z, right turn positive
  pitch: number; // radians, + = nose up, |pitch| <= MAX_PITCH
  roll: number; // radians, + = right bank, |roll| <= MAX_ROLL
  speed: number; // m/s in [MIN_SPEED, MAX_SPEED]
}

const START_CLEARANCE = 200;

export function createPlaneState(world: WorldContext): PlaneState {
  const position = new Vector3(0, surfaceHeightAt(0, 0, world) + START_CLEARANCE, 0);
  return {
    position,
    orientation: new Quaternion(),
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: (MIN_SPEED + MAX_SPEED) / 2,
  };
}

// Response time constants: fast enough to feel direct, slow enough to look like an aircraft.
const ATTITUDE_TAU = 0.35;
const FLOOR_TAU = 0.25; // pitch pull-up while inside the floor ease band
const FLOOR_BAND = 30; // metres above the minimum where easing starts
const FLOOR_PITCH = 0.15; // gentle nose-up pitch while recovering from the floor

const eulerScratch = new Euler(0, 0, 0, "YXZ");

export function stepFlight(
  state: PlaneState,
  input: FlightInput,
  dt: number,
  world: WorldContext,
): void {
  const targetRoll = input.steerX * MAX_ROLL;
  const targetPitch = input.steerY * MAX_PITCH;
  const k = 1 - Math.exp(-dt / ATTITUDE_TAU);
  state.roll += (targetRoll - state.roll) * k;
  state.pitch += (targetPitch - state.pitch) * k;
  if (state.roll > MAX_ROLL) state.roll = MAX_ROLL;
  else if (state.roll < -MAX_ROLL) state.roll = -MAX_ROLL;
  if (state.pitch > MAX_PITCH) state.pitch = MAX_PITCH;
  else if (state.pitch < -MAX_PITCH) state.pitch = -MAX_PITCH;

  state.heading += state.roll * TURN_RATE_PER_ROLL * dt;

  const targetSpeed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * input.throttle;
  const dv = targetSpeed - state.speed;
  const maxDv = MAX_ACCEL * dt;
  state.speed += dv > maxDv ? maxDv : dv < -maxDv ? -maxDv : dv;

  // integrate along the heading/pitch direction (roll does not steer the path)
  const cp = Math.cos(state.pitch);
  const fx = Math.sin(state.heading) * cp;
  const fy = Math.sin(state.pitch);
  const fz = Math.cos(state.heading) * cp;
  const nx = state.position.x + fx * state.speed * dt;
  const nz = state.position.z + fz * state.speed * dt;
  let ny = state.position.y + fy * state.speed * dt;

  // soft floor (FR-006): eased vertical velocity inside FLOOR_BAND, hard backstop at minY.
  // The floor is the Theme's visible surface — water/ice above raw terrain still protects
  // the plane (002: surfaceHeightAt replaces the global water level).
  const minY = surfaceHeightAt(nx, nz, world) + MIN_ALTITUDE_ABOVE_TERRAIN;
  if (ny <= minY + FLOOR_BAND) {
    const t = Math.max(0, ny - minY) / FLOOR_BAND; // 0 at the floor, 1 at band top
    const ease = t * t;
    const vy = fy * state.speed;
    const easedVy = (vy < 0 ? vy * ease : vy) + (1 - ease) * FLOOR_BAND * 0.5;
    ny = state.position.y + easedVy * dt;
    if (ny < minY) ny = minY;
    // gently pull the nose up while in the band so the plane climbs back out
    const kp = 1 - Math.exp(-dt / FLOOR_TAU);
    state.pitch += (FLOOR_PITCH - state.pitch) * kp;
  }

  state.position.x = nx;
  state.position.y = ny;
  state.position.z = nz;

  // nose (+z) must follow the integrated flight direction: positive pitch is up, which is
  // a negative rotation about +x
  eulerScratch.set(-state.pitch, state.heading, -state.roll, "YXZ");
  state.orientation.setFromEuler(eulerScratch);
}
