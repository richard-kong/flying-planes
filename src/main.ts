// Bootstrap: seed -> renderer -> fixed-step loop (R12) with prev/curr interpolation.
import { Mesh, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
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
import { chunkId, createChunkGrid, type ChunkKey } from "./sim/chunks";
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
const renderer = new WebGLRenderer({ canvas, antialias: true });
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
const chunkGrid = createChunkGrid(VIEW_RINGS);
const chunkPool = createChunkPool();
const chunkMeshes = new Map<number, Mesh>();
const freeMeshes: Mesh[] = [];
const toLoad: ChunkKey[] = [];
const toFree: ChunkKey[] = [];

function resize(): void {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// --- Input state (preallocated; only the handlers below write it) ---
const input: FlightInput = { steerX: 0, steerY: 0, throttle: 0.5, active: false, lastInputTime: 0 };
let simTime = 0;
let touchStartX = 0;
let touchStartY = 0;
let pinchDist = 0; // finger separation at the previous pinch event; 0 = not pinching

addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch") return; // touch steering comes from touch events
  pointerToSteer(e.clientX, e.clientY, innerWidth, innerHeight, input, simTime);
});
addEventListener("pointerleave", () => inputInactive(input));

function pinchDistance(e: TouchEvent): number {
  const a = e.touches[0];
  const b = e.touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  pinchDist = e.touches.length === 2 ? pinchDistance(e) : 0;
});
addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length === 2) {
      // pinch throttles; steering is frozen while two fingers are down (Edge Cases)
      const d = pinchDistance(e);
      if (pinchDist > 0) pinchToThrottle(d / pinchDist, input, simTime);
      pinchDist = d;
      return;
    }
    if (e.touches.length !== 1) return;
    pinchDist = 0;
    const t = e.touches[0];
    touchDragToSteer(t.clientX - touchStartX, t.clientY - touchStartY, input, simTime);
  },
  { passive: true },
);
addEventListener("touchend", (e) => {
  if (e.touches.length === 1) {
    // one finger lifted: steering resumes from the remaining finger's new start point
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    pinchDist = 0;
    return;
  }
  pinchDist = 0;
  inputInactive(input);
});
addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    wheelToThrottle(e.deltaY, input, simTime);
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
  let steps = 0;
  while (accumulator >= SIM_DT && steps < MAX_SIM_STEPS_PER_FRAME) {
    stepSim(SIM_DT);
    simTime += SIM_DT;
    accumulator -= SIM_DT;
    steps += 1;
  }
  if (steps === MAX_SIM_STEPS_PER_FRAME) accumulator = 0; // drop time

  if (!hintHidden && (input.lastInputTime > 0 || simTime >= HINT_TIMEOUT)) {
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

  // stream the chunk disc around the plane; fill at most CHUNKS_PER_FRAME new chunks
  chunkGrid.update(curr.position.x, curr.position.z, toLoad, toFree);
  for (const key of toFree) {
    const mesh = chunkMeshes.get(chunkId(key.cx, key.cz));
    if (!mesh) continue;
    chunkMeshes.delete(chunkId(key.cx, key.cz));
    scene.remove(mesh);
    chunkPool.release(mesh.geometry);
    freeMeshes.push(mesh);
  }
  for (let i = 0; i < toLoad.length && i < CHUNKS_PER_FRAME; i++) {
    const key = toLoad[i];
    const geometry = chunkPool.acquire(key.lod);
    fillChunk(geometry, key, seed);
    const mesh = freeMeshes.pop() ?? new Mesh(geometry, terrainMaterial);
    mesh.geometry = geometry;
    mesh.position.set(key.cx * CHUNK_SIZE, 0, key.cz * CHUNK_SIZE);
    scene.add(mesh);
    chunkMeshes.set(chunkId(key.cx, key.cz), mesh);
    chunkGrid.markResident(key);
  }

  updateSkyMesh(sky, camera);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
