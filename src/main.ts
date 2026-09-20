// Bootstrap: seed -> renderer -> fixed-step loop (R12) with prev/curr interpolation.
// 002: all terrain/biome/surface sampling runs through WorldContext; world residency,
// streaming and preparation live in render/world.ts; theme uniforms stage atomically via
// applyThemeToMaterial/applyThemeToSky. The fresh-input gate is enforced at every event
// boundary; menus (Phase 3+) disarm it.
import { PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderer } from "three";
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
  inputGateArmed,
  inputInactive,
  passInputGate,
  pinchToThrottle,
  pointerToSteer,
  releaseInputGate,
  touchDragToSteer,
  wheelToThrottle,
  type FlightInput,
} from "./sim/input";
import { createPlaneState, stepFlight, type PlaneState } from "./sim/flight";
import { createAutopilotState, stepAutopilot } from "./sim/autopilot";
import { initCameraPose, stepCamera, type CameraPose } from "./sim/camera";
import { themeById, type WorldContext } from "./sim/themes";
import { createPlaneMesh } from "./render/plane";
import { applyThemeToSky, createSkyMesh, updateSkyMesh } from "./render/sky";
import { applyThemeToMaterial, createTerrainMaterial } from "./render/terrainMaterial";
import { createWorldRuntime } from "./render/world";

// --- Seed (FR-018) ---
const parsedSeed = parseSeed(location.search);
const seed = parsedSeed ?? randomSeed();
if (parsedSeed === undefined) {
  history.replaceState(null, "", `?seed=${seed}`);
}

// --- World context (002): boot flies the current (Alien) world until the chooser lands ---
const bootWorld: WorldContext = { theme: themeById("alien"), seed };

// --- Renderer / scene ---
const canvas = document.getElementById("scene") as HTMLCanvasElement;
// Preserve the buffer only for the rendered smoke test; disabling it in production avoids
// forcing an extra retained framebuffer on every device. The verification build enables the
// same hook via __VERIFY_HOOKS__ so the isolated bundle can read frames too.
const preserveDrawingBuffer = (import.meta.env.DEV || __VERIFY_HOOKS__)
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
// stage the whole Theme in one call so terrain, sky and fog change together (T016/T026)
applyThemeToMaterial(terrainMaterial, bootWorld.theme);
applyThemeToSky(sky, bootWorld.theme);

const world = createWorldRuntime(scene, terrainMaterial, bootWorld);

function resize(): void {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  // recompute the steer vector at the new viewport for the last pointer position;
  // not a user event, so it must not count as fresh activity (T063) and must not arm a
  // closed input gate. Skipped when the pointer has left the window (input.active false)
  // so a resize can't resurrect a stale steering position.
  if (hasPointer && input.active && inputGateArmed(input)) {
    pointerToSteer(lastPointerX, lastPointerY, innerWidth, innerHeight, input, simTime, false);
  }
}
addEventListener("resize", resize);

// --- Input state (preallocated; only the handlers below write it) ---
const input: FlightInput = {
  steerX: 0,
  steerY: 0,
  throttle: 0.5,
  active: false,
  lastInputTime: 0,
  gateArmed: true,
};
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
  // a drag (buttons held) is a held continuation; a plain hover is discrete
  if (passInputGate(input, e.buttons > 0 ? "held" : "discrete")) {
    pointerToSteer(e.clientX, e.clientY, innerWidth, innerHeight, input, simTime);
  }
  inputSeen = true;
});
addEventListener("pointerdown", () => {
  // a click is a discrete event; while the gate is closed it arms without steering
  passInputGate(input, "discrete");
});
addEventListener("pointerup", () => releaseInputGate(input));
addEventListener("pointerleave", () => {
  releaseInputGate(input);
  inputInactive(input);
});
addEventListener("pointercancel", () => {
  releaseInputGate(input);
  inputInactive(input);
});
addEventListener("blur", () => {
  releaseInputGate(input);
  inputInactive(input);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    releaseInputGate(input);
    inputInactive(input);
  }
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
    // touch-down is a discrete event — dropped while disarmed (arms the gate), applied
    // otherwise; either way it counts as activity even before a drag
    if (passInputGate(input, "discrete")) {
      touchDragToSteer(0, 0, input, simTime);
    }
    inputSeen = true;
  } else if (e.touches.length === 2) {
    if (passInputGate(input, "discrete")) {
      pinchDist = pinchDistance(e);
      input.lastInputTime = simTime;
    } else {
      pinchDist = 0;
    }
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
    // a drag is a held continuation: it must not arm a closed gate or steer through it
    if (passInputGate(input, "held")) {
      touchDragToSteer(t.clientX - touchStartX, t.clientY - touchStartY, input, simTime);
    }
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
    if (passInputGate(input, "discrete")) {
      touchDragToSteer(0, 0, input, simTime);
    }
    return;
  }
  pinchDist = 0;
  releaseInputGate(input); // all fingers up = a release: the next touch is fresh
  inputInactive(input);
});
addEventListener("touchcancel", () => {
  pinchDist = 0;
  releaseInputGate(input);
  inputInactive(input);
});
addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    // a wheel tick is discrete: while disarmed it arms the gate without applying throttle
    if (!passInputGate(input, "discrete")) {
      inputSeen = true;
      return;
    }
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
const curr: PlaneState = createPlaneState(bootWorld);
const prev: PlaneState = createPlaneState(bootWorld);
const autopilot = createAutopilotState();
const steerOut: FlightInput = {
  steerX: 0,
  steerY: 0,
  throttle: 0.5,
  active: false,
  lastInputTime: 0,
  gateArmed: true,
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
initCameraPose(pose, curr, bootWorld);
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
  stepFlight(curr, autopilot.engaged ? steerOut : input, dt, world.world);
  stepCamera(pose, curr, dt, world.world);
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

  // stream the chunk disc around the plane; fills are bounded per frame and defer on
  // pool misses instead of allocating (002 T015)
  world.update(curr.position.x, curr.position.z, CHUNKS_PER_FRAME);

  // chunk morph bands track the plane's position in world space (T056)
  planePosUniform.set(plane.position.x, plane.position.z);

  updateSkyMesh(sky, camera);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
resize(); // initial viewport fit (needs input/simTime/hasPointer initialised above)
requestAnimationFrame(frame);
