import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { createPlaneState } from "../../src/sim/flight";
import { stepCamera, type CameraPose } from "../../src/sim/camera";
import { surfaceHeightAt } from "../../src/sim/terrain";
import { worldAlien } from "./theme-test-helpers";
import {
  CAMERA_LOOK_AHEAD,
  CAMERA_MIN_CLEARANCE,
  CAMERA_OFFSET_X,
  CAMERA_OFFSET_Y,
  CAMERA_OFFSET_Z,
  CAMERA_ROLL_FOLLOW,
  MAX_ROLL,
  SIM_DT,
} from "../../src/constants";

const SEED = 42;

function makePose(): CameraPose {
  return { position: new Vector3(), target: new Vector3(), up: new Vector3(0, 1, 0) };
}

const offset = new Vector3(CAMERA_OFFSET_X, CAMERA_OFFSET_Y, CAMERA_OFFSET_Z);
const desired = new Vector3();

describe("stepCamera", () => {
  it("converges to plane.position + orientation * CAMERA_OFFSET", () => {
    const plane = createPlaneState(worldAlien(SEED));
    const pose = makePose();
    pose.position.set(0, 0, 0);
    for (let i = 0; i < 5 / SIM_DT; i++) stepCamera(pose, plane, SIM_DT, worldAlien(SEED));
    desired.copy(offset).applyQuaternion(plane.orientation).add(plane.position);
    expect(pose.position.distanceTo(desired)).toBeLessThan(0.5);
  });

  it("lags a step change without overshoot > 10%", () => {
    const plane = createPlaneState(worldAlien(SEED));
    const pose = makePose();
    for (let i = 0; i < 5 / SIM_DT; i++) stepCamera(pose, plane, SIM_DT, worldAlien(SEED));
    // teleport the plane forward; camera must lag then converge monotonically
    plane.position.z += 200;
    desired.copy(offset).applyQuaternion(plane.orientation).add(plane.position);
    let prevDist = pose.position.distanceTo(desired);
    const startDist = prevDist;
    for (let i = 0; i < 3 / SIM_DT; i++) {
      stepCamera(pose, plane, SIM_DT, worldAlien(SEED));
      const d = pose.position.distanceTo(desired);
      expect(d).toBeLessThanOrEqual(prevDist + 1e-9);
      prevDist = d;
    }
    expect(prevDist).toBeLessThan(startDist);
  });

  it("stays above terrain clearance when the plane skims a ridge", () => {
    const plane = createPlaneState(worldAlien(SEED));
    plane.position.y = surfaceHeightAt(plane.position.x, plane.position.z, worldAlien(SEED)) + 1;
    const pose = makePose();
    pose.position.copy(plane.position);
    stepCamera(pose, plane, SIM_DT, worldAlien(SEED));
    expect(pose.position.y).toBeGreaterThanOrEqual(
      surfaceHeightAt(pose.position.x, pose.position.z, worldAlien(SEED)) + CAMERA_MIN_CLEARANCE - 1e-9,
    );
  });

  it("rolls the up vector by roll * CAMERA_ROLL_FOLLOW around the view axis", () => {
    const plane = createPlaneState(worldAlien(SEED));
    plane.roll = MAX_ROLL;
    const tilt = MAX_ROLL * CAMERA_ROLL_FOLLOW;
    const pose = makePose();
    for (let i = 0; i < 5 / SIM_DT; i++) stepCamera(pose, plane, SIM_DT, worldAlien(SEED));
    const up = pose.up;
    expect(up.length()).toBeCloseTo(1, 6);
    // up stays perpendicular to the view direction
    const view = new Vector3().subVectors(pose.target, pose.position).normalize();
    expect(Math.abs(up.dot(view))).toBeLessThan(1e-6);
    // lateral component of up equals sin(tilt)
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), view).normalize();
    expect(Math.abs(up.dot(right))).toBeCloseTo(Math.sin(tilt), 5);
    // look-ahead target sits CAMERA_LOOK_AHEAD in front of the plane
    expect(pose.target.distanceTo(plane.position)).toBeCloseTo(CAMERA_LOOK_AHEAD, 3);
  });

  it("writes into the given pose vectors", () => {
    const plane = createPlaneState(worldAlien(SEED));
    const pose = makePose();
    const p = pose.position;
    const t = pose.target;
    const u = pose.up;
    stepCamera(pose, plane, SIM_DT, worldAlien(SEED));
    expect(pose.position).toBe(p);
    expect(pose.target).toBe(t);
    expect(pose.up).toBe(u);
  });
});

// --- 002 T007: WorldContext clearance + initial pose ---
import { initCameraPose } from "../../src/sim/camera";
import { themeById, type WorldContext } from "../../src/sim/themes";

const worldOf = (id: "nature" | "alien" | "arctic", seed: number): WorldContext => ({
  theme: themeById(id),
  seed,
});

describe("stepCamera with WorldContext", () => {
  it("stays above the surface clearance for every theme", () => {
    for (const id of ["nature", "alien", "arctic"] as const) {
      const world = worldOf(id, 42);
      const plane = createPlaneState(world);
      plane.position.y = surfaceHeightAt(plane.position.x, plane.position.z, world) + 1;
      const pose = makePose();
      pose.position.copy(plane.position);
      stepCamera(pose, plane, SIM_DT, world);
      expect(pose.position.y).toBeGreaterThanOrEqual(
        surfaceHeightAt(pose.position.x, pose.position.z, world) + CAMERA_MIN_CLEARANCE - 1e-9,
      );
    }
  });
});

describe("initCameraPose", () => {
  it("produces a valid converged pose without a full settle loop", () => {
    const world = worldOf("arctic", 42);
    const plane = createPlaneState(world);
    const pose = makePose();
    initCameraPose(pose, plane, world);
    desired.copy(offset).applyQuaternion(plane.orientation).add(plane.position);
    expect(pose.position.distanceTo(desired)).toBeLessThan(0.5);
    expect(pose.target.distanceTo(plane.position)).toBeCloseTo(CAMERA_LOOK_AHEAD, 3);
    // a subsequent short step (shorter than SIM_DT) keeps the pose finite and near-converged
    stepCamera(pose, plane, SIM_DT * 0.25, world);
    expect(Number.isFinite(pose.position.x)).toBe(true);
    expect(pose.position.distanceTo(desired)).toBeLessThan(50);
  });
});
