// Bootstrap: seed -> renderer -> fixed-step loop (R12) with prev/curr interpolation.
import { Matrix4, Mesh, PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderer } from "three";
import {
  CHUNK_SIZE,
  CHUNKS_PER_FRAME,
  HINT_TIMEOUT,
  MAX_DPR,
  MAX_SIM_STEPS_PER_FRAME,
  SIM_DT,
  VIEW_RINGS,
} from "./constants";
import { parseSeed, randomSeed } from "./sim/seed";
import {
  inputInactive,
  pinchToThrottle,
  pointerToSteer,
  touchDragToSteer,
  wheelToThrottle,
  type FlightInput,
} from "./sim/input";
import { createPlaneState, stepFlight, type PlaneState } from "./sim/flight";
import { createAutopilotState, stepAutopilot } from "./sim/autopilot";
import { stepCamera, type CameraPose } from "./sim/camera";
import { createChunkGrid, createCoordTable, type ChunkKey } from "./sim/chunks";
import { createPlaneMesh } from "./render/plane";
import { createSkyMesh, updateSkyMesh } from "./render/sky";
import { createTerrainMaterial } from "./render/terrainMaterial";
import { createChunkPool, fillChunk } from "./render/terrainMesh";

// --- Seed (FR-018) ---
const parsedSeed = parseSeed(location.search);
const seed = parsedSeed ?? randomSeed();
if (parsedSeed === undefined) {
  history.replaceState(null, "", `?seed=${seed}`);
}

// --- Renderer / scene ---
const canvas = document.getElementById("scene") as HTMLCanvasElement;
// Preserve the buffer only for the rendered smoke test; disabling it in production avoids
// forcing an extra retained framebuffer on every device.
const preserveDrawingBuffer = import.meta.env.DEV
  && new URLSearchParams(location.search).has("renderTest");
const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer });
renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_DPR));

const scene = new Scene();
// far plane covers the full view disc; fog is fully opaque well inside it (R9)
const camera = new PerspectiveCamera(60, 1, 0.1, CHUNK_SIZE * (VIEW_RINGS + 2));

const plane = createPlaneMesh();
scene.add(plane);

const sky = createSkyMesh();
scene.add(sky);

const terrainMaterial = createTerrainMaterial();
// camera.position is mutated in place by the pose lerp, so this reference stays current
terrainMaterial.uniforms.uCamPos.value = camera.position;
const planePosUniform = terrainMaterial.uniforms.uPlanePos.value as Vector2;
// view * projection for the water-plane depth projection in the terrain fragment shader
const viewProjUniform = terrainMaterial.uniforms.uViewProj.value as Matrix4;
const chunkGrid = createChunkGrid(VIEW_RINGS);
const chunkPool = createChunkPool();
const chunkMeshes = createCoordTable<Mesh>();
const freeMeshes: Mesh[] = [];
const toLoad: ChunkKey[] = [];
const toFree: ChunkKey[] = [];

function resize(): void {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  // recompute the steer vector at the new viewport for the last pointer position;
  // not a user event, so it must not count as fresh activity (T063). Skipped when the
  // pointer has left the window (input.active false) so a resize can't resurrect a
  // stale steering position.
  if (hasPointer && input.active) {
    pointerToSteer(lastPointerX, lastPointerY, innerWidth, innerHeight, input, simTime, false);
  }
}
addEventListener("resize", resize);

// --- Input state (preallocated; only the handlers below write it) ---
const input: FlightInput = { steerX: 0, steerY: 0, throttle: 0.5, active: false, lastInputTime: 0 };
let simTime = 0;
let inputSeen = false; // any steering/throttle event so far (hint + autopilot semantics)
let touchStartX = 0;
let touchStartY = 0;
let pinchDist = 0; // finger separation at the previous pinch event; 0 = not pinching
let hasPointer = false; // a pointer position has been seen at least once (T063)
let lastPointerX = 0;
let lastPointerY = 0;
// Throttle intents are buffered per frame: last device wins over others in the same frame
// (Edge Cases: wheel + pinch). Pinch ratios compose while no wheel event interleaves.
let pendingWheelDelta: number | null = null;
let pendingPinchScale = 1;
let hasPendingThrottle = false;

addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch") return; // touch steering comes from touch events
  hasPointer = true;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  pointerToSteer(e.clientX, e.clientY, innerWidth, innerHeight, input, simTime);
  inputSeen = true;
});
addEventListener("pointerleave", () => inputInactive(input));
addEventListener("pointercancel", () => inputInactive(input));
addEventListener("blur", () => inputInactive(input));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) inputInactive(input);
});

function pinchDistance(e: TouchEvent): number {
  const a = e.touches[0];
  const b = e.touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

addEventListener("touchstart", (e) => {
  if (e.touches.length === 1) {
    // new single-finger gesture: fresh drag origin, steering resets to zero at the origin
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    pinchDist = 0;
    touchDragToSteer(0, 0, input, simTime); // touch-down is activity even before a drag
    inputSeen = true;
  } else if (e.touches.length === 2) {
    pinchDist = pinchDistance(e);
    input.lastInputTime = simTime;
    inputSeen = true;
  }
});
addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length === 2) {
      // pinch throttles; steering is frozen while two fingers are down (Edge Cases)
      const d = pinchDistance(e);
      if (pinchDist > 0) {
        if (pendingWheelDelta !== null) {
          pendingWheelDelta = null;
          pendingPinchScale = 1;
        }
        pendingPinchScale *= d / pinchDist;
        hasPendingThrottle = true;
        inputSeen = true;
      }
      pinchDist = d;
      return;
    }
    if (e.touches.length !== 1) return;
    pinchDist = 0;
    const t = e.touches[0];
    const lt = input.lastInputTime;
    touchDragToSteer(t.clientX - touchStartX, t.clientY - touchStartY, input, simTime);
    if (input.lastInputTime !== lt) inputSeen = true;
  },
  { passive: true },
);
addEventListener("touchend", (e) => {
  if (e.touches.length === 1) {
    // one finger lifted: steering resumes from the remaining finger's new start point,
    // and the vector resets to zero there rather than retaining the prior drag (T059)
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    pinchDist = 0;
    touchDragToSteer(0, 0, input, simTime);
    return;
  }
  pinchDist = 0;
  inputInactive(input);
});
addEventListener("touchcancel", () => {
  pinchDist = 0;
  inputInactive(input);
});
addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    pendingWheelDelta = e.deltaY;
    pendingPinchScale = 1;
    hasPendingThrottle = true;
    inputSeen = true;
  },
  { passive: false },
);

// --- Hint (US5): fades on the first steer/throttle change or after HINT_TIMEOUT ---
const hintEl = document.getElementById("hint");
let hintHidden = false;

// --- Sim state ---
const curr: PlaneState = createPlaneState(seed);
const prev: PlaneState = createPlaneState(seed);
const autopilot = createAutopilotState();
const steerOut: FlightInput = {
  steerX: 0,
  steerY: 0,
  throttle: 0.5,
  active: false,
  lastInputTime: 0,
};
const pose: CameraPose = {
  position: new Vector3(),
  target: new Vector3(0, 0, 1),
  up: new Vector3(0, 1, 0),
};
const posePrev: CameraPose = {
  position: new Vector3(),
  target: new Vector3(0, 0, 1),
  up: new Vector3(0, 1, 0),
};

// First frame (T054): converge the camera onto the plane before the loop starts so an
// early rAF callback (elapsed < SIM_DT, zero sim steps) still renders the plane airborne
// and framed behind-and-above instead of a camera at the origin.
stepCamera(pose, curr, 1, seed);
posePrev.position.copy(pose.position);
posePrev.target.copy(pose.target);
posePrev.up.copy(pose.up);
plane.position.copy(curr.position);
plane.quaternion.copy(curr.orientation);

function stepSim(dt: number): void {
  prev.position.copy(curr.position);
  prev.orientation.copy(curr.orientation);
  posePrev.position.copy(pose.position);
  posePrev.target.copy(pose.target);
  posePrev.up.copy(pose.up);
  stepAutopilot(autopilot, input, simTime, dt, steerOut);
  stepFlight(curr, autopilot.engaged ? steerOut : input, dt, seed);
  stepCamera(pose, curr, dt, seed);
}

// --- Fixed-step loop (R12): accumulator, max steps then drop, prev/curr interpolation ---
let accumulator = 0;
let lastNow = performance.now();
const interpTarget = new Vector3();

function frame(now: number): void {
  let elapsed = (now - lastNow) / 1000;
  lastNow = now;
  if (elapsed > 0.25) elapsed = 0.25; // hidden-tab guard (Edge Cases)
  accumulator += elapsed;

  // apply the frame's winning throttle intent against the pre-frame throttle value
  if (hasPendingThrottle) {
    if (pendingWheelDelta !== null) wheelToThrottle(pendingWheelDelta, input, simTime);
    else pinchToThrottle(pendingPinchScale, input, simTime);
    pendingWheelDelta = null;
    pendingPinchScale = 1;
    hasPendingThrottle = false;
  }

  let steps = 0;
  while (accumulator >= SIM_DT && steps < MAX_SIM_STEPS_PER_FRAME) {
    stepSim(SIM_DT);
    simTime += SIM_DT;
    accumulator -= SIM_DT;
    steps += 1;
  }
  if (steps === MAX_SIM_STEPS_PER_FRAME && accumulator > 0) {
    // sustained low frame rate: take one variable step instead of dropping time (FR-008)
    stepSim(accumulator);
    simTime += accumulator;
    accumulator = 0;
  }

  if (!hintHidden && (inputSeen || simTime >= HINT_TIMEOUT)) {
    hintHidden = true;
    hintEl?.classList.add("hidden");
  }

  const alpha = accumulator / SIM_DT;
  plane.position.lerpVectors(prev.position, curr.position, alpha);
  plane.quaternion.copy(prev.orientation).slerp(curr.orientation, alpha);
  camera.position.lerpVectors(posePrev.position, pose.position, alpha);
  interpTarget.lerpVectors(posePrev.target, pose.target, alpha);
  camera.up.lerpVectors(posePrev.up, pose.up, alpha).normalize();
  camera.lookAt(interpTarget);
  // lookAt only sets the quaternion; the sky's inverse-view-projection needs the fresh
  // world matrix before updateSkyMesh consumes it (T064)
  camera.updateMatrixWorld();
  viewProjUniform.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

  // stream the chunk disc around the plane; fill at most CHUNKS_PER_FRAME new chunks
  chunkGrid.update(curr.position.x, curr.position.z, toLoad, toFree);
  for (let i = 0; i < toFree.length; i++) {
    const key = toFree[i];
    const mesh = chunkMeshes.get(key.cx, key.cz);
    if (!mesh) continue;
    chunkMeshes.delete(key.cx, key.cz);
    scene.remove(mesh);
    chunkPool.release(mesh.geometry);
    freeMeshes.push(mesh);
  }
  for (let i = 0; i < toLoad.length && i < CHUNKS_PER_FRAME; i++) {
    const key = toLoad[i];
    const existing = chunkMeshes.get(key.cx, key.cz);
    const geometry = chunkPool.acquire(key.lod);
    fillChunk(geometry, key, seed);
    if (existing) {
      // lod change: swap the geometry in place so terrain never disappears (T055)
      chunkPool.release(existing.geometry);
      existing.geometry = geometry;
    } else {
      const mesh = freeMeshes.pop() ?? new Mesh(geometry, terrainMaterial);
      mesh.geometry = geometry;
      mesh.position.set(key.cx * CHUNK_SIZE, 0, key.cz * CHUNK_SIZE);
      scene.add(mesh);
      chunkMeshes.set(key.cx, key.cz, mesh);
    }
    chunkGrid.markResident(key);
  }

  // chunk morph bands track the plane's position in world space (T056)
  planePosUniform.set(plane.position.x, plane.position.z);

  updateSkyMesh(sky, camera);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
resize(); // initial viewport fit (needs input/simTime/hasPointer initialised above)
requestAnimationFrame(frame);
