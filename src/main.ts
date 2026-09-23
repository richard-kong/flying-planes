// Bootstrap: page Seed -> renderer -> session state machine -> fixed-step loop (R12) with
// prev/curr interpolation. 002 US1: boot renders a stationary Nature background while the
// three real-terrain preview cards decode; Fly runs a deadline-sliced PreparationJob under
// the opaque overlay and commits terrain/surface/sky/fog/pose atomically. Flight listeners
// live on the canvas and only apply while the session is flying; every menu boundary closes
// the fresh-input gate.
import { Box3, PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget, RGBAFormat, UnsignedByteType } from "three";
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
  disarmInputGate,
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
import { themeById, type ThemeId, type WorldContext } from "./sim/themes";
import {
  bootReady,
  copyAutopilot,
  copyCameraPose,
  copyPlaneState,
  createSession,
  openChooser,
  preparationFailed,
  preparationReady,
  pressCancel,
  pressFly,
  restoreFailed,
  restoreReady,
  selectAircraft,
  selectTheme,
  SNAPSHOT_MANIFEST_CAP,
  type ChooserState,
  type FlightSnapshot,
} from "./sim/session";
import {
  AIRCRAFT,
  aircraftById,
  stepSpin,
  type AircraftTypeId,
} from "./sim/aircraft";
import {
  applyThemeToLights,
  buildAircraft,
  createAircraftLights,
  type Aircraft,
} from "./render/aircraft";
import { applyThemeToSky, createSkyMesh, updateSkyMesh } from "./render/sky";
import { applyThemeToMaterial, createTerrainMaterial } from "./render/terrainMaterial";
import { createWorldRuntime, type PreparationJob } from "./render/world";
import {
  createPreviewSet,
  disposePreviewSet,
  PREVIEW_H,
  PREVIEW_W,
  previewCardKey,
  renderNextPreview,
  renderOverviewShot,
  retryFailedPreviews,
} from "./render/previews";
import { createChooser } from "./ui/chooser";

// --- Seed (FR-018): exactly one page Seed, parsed once ---
const parsedSeed = parseSeed(location.search);
const seed = parsedSeed ?? randomSeed();
if (parsedSeed === undefined) {
  history.replaceState(null, "", `?seed=${seed}`);
}

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

// All six Aircraft Types are built once at boot (allocation lives here, never per frame);
// `active` is the committed one, `plane` aliases its group so pose writes stay unchanged.
const aircraftByType = new Map<AircraftTypeId, Aircraft>();
for (const t of AIRCRAFT) {
  const a = buildAircraft(t);
  a.group.visible = false;
  scene.add(a.group);
  aircraftByType.set(t.id, a);
}
const aircraftLights = createAircraftLights();
scene.add(aircraftLights.hemi, aircraftLights.sun);
let active: Aircraft = aircraftByType.get("light") as Aircraft;
let plane = active.group;
active.group.visible = true;
let spinPhase = 0;

function switchAircraft(id: AircraftTypeId): void {
  const next = aircraftByType.get(id) as Aircraft;
  if (next === active) return;
  active.group.visible = false;
  active = next;
  plane = active.group;
  active.group.visible = true;
}

const sky = createSkyMesh();
scene.add(sky);

const terrainMaterial = createTerrainMaterial();
// camera.position is mutated in place by the pose lerp, so this reference stays current
terrainMaterial.uniforms.uCamPos.value = camera.position;
const planePosUniform = terrainMaterial.uniforms.uPlanePos.value as Vector2;

// --- Session + boot world (Nature stationary background, contract: booting -> choosing) ---
const session: ChooserState = createSession(seed);
// Verification builds may preselect the pending aircraft for soak/audit runs.
if (__VERIFY_HOOKS__) {
  const a = new URLSearchParams(location.search).get("aircraft") as AircraftTypeId | null;
  if (a) session.aircraftSelection = a;
}
const bootWorld: WorldContext = { theme: themeById("nature"), seed };
applyThemeToMaterial(terrainMaterial, bootWorld.theme);
applyThemeToSky(sky, bootWorld.theme);
applyThemeToLights(aircraftLights, bootWorld.theme);
const world = createWorldRuntime(scene, terrainMaterial, bootWorld);

// Preview card renders stage their theme on the SHARED terrain material; this puts the
// live world's uniforms back afterwards (the current world's theme, whatever it is).
const restoreLiveTheme = (): void =>
  applyThemeToMaterial(terrainMaterial, world.world.theme);

// --- Input state (preallocated; only the handlers below write it) ---
const input: FlightInput = {
  steerX: 0,
  steerY: 0,
  throttle: 0.5,
  active: false,
  lastInputTime: 0,
  gateArmed: false, // boot opens the chooser — flight input requires a fresh event
};
let simTime = 0;
let inputSeen = false;
let touchStartX = 0;
let touchStartY = 0;
let pinchDist = 0;
let hasPointer = false;
let lastPointerX = 0;
let lastPointerY = 0;
let pendingWheelDelta: number | null = null;
let pendingPinchScale = 1;
let hasPendingThrottle = false;

// --- Sim state (rebuilt wholesale on every Fly — fresh defaults, lifecycle rule 5) ---
let curr: PlaneState = createPlaneState(bootWorld);
let prev: PlaneState = createPlaneState(bootWorld);
const autopilot = createAutopilotState();
const steerOut: FlightInput = {
  steerX: 0,
  steerY: 0,
  throttle: 0.5,
  active: false,
  lastInputTime: 0,
  gateArmed: false,
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
initCameraPose(pose, curr, bootWorld);
posePrev.position.copy(pose.position);
posePrev.target.copy(pose.target);
posePrev.up.copy(pose.up);
plane.position.copy(curr.position);
plane.quaternion.copy(curr.orientation);

// Paused-flight snapshot (T045): one fixed record, rewired in place at every pause —
// allocated once, never holds GPU resources, and survives failed launches so a Cancel
// can still rebuild the paused world (T051: only a successful commit discards it).
function makeSnapshotStorage(): FlightSnapshot {
  const w = world.world;
  return {
    themeId: "nature",
    seed,
    plane: createPlaneState(w),
    prev: createPlaneState(w),
    pose: { position: new Vector3(), target: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0) },
    posePrev: { position: new Vector3(), target: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0) },
    simTime: 0,
    accumulator: 0,
    throttle: 0.5,
    lastInputTime: 0,
    inputActive: false,
    autopilot: { engaged: false, engagedAt: 0, lastSeenInputTime: -Infinity },
    inputSeen: false,
    hintHidden: false,
    hintOpacity: 1,
    aircraftType: "light",
    spinPhase: 0,
    chunkManifest: [],
  };
}
const snapshotData = makeSnapshotStorage();
let snapshot: FlightSnapshot | null = null;

function takeSnapshot(): FlightSnapshot {
  const s = snapshotData;
  copyPlaneState(s.plane, curr);
  copyPlaneState(s.prev, prev);
  copyCameraPose(s.pose, pose);
  copyCameraPose(s.posePrev, posePrev);
  copyAutopilot(s.autopilot, autopilot);
  s.simTime = simTime;
  s.accumulator = accumulator;
  s.throttle = input.throttle;
  s.lastInputTime = input.lastInputTime;
  s.inputActive = input.active;
  s.inputSeen = inputSeen;
  s.hintHidden = hintHidden;
  // freeze the hint fade exactly where it is; -1 when the element is gone/measureless
  s.hintOpacity = hintEl ? Number(getComputedStyle(hintEl).opacity) : 1;
  s.themeId = session.active ?? "nature";
  s.aircraftType = active.type;
  s.spinPhase = spinPhase;
  s.seed = session.seed;
  world.manifest(SNAPSHOT_MANIFEST_CAP, s.chunkManifest);
  return s;
}

function applySnapshot(s: FlightSnapshot): void {
  // swap the visible aircraft before pose copy — `plane` tracks the active group
  switchAircraft(s.aircraftType);
  spinPhase = s.spinPhase;
  copyPlaneState(curr, s.plane);
  copyPlaneState(prev, s.prev);
  copyCameraPose(pose, s.pose);
  copyCameraPose(posePrev, s.posePrev);
  copyAutopilot(autopilot, s.autopilot);
  plane.position.copy(curr.position);
  plane.quaternion.copy(curr.orientation);
  simTime = s.simTime;
  accumulator = s.accumulator;
  input.throttle = s.throttle;
  input.lastInputTime = s.lastInputTime;
  inputSeen = s.inputSeen;
  hintHidden = s.hintHidden;
  if (hintEl) {
    hintEl.classList.toggle("hidden", s.hintHidden);
    // resume the fade from the exact captured point, not a restarted transition
    hintEl.style.transition = "none";
    hintEl.style.opacity = String(s.hintOpacity);
    void hintEl.offsetHeight; // flush the pinned style before re-enabling the transition
    hintEl.style.transition = "";
    if (s.hintOpacity >= 0.999) hintEl.style.opacity = "";
  }
}

// --- Chooser DOM ---
const chooserEl = document.getElementById("chooser") as HTMLElement;
const prepOverlay = document.getElementById("prep-overlay") as HTMLElement;
const hintEl = document.getElementById("hint");
const changeThemeBtn = document.getElementById("change-theme") as HTMLButtonElement;
let hintHidden = false;

const chooser = createChooser({
  onSelect(id) {
    selectTheme(session, id);
    chooser.sync(session);
  },
  onSelectAircraft(id) {
    selectAircraft(session, id);
    chooser.sync(session);
  },
  onFly() {
    const req = pressFly(session);
    if (!req) return;
    launch(req.themeId, req.generation, req.kind, req.aircraftType);
  },
  onCancel() {
    cancelOrResume();
  },
  onRetry() {
    retryFailed();
  },
});

function syncChooser(): void {
  chooser.sync(session);
  chooserEl.dataset.phase = session.phase;
  document.body.dataset.phase = session.phase;
  changeThemeBtn.hidden = session.phase !== "flying";
}

// --- Launch / preparation / restore pipeline ---

let liveJob: PreparationJob | null = null;
const PREP_DEADLINE_MS = 7; // per-frame slice budget; leaves headroom inside a 60fps frame

function freshFlight(w: WorldContext): void {
  curr = createPlaneState(w);
  prev = createPlaneState(w);
  spinPhase = 0;
  initCameraPose(pose, curr, w);
  posePrev.position.copy(pose.position);
  posePrev.target.copy(pose.target);
  posePrev.up.copy(pose.up);
  plane.position.copy(curr.position);
  plane.quaternion.copy(curr.orientation);
  autopilot.engaged = false;
  autopilot.engagedAt = 0;
  autopilot.lastSeenInputTime = -Infinity;
  simTime = 0;
  inputSeen = false;
  input.steerX = 0;
  input.steerY = 0;
  input.active = false;
  input.throttle = 0.5;
  input.lastInputTime = 0; // new flight, new clock — a stale timestamp would skew Autopilot idle
  disarmInputGate(input); // first flight event after launch must be fresh (rule 10)
  hasPendingThrottle = false;
  pendingWheelDelta = null;
  pendingPinchScale = 1;
  hintHidden = false;
  hintEl?.classList.remove("hidden");
}

function launch(themeId: ThemeId, generation: number, kind: "startup" | "launch" | "restore", aircraftType: AircraftTypeId): void {
  const theme = themeById(themeId);
  const targetWorld: WorldContext = { theme, seed: session.seed };
  // stage a launch anchor from a probe plane state so coverage starts where the
  // commit will land the player (data-model: visible coverage + movement margin)
  const probe = createPlaneState(targetWorld);
  // releasing the old residency happens at Fly (rule 7): the boot background and any
  // paused world both return to the shared pools — candidates fill a private table
  world.reset();
  prepOverlay.hidden = false;
  prepOverlay.textContent = "";
  disarmInputGate(input);
  chooser.setStatus(`Preparing ${theme.name}…`);
  syncChooser(); // phase preparing: lock controls, stamp dataset, show live Cancel

  // a startup retry finishes failed preview work before terrain preparation begins
  const begin = () => {
    const job: PreparationJob = {
      generation,
      themeId,
      aircraftType,
      seed: session.seed,
      kind,
      phase: "terrain",
      deadline: PREP_DEADLINE_MS,
      readiness: 0,
      cancelled: false,
    };
    if (!world.beginPreparation(job, probe.position.x, probe.position.z, probe.heading)) {
      preparationFailed(session, generation, "a preparation is already running");
      chooser.sync(session);
      prepOverlay.hidden = true;
      return;
    }
    liveJob = job;
  };

  if (kind === "startup" && previewSet.cards.some((c) => c.status === "failed")) {
    void (async () => {
      try {
        await retryFailedPreviews(previewSet, renderer, terrainMaterial, previewTarget, restoreLiveTheme);
      } catch {
        // card-level failure is non-fatal for launch; retry stays available
      }
      for (const card of previewSet.cards) {
        chooser.setCardImage(previewCardKey(card), card.url, card.status === "failed");
      }
      begin();
    })();
  } else {
    begin();
  }
}

// --- Preview cards (T025-T027) ---
const previewTarget = new WebGLRenderTarget(PREVIEW_W, PREVIEW_H, {
  depthBuffer: true,
  stencilBuffer: false,
  samples: 0,
  type: UnsignedByteType,
  format: RGBAFormat,
  generateMipmaps: false,
});
const previewSet = createPreviewSet(aircraftByType);

let previewsStarted = false;
async function runPreviews(): Promise<void> {
  let rendered = 0;
  for (;;) {
    const card = previewSet.cards.find((c) => c.status === "pending");
    if (!card) break;
    try {
      await renderNextPreview(previewSet, renderer, terrainMaterial, previewTarget, restoreLiveTheme);
    } catch {
      // renderNextPreview marks the card failed itself; keep pumping
    }
    rendered += 1;
    chooser.setCardImage(previewCardKey(card), card.url, card.status === "failed");
    if (session.phase === "booting") {
      chooser.setStatus(`Rendering previews… ${rendered}/${previewSet.cards.length}`);
    }
    // keep the rAF loop alive between cards — never block boot on a card burst
    await new Promise((r) => requestAnimationFrame(r));
  }
  if (previewSet.done) {
    bootReady(session);
    chooser.setStatus("Choose a world, then press Fly.");
    document.body.dataset.readyChooser = "true";
  } else {
    bootReady(session); // chooser opens degraded; per-card retry offered in error text
    session.error = {
      kind: "startup",
      themeId: null,
      message: "one or more previews failed to render",
    };
    chooser.setStatus("Choose a world, then press Fly.");
  }
  syncChooser();
}

// --- Cancel / restore ---

function cancelOrResume(): void {
  const result = pressCancel(session);
  if (result === null) return;
  const snap = snapshot;
  if (!snap) {
    // defensive: contract never offers Cancel without a prior flight
    restoreFailed(session, session.generation, "no snapshot to restore");
    syncChooser();
    return;
  }
  // a Cancel discards queued gestures and requires fresh input in the restored world
  disarmInputGate(input);
  inputInactive(input);
  hasPendingThrottle = false;
  pendingWheelDelta = null;
  pendingPinchScale = 1;
  pinchDist = 0;
  if (result === "resume") {
    // prior terrain still resident: re-present the snapshot directly — no sim step runs
    // between restore and first painted frame
    applySnapshot(snap);
    restoreReady(session, session.generation);
    syncChooser(); // unhides Change theme before close() hands it focus
    chooser.close();
    prepOverlay.hidden = true;
    return;
  }
  // "restoring": invalidate the candidate job, rebuild the snapshot world
  if (liveJob) world.cancelPreparation(liveJob); // cancellation acknowledged synchronously
  liveJob = null;
  // free the committed residency too (the veil is opaque) so the snapshot manifest
  // provably fits the pools — every geometry in it came from them
  world.reset();
  prepOverlay.hidden = false;
  prepOverlay.textContent = "Restoring your flight…";
  chooser.setStatus("Restoring your flight…");
  const job: PreparationJob = {
    generation: session.generation,
    themeId: snap.themeId,
    aircraftType: snap.aircraftType,
    seed: session.seed,
    kind: "restore",
    phase: "terrain",
    deadline: PREP_DEADLINE_MS,
    readiness: 0,
    cancelled: false,
  };
  if (
    !world.beginPreparation(
      job,
      snap.plane.position.x,
      snap.plane.position.z,
      snap.plane.heading,
      snap.chunkManifest,
    )
  ) {
    restoreFailed(session, session.generation, "could not restart the restore");
    syncChooser();
    prepOverlay.hidden = true;
    return;
  }
  liveJob = job;
  syncChooser();
}

function retryFailed(): void {
  if (session.error?.kind === "startup") {
    void (async () => {
      try {
        await retryFailedPreviews(previewSet, renderer, terrainMaterial, previewTarget, restoreLiveTheme);
      } catch {
        /* per-card status already set */
      }
      for (const card of previewSet.cards) {
        chooser.setCardImage(previewCardKey(card), card.url, card.status === "failed");
      }
      if (previewSet.done) {
        session.error = null;
        chooser.setStatus("Choose a world, then press Fly.");
      }
      chooser.sync(session);
    })();
    return;
  }
  if (session.error?.kind === "restore") {
    cancelOrResume(); // restores again under the same snapshot
    return;
  }
  // launch failure: Fly again on the retained selection
  const req = pressFly(session);
  if (req) launch(req.themeId, req.generation, req.kind, req.aircraftType);
}

// --- Change theme: pause in place (T049) ---
changeThemeBtn.addEventListener("click", () => {
  if (!openChooser(session)) return;
  // terminate physical gestures at the boundary: a held pointer/drag/queued throttle must
  // not be half-applied in the paused world or half-resumed on Cancel (rule 9/T050)
  disarmInputGate(input);
  inputInactive(input);
  hasPendingThrottle = false;
  pendingWheelDelta = null;
  pendingPinchScale = 1;
  pinchDist = 0;
  snapshot = takeSnapshot(); // captures throttle/poses/autopilot/hint fade/manifest
  freezeHint();
  chooser.open();
  chooser.setStatus("Choose a world, then press Fly."); // footer shows last prep text otherwise
  syncChooser();
});

/** Pin the hint's computed opacity so the CSS fade does not advance while paused. */
function freezeHint(): void {
  if (!hintEl) return;
  const o = getComputedStyle(hintEl).opacity;
  hintEl.style.transition = "none";
  hintEl.style.opacity = o;
}

// --- Input: all flight listeners on the canvas, gated to the flying phase ---

function flightActive(): boolean {
  return session.phase === "flying";
}

function resize(): void {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  // remaps only an already-active flight pointer; never arms a closed gate (rule 10)
  if (flightActive() && hasPointer && input.active && inputGateArmed(input)) {
    pointerToSteer(lastPointerX, lastPointerY, innerWidth, innerHeight, input, simTime, false);
  }
}
addEventListener("resize", resize);

canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch" || !flightActive()) return;
  hasPointer = true;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  if (passInputGate(input, e.buttons > 0 ? "held" : "discrete")) {
    pointerToSteer(e.clientX, e.clientY, innerWidth, innerHeight, input, simTime);
  }
  inputSeen = true;
});
canvas.addEventListener("pointerdown", () => {
  passInputGate(input, "discrete");
});
canvas.addEventListener("pointerup", () => releaseInputGate(input));
canvas.addEventListener("pointerleave", () => {
  releaseInputGate(input);
  inputInactive(input);
});
canvas.addEventListener("pointercancel", () => {
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

canvas.addEventListener("touchstart", (e) => {
  if (!flightActive()) return;
  if (e.touches.length === 1) {
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    pinchDist = 0;
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
canvas.addEventListener(
  "touchmove",
  (e) => {
    if (!flightActive()) return;
    if (e.touches.length === 2) {
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
    if (passInputGate(input, "held")) {
      touchDragToSteer(t.clientX - touchStartX, t.clientY - touchStartY, input, simTime);
    }
    if (input.lastInputTime !== lt) inputSeen = true;
  },
  { passive: true },
);
canvas.addEventListener("touchend", (e) => {
  if (!flightActive()) return;
  if (e.touches.length === 1) {
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
  releaseInputGate(input);
  inputInactive(input);
});
canvas.addEventListener("touchcancel", () => {
  pinchDist = 0;
  releaseInputGate(input);
  inputInactive(input);
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (!flightActive()) return;
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

// --- Fixed-step loop (R12) ---
let accumulator = 0;
let lastNow = performance.now();
const interpTarget = new Vector3();
let firstFrameMarked = false;

// launch/restore verification injection (T029) — absent from the production bundle
declare global {
  var __verifyLaunch: ((themeId: ThemeId) => "fail" | { delay: number } | undefined) | undefined;
}
function verifyLaunchInject(themeId: ThemeId): "fail" | { delay: number } | undefined {
  if (!__VERIFY_HOOKS__) return undefined;
  return globalThis.__verifyLaunch?.(themeId);
}

// Verification build only: world counters + overview capture the browser suites and
// capture scripts use (T034/T039/T044).
if (__VERIFY_HOOKS__) {
  (globalThis as { __verifyStats?: () => unknown }).__verifyStats = () => ({
    residents: world.residentCount(),
    queued: world.queuedCount(),
    surfaces: world.surfaceCount(),
    generation: world.liveGeneration,
    sessionGen: session.generation,
    geo: renderer.info.memory.geometries,
    tex: renderer.info.memory.textures,
    progs: renderer.info.programs?.length ?? 0,
  });
  (globalThis as { __verifyState?: () => unknown }).__verifyState = () => ({
    x: curr.position.x,
    y: curr.position.y,
    z: curr.position.z,
    speed: curr.speed,
    heading: curr.heading,
    simTime,
    phase: session.phase,
  });
  (globalThis as { __verifyManifest?: () => string[] }).__verifyManifest = () =>
    world
      .manifest(4096, [])
      .map((k) => `${k.cx},${k.cz},${k.lod}`)
      .sort();
  (globalThis as { __verifyOverview?: (id: ThemeId, w: number, h: number) => Promise<string> })
    .__verifyOverview = (id, w, h) =>
    renderOverviewShot(renderer, terrainMaterial, id, w, h, restoreLiveTheme);
  (globalThis as { __verifyAircraft?: () => unknown }).__verifyAircraft = () => {
    const g = active.group;
    g.updateWorldMatrix(true, true);
    const bb = new Box3().setFromObject(g);
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (let i = 0; i < 8; i++) {
      verifyCorner.set(
        i & 1 ? bb.max.x : bb.min.x,
        i & 2 ? bb.max.y : bb.min.y,
        i & 4 ? bb.max.z : bb.min.z,
      );
      verifyCorner.project(camera);
      const sx = ((verifyCorner.x + 1) / 2) * innerWidth;
      const sy = ((1 - verifyCorner.y) / 2) * innerHeight;
      if (sx < left) left = sx;
      if (sx > right) right = sx;
      if (sy < top) top = sy;
      if (sy > bottom) bottom = sy;
    }
    return {
      type: active.type,
      visible: g.visible,
      spinPhase,
      box: { left, top, right, bottom },
    };
  };
}

const verifyCorner = new Vector3();

function frame(now: number): void {
  let elapsed = (now - lastNow) / 1000;
  lastNow = now;
  if (elapsed > 0.25) elapsed = 0.25;
  accumulator += elapsed;

  if (hasPendingThrottle && flightActive()) {
    if (pendingWheelDelta !== null) wheelToThrottle(pendingWheelDelta, input, simTime);
    else pinchToThrottle(pendingPinchScale, input, simTime);
    pendingWheelDelta = null;
    pendingPinchScale = 1;
    hasPendingThrottle = false;
  }

  // drive the live preparation/restore inside its deadline slice
  if (liveJob && (session.phase === "preparing" || session.phase === "restoring")) {
    const inject = verifyLaunchInject(liveJob.themeId);
    let failed: string | null = null;
    try {
      if (inject === "fail") throw new Error("verify: launch failed");
      world.stepPreparation(liveJob);
      if (inject && typeof inject === "object") liveJob.readiness = Math.min(1, liveJob.readiness);
    } catch (e) {
      failed = e instanceof Error ? e.message : String(e);
    }
    if (failed) {
      const job = liveJob;
      world.cancelPreparation(job);
      liveJob = null;
      prepOverlay.hidden = true;
      if (job.kind === "restore") restoreFailed(session, job.generation, failed);
      else preparationFailed(session, job.generation, failed);
      syncChooser();
      chooser.open();
    } else if (liveJob && liveJob.readiness >= 1) {
      const job = liveJob;
      // atomic commit: theme uniforms + candidate world + flight state in one step
      const theme = themeById(job.themeId);
      applyThemeToMaterial(terrainMaterial, theme);
      applyThemeToSky(sky, theme);
      applyThemeToLights(aircraftLights, theme);
      if (!world.commitPreparation(job)) {
        liveJob = null;
        prepOverlay.hidden = true;
        preparationFailed(session, job.generation, "preparation was superseded");
        syncChooser();
        chooser.open();
      } else {
        liveJob = null;
        if (job.kind === "restore" && snapshot) {
          applySnapshot(snapshot);
        } else {
          switchAircraft(job.aircraftType);
          freshFlight(world.world);
        }
        // T051: the paused snapshot dies only when a launch/restore lands atomically
        snapshot = null;
        accumulator = 0;
        lastNow = now;
        prepOverlay.hidden = true;
        if (job.kind === "restore") {
          restoreReady(session, job.generation);
        } else {
          preparationReady(session, job.generation);
        }
        syncChooser();
        chooser.close();
      }
    } else if (liveJob) {
      const progress = `${Math.floor(liveJob.readiness * 100)}%`;
      prepOverlay.textContent =
        liveJob.kind === "restore"
          ? `Restoring your flight… ${progress}`
          : `Preparing ${themeById(liveJob.themeId).name}… ${progress}`;
      chooser.setStatus(prepOverlay.textContent);
    }
  }

  if (flightActive()) {
    let steps = 0;
    while (accumulator >= SIM_DT && steps < MAX_SIM_STEPS_PER_FRAME) {
      stepSim(SIM_DT);
      spinPhase = stepSpin(spinPhase, SIM_DT);
      simTime += SIM_DT;
      accumulator -= SIM_DT;
      steps += 1;
    }
    if (steps === MAX_SIM_STEPS_PER_FRAME && accumulator > 0) {
      stepSim(accumulator);
      spinPhase = stepSpin(spinPhase, accumulator);
      simTime += accumulator;
      accumulator = 0;
    }
    if (!hintHidden && (inputSeen || simTime >= HINT_TIMEOUT)) {
      hintHidden = true;
      hintEl?.classList.add("hidden");
    }
  } else {
    accumulator = 0; // menu time never enters the simulation
  }

  const alpha = accumulator / SIM_DT;
  plane.position.lerpVectors(prev.position, curr.position, alpha);
  plane.quaternion.copy(prev.orientation).slerp(curr.orientation, alpha);
  camera.position.lerpVectors(posePrev.position, pose.position, alpha);
  interpTarget.lerpVectors(posePrev.target, pose.target, alpha);
  camera.up.lerpVectors(posePrev.up, pose.up, alpha).normalize();
  camera.lookAt(interpTarget);
  camera.updateMatrixWorld();

  if (session.phase !== "preparing" && session.phase !== "restoring") {
    // choosing keeps the paused world resident and streaming around its frozen pose
    world.update(curr.position.x, curr.position.z, CHUNKS_PER_FRAME);
  }

  // Spinner pivots read the shared phase — frozen whenever the fixed-step loop is paused
  const spinSpecs = aircraftById(active.type).spinners;
  for (let i = 0; i < active.spinners.length; i++) {
    active.spinners[i].rotation[spinSpecs[i].axis] = spinPhase * spinSpecs[i].rate;
  }

  planePosUniform.set(plane.position.x, plane.position.z);
  updateSkyMesh(sky, camera);
  renderer.render(scene, camera);
  if (!firstFrameMarked) {
    firstFrameMarked = true;
    document.body.dataset.firstFrame = "true";
  }
  requestAnimationFrame(frame);
}

addEventListener("pagehide", () => {
  // bounded teardown: resident/free geometry, preview cards and the shared target
  world.dispose();
  disposePreviewSet(previewSet);
  previewTarget.dispose();
  terrainMaterial.dispose();
  sky.geometry.dispose();
  (sky.material as { dispose(): void }).dispose();
  renderer.dispose();
});

// --- Boot: stationary Nature behind the chooser, previews decode sequentially ---
chooserEl.dataset.phase = session.phase;
document.body.dataset.phase = session.phase;
resize();
requestAnimationFrame(frame);
// first frame renders before previews start (separate first-frame vs ready-chooser marks)
requestAnimationFrame(() => {
  if (!previewsStarted) {
    previewsStarted = true;
    void runPreviews();
  }
  // sync before open() so disabled states (Fly during booting) are settled before focus
  syncChooser();
  chooser.open();
});
