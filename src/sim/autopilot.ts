// Autopilot (US4, FR-026/027/028): engages after IDLE_TO_AUTOPILOT seconds without input,
// drives the plane level for LEVEL_OUT_TIME, then banks on a slow sine. Any fresh input
// (a newer lastInputTime) disengages on the same step. Writes into a caller-owned
// FlightInput steerOut; throttle is mirrored from the real input so speed intent survives.
import {
  AUTOPILOT_BANK_AMPL,
  AUTOPILOT_BANK_HZ,
  IDLE_TO_AUTOPILOT,
  LEVEL_OUT_TIME,
  MAX_ROLL,
} from "../constants";
import type { FlightInput } from "./input";

export interface AutopilotState {
  engaged: boolean;
  engagedAt: number;
  lastSeenInputTime: number;
}

export function createAutopilotState(): AutopilotState {
  return { engaged: false, engagedAt: 0, lastSeenInputTime: -Infinity };
}

const BANK_STEER = (AUTOPILOT_BANK_AMPL * (Math.PI / 180)) / MAX_ROLL;
const TWO_PI = Math.PI * 2;

export function stepAutopilot(
  ap: AutopilotState,
  input: FlightInput,
  simTime: number,
  _dt: number,
  steerOut: FlightInput,
): void {
  // fresh input since the last step disengages immediately (SC-008)
  if (input.lastInputTime !== ap.lastSeenInputTime) {
    ap.lastSeenInputTime = input.lastInputTime;
    ap.engaged = false;
  }

  if (!ap.engaged) {
    if (simTime - input.lastInputTime >= IDLE_TO_AUTOPILOT) {
      ap.engaged = true;
      ap.engagedAt = simTime;
    } else {
      return;
    }
  }

  steerOut.throttle = input.throttle;
  steerOut.steerY = 0;
  steerOut.active = true;

  const sinceEngage = simTime - ap.engagedAt;
  if (sinceEngage < LEVEL_OUT_TIME) {
    steerOut.steerX = 0; // level-out sub-phase
    return;
  }
  const phase = (sinceEngage - LEVEL_OUT_TIME) * AUTOPILOT_BANK_HZ * TWO_PI;
  steerOut.steerX = BANK_STEER * Math.sin(phase);
}
