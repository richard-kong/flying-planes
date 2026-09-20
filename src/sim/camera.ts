// Chase camera (FR-014, FR-015): exponential spring toward a plane-local offset, look-ahead
// target, partial roll follow on the up vector, clearance above the Theme's visible surface.
import { Quaternion } from "three/src/math/Quaternion.js";
import { Vector3 } from "three/src/math/Vector3.js";
import {
  CAMERA_LOOK_AHEAD,
  CAMERA_MIN_CLEARANCE,
  CAMERA_OFFSET_X,
  CAMERA_OFFSET_Y,
  CAMERA_OFFSET_Z,
  CAMERA_ROLL_FOLLOW,
  CAMERA_SPRING,
} from "../constants";
import { surfaceHeightAt } from "./terrain";
import type { PlaneState } from "./flight";
import type { WorldContext } from "./themes";

export interface CameraPose {
  position: Vector3;
  target: Vector3;
  up: Vector3;
}

const offset = new Vector3(CAMERA_OFFSET_X, CAMERA_OFFSET_Y, CAMERA_OFFSET_Z);
const desired = new Vector3();
const forward = new Vector3();
const viewDir = new Vector3();
const screenRight = new Vector3();
const axisScratch = new Quaternion();
const WORLD_UP = new Vector3(0, 1, 0);

// Shared tail of every pose update: clearance clamp, look-ahead target, roll-follow up.
function finishPose(pose: CameraPose, plane: PlaneState, world: WorldContext): void {
  const minY =
    surfaceHeightAt(pose.position.x, pose.position.z, world) + CAMERA_MIN_CLEARANCE;
  if (pose.position.y < minY) pose.position.y = minY;

  const cp = Math.cos(plane.pitch);
  forward.set(Math.sin(plane.heading) * cp, Math.sin(plane.pitch), Math.cos(plane.heading) * cp);
  pose.target.copy(plane.position).addScaledVector(forward, CAMERA_LOOK_AHEAD);

  // orthonormal frame about the view axis, then tilt up by roll * CAMERA_ROLL_FOLLOW
  viewDir.subVectors(pose.target, pose.position).normalize();
  screenRight.crossVectors(WORLD_UP, viewDir).normalize();
  pose.up.crossVectors(viewDir, screenRight);
  axisScratch.setFromAxisAngle(viewDir, plane.roll * CAMERA_ROLL_FOLLOW);
  pose.up.applyQuaternion(axisScratch);
}

export function stepCamera(
  pose: CameraPose,
  plane: PlaneState,
  dt: number,
  world: WorldContext,
): void {
  desired.copy(offset).applyQuaternion(plane.orientation).add(plane.position);
  const k = 1 - Math.exp(-CAMERA_SPRING * dt);
  pose.position.lerp(desired, k);
  finishPose(pose, plane, world);
}

// Converged pose in one call — boot framing, snapshots, and the first interpolation
// presentation all need a valid pose before any sim step has run.
export function initCameraPose(pose: CameraPose, plane: PlaneState, world: WorldContext): void {
  desired.copy(offset).applyQuaternion(plane.orientation).add(plane.position);
  pose.position.copy(desired);
  finishPose(pose, plane, world);
}
