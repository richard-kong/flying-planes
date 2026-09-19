# Tasks: First Flight

**Input**: Design documents from `/specs/001-first-flight/`

**Prerequisites**: plan.md, spec.md, research.md (R1-R12, constants table), data-model.md,
contracts/sim.ts, quickstart.md, `.specify/memory/constitution.md`

**Tests**: MANDATORY. Constitution III (strict TDD) applies to every `src/sim/*` module: the
test task for a module is written and seen to fail before the implementation task starts.
`src/render/*` and `src/main.ts` are covered only by `tests/render/smoke.test.ts` and the manual
quickstart checks.

**Organization**: Phases 1-2 build the shared skeleton and the sim primitives every story needs;
Phases 3-7 are one per user story in spec priority order (US1, US2 = P1; US3, US4 = P2; US5 = P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 steer, US2 landscape, US3 speed, US4 autopilot, US5 hint
- Every task names its exact file path(s)

## Path Conventions

Single Vite project at the repository root: `src/`, `src/sim/`, `src/render/`, `tests/sim/`,
`tests/render/`, `.github/workflows/`. `src/sim/**` may import only `three/src/math/*` and
`../constants` (research R7).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Runnable, typechecked, testable, CI-gated empty project.

- [ ] T001 Create `package.json` (name `flying-planes`, `"type": "module"`, `private: true`) with runtime dependency `three` and dev dependencies `typescript`, `vite`, `vitest`, `@types/three`; scripts `dev`, `build`, `preview`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `size` (`node scripts/size.mjs`); run `npm install` to produce `package-lock.json`
- [ ] T002 [P] Create `tsconfig.json` with `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `noEmit: true`, `include: ["src", "tests", "vite.config.ts", "vitest.config.ts"]`
- [ ] T003 [P] Create `vite.config.ts` (default root, `build.target: "es2022"`) and `vitest.config.ts` (`environment: "node"`, `include: ["tests/**/*.test.ts"]`)
- [ ] T004 [P] Create `index.html`: full-bleed `<canvas id="scene">`, one `<p id="hint">move to steer, scroll or pinch for speed</p>` overlay, inline CSS (`html,body{margin:0;height:100%;overflow:hidden}`, hint centred near the bottom, opacity transition), `<script type="module" src="/src/main.ts">`; no other DOM (FR-030)
- [ ] T005 [P] Create `scripts/size.mjs`: gzip every `dist/assets/*.js`, print the sum in KB, exit 1 above 600 KB (research R10, SC-004)
- [ ] T006 [P] Create `.github/workflows/ci.yml` on `pull_request` and `push` to `main`: `actions/setup-node` (Node 20), `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run size` (research R10)
- [ ] T007 [P] Create `src/constants.ts` exporting every value in the research.md "Starting constants" table (`CRUISE_SPEED 60`, `MIN_SPEED 35`, `MAX_SPEED 110`, `BAND_WIDTH 3600`, `TRANSITION_WIDTH 600`, `CHUNK_SIZE 256`, `VIEW_RINGS 16`, `LOD_RINGS [2, 7, 16]`, `LOD_RESOLUTIONS [64, 32, 16]`, `CHUNKS_PER_FRAME 2`, `POOL_PER_LOD [32, 240, 680]`, `SKIRT_DEPTH 30`, `SPECKLE_SIZE 24`, `WATER_LEVEL 120`, `MIN_ALTITUDE_ABOVE_TERRAIN 40`, `MAX_ROLL 45°`, `MAX_PITCH 30°` in radians, `LEVEL_OUT_TIME 2`, `TURN_RATE_PER_ROLL 0.9`, `MAX_ACCEL 20`, `IDLE_TO_AUTOPILOT 5`, `AUTOPILOT_BANK_AMPL 12°`, `AUTOPILOT_BANK_HZ 0.1`, `CAMERA_OFFSET (0, 18, -55)`, `CAMERA_SPRING 4`, `CAMERA_ROLL_FOLLOW 0.3`, `CAMERA_MIN_CLEARANCE 15`, `CAMERA_LOOK_AHEAD 60`, `SUN_ELEVATION 12°`, `SUN_AZIMUTH 60°`, `SIM_DT 1/120`, `MAX_SIM_STEPS_PER_FRAME 8`, `MAX_DPR 1.5`, `TOUCH_FULL_DEFLECTION_PX 160`, `THROTTLE_STEP 0.1`, `HINT_TIMEOUT 6`) plus the palette hexes from FR-022a/c/e/g as `Color`-ready numbers; plain `export const`, no objects allocated per access

**Checkpoint**: `npm run typecheck`, `npm test` (0 tests), `npm run build`, `npm run size` all pass locally and CI is green on an empty `src/main.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure sim primitives that every story depends on (Seed, noise, terrain height),
the purity guard, and the frame-loop skeleton. No story can be demonstrated without terrain
under the Plane.

- [ ] T008 [P] Write `tests/sim/purity.test.ts`: read every file under `src/sim/` and assert each `import` specifier is `three/src/math/...`, `../constants`, or a sibling `./x` module; assert no reference to `window`, `document`, `navigator`, `requestAnimationFrame`, or `src/render` (research R7). Must FAIL until `src/sim/` exists with at least one file.
- [ ] T009 [P] Write `tests/sim/seed.test.ts` against `contracts/sim.ts` `parseSeed`/`randomSeed`: `"?seed=42"` → 42; `"?seed=007"` → 7; missing, empty, `"?seed=abc"`, `"?seed=1.5"`, `"?seed=-3"`, `"?seed=4294967296"` → `undefined`; `"?seed=4294967295"` → 4294967295 (FR-018, Edge Cases); `randomSeed()` returns a uint32 integer and two calls differ
- [ ] T010 [P] Write `tests/sim/noise.test.ts` for `hash2`, `valueNoise`, `fbm`: outputs within documented ranges over 10k random samples; identical results for identical `(x, z, seed)` and different results for a different seed; `valueNoise` continuous (|Δ| small for Δx = 1e-3); `fbm` with 1 octave equals `valueNoise`
- [ ] T011 [P] Write `tests/sim/terrain.test.ts` for `heightAt`/`normalAt`: determinism (same args → bit-identical); different seed → different heights at the same point; height bounded within `[WATER_LEVEL - margin, ALPINE max]` over a 20 km × 20 km sample grid; `normalAt` is unit length and matches a central-difference gradient of `heightAt` within 1e-3; `normalAt` writes into `out` and returns the same object (zero-alloc contract) (FR-016, FR-017)
- [ ] T012 Implement `src/sim/seed.ts` (`parseSeed(query)`, `randomSeed()` via `Math.random` scaled to uint32) to make T009 pass
- [ ] T013 Implement `src/sim/noise.ts` (32-bit integer `hash2`, bilinear `valueNoise` with smoothstep interpolation, `fbm(x, z, seed, octaves, lacunarity, gain)`, and a small domain-warp helper used by terrain) to make T010 pass (research R6)
- [ ] T014 Implement `src/sim/terrain.ts`: `heightAt(x, z, seed)` = `biomeParamsAt(x, seed, scratch)` → domain-warped ridged `fbm` scaled by `amplitude`, offset by `heightOffset`, plus a fine-detail octave; `normalAt` by central differences into `out`; module-level scratch `BiomeParams` only. Until T030 lands, use a temporary `ALPINE`-only params stub inside `terrain.ts` so T011 passes (FR-016a fine detail is the high-frequency octaves)
- [ ] T015 Make T008 pass: fix any impure import surfaced by the purity test
- [ ] T016 Create `src/main.ts` bootstrap skeleton: read `location.search` → `parseSeed` or `randomSeed` + `history.replaceState` to write `?seed=` back (data-model Seed); create `WebGLRenderer` on `#scene` with `setPixelRatio(Math.min(devicePixelRatio, MAX_DPR))` (research R9); `Scene`, `PerspectiveCamera`; resize handler fitting the viewport (FR-029); fixed-step loop with accumulator (`SIM_DT`, max `MAX_SIM_STEPS_PER_FRAME` then drop time) and `prev/curr` interpolation slot (research R12, FR-008); the loop body must contain no object literals, closures, or array allocations. Steps are no-ops until Phase 3 wires them.

**Checkpoint**: `npm test` green (purity, seed, noise, terrain); page loads a blank renderer with a stable `?seed=` in the address bar.

---

## Phase 3: User Story 1 - Steer the Plane with the pointer (Priority: P1) 🎯 MVP

**Goal**: Airborne on load; pointer offset / touch drag banks, turns and pitches the Plane within the envelope; zero steer levels out; soft terrain floor; spring Chase Camera; minimal terrain under the Plane so there is something to fly over.

**Independent Test**: Load on desktop and phone; steer in all four directions and toward the ground (quickstart scenarios 1-3). Plane visible, responsive, never crashes.

### Tests for User Story 1 (write first, see them fail)

- [ ] T017 [P] [US1] Write `tests/sim/input.test.ts` for `pointerToSteer`, `touchDragToSteer`, `inputInactive`: pointer at centre → (0, 0); at right edge → x = 1; at top edge → y = -1 (screen-up = nose down, US1 scenario 3); values clamped to [-1, 1] beyond the viewport; touch drag of `TOUCH_FULL_DEFLECTION_PX` → 1 and clamped; `inputInactive` → steer (0, 0), `active = false`; each call sets `lastInputTime` only when steer changes; all write into `out` (FR-009, FR-010, FR-012)
- [ ] T018 [P] [US1] Write `tests/sim/flight.test.ts` for `createPlaneState`/`stepFlight`: start position `y >= heightAt + MIN_ALTITUDE_ABOVE_TERRAIN` and `speed = lerp(MIN, MAX, 0.5)` (FR-001); `steerX = 1` for 3 s → roll approaches `+MAX_ROLL` and heading increases monotonically (FR-003, FR-004); `steerY = ±1` → pitch clamped to `±MAX_PITCH`; from full roll with zero steer, `|roll| < 1°` within `LEVEL_OUT_TIME` (FR-005); full nose-down for 30 s of steps never yields `position.y < heightAt(x, z) + MIN_ALTITUDE_ABOVE_TERRAIN - 1e-6` and the vertical velocity is eased, not clamped (FR-006, SC-007); `speed` always in `[MIN_SPEED, MAX_SPEED]` and forward progress per step > 0 (FR-007); two runs with identical inputs give bit-identical state (R12); `stepFlight` never replaces `state.position`/`state.orientation` object identities (zero-alloc)
- [ ] T019 [P] [US1] Write `tests/sim/camera.test.ts` for `stepCamera`: after 5 s of steady flight the pose converges to `plane.position + orientation * CAMERA_OFFSET` within 0.5 m; during a step change of plane position the camera lags (distance to target decreases monotonically, never overshoots by > 10%) (FR-014); `pose.position.y >= heightAt(x, z) + CAMERA_MIN_CLEARANCE` when the Plane skims a ridge (FR-015); `up` tilts by `roll * CAMERA_ROLL_FOLLOW`; writes into `pose` vectors only
- [ ] T020 [P] [US1] Write `tests/render/smoke.test.ts` per research R11: build terrain material (T032), one pooled chunk geometry per LOD filled from `heightAt` (T034), sky mesh (T033) and plane mesh (T023), add to a `Scene`, `scene.updateMatrixWorld(true)`; assert no throw and non-empty `vertexShader`/`fragmentShader` strings. Initially imports fail (modules absent); it becomes fully green only at the end of Phase 4.

### Implementation for User Story 1

- [ ] T021 [US1] Implement `src/sim/input.ts` (`pointerToSteer`, `touchDragToSteer`, `inputInactive`; leave `wheelToThrottle`/`pinchToThrottle` as declared exports that throw "not implemented" until Phase 5) to make T017 pass
- [ ] T022 [US1] Implement `src/sim/flight.ts` (`createPlaneState`, `stepFlight`: roll/pitch rates toward `steer * MAX`, roll decay with `LEVEL_OUT_TIME`, heading rate `roll * TURN_RATE_PER_ROLL`, speed toward `lerp(MIN, MAX, throttle)`, forward integration, soft floor easing against `heightAt`, `orientation` rebuilt from heading/pitch/roll into the existing `Quaternion`; module-level scratch `Vector3`s) to make T018 pass
- [ ] T023 [P] [US1] Implement `src/render/plane.ts`: `createPlaneMesh()` returns a `Group` of three `BoxGeometry` meshes (fuselage, wing, tail) sharing one `MeshBasicMaterial` in a colour that reads against the sky (Assumptions: stylised, no assets)
- [ ] T024 [US1] Implement `src/sim/camera.ts` (`stepCamera`: exponential spring at `CAMERA_SPRING` toward the plane-local offset, look-ahead target, roll follow, terrain clearance clamp via `heightAt`) to make T019 pass
- [ ] T025 [US1] Wire `src/main.ts`: DOM listeners `pointermove`, `pointerleave` (→ `inputInactive`), `touchstart/touchmove/touchend` (single finger → `touchDragToSteer` from start point; `touchend` → `inputInactive`; second finger ignored for steering per Edge Cases) writing into one preallocated `FlightInput`; per fixed step call `stepFlight` then `stepCamera`; interpolate `prev/curr` PlaneState into the plane `Group` and `PerspectiveCamera` (`position`, `lookAt(target)`, `up`); add a single `DirectionalLight` placeholder until the terrain shader lands. Verify no allocations in the frame body by reading the code (quickstart manual check 3 is run in Phase 8).
- [ ] T026 [US1] Add a temporary flat ground `PlaneGeometry` (single colour) at `WATER_LEVEL` in `src/main.ts` so US1 is demonstrable before Phase 4; mark with `// removed in T035` and delete it there

**Checkpoint**: quickstart scenarios 1-3 pass over a flat placeholder ground; `npm test` green except `tests/render/smoke.test.ts` (pending Phase 4 modules).

---

## Phase 4: User Story 2 - Fly over endless alpine peaks and green foothills (Priority: P1)

**Goal**: Endless streamed terrain in Alpine/Foothills bands with blended transitions, Pastel Dawn sky/sun/fog, altitude palette, forest speckle, gold lakes, ring LOD with skirts, Seed determinism.

**Independent Test**: Fly straight for several minutes; terrain never runs out, Biomes alternate Alpine → Foothills → Alpine with gradual blend; reload with same `?seed=` shows identical start (quickstart scenarios 5-7).

### Tests for User Story 2 (write first, see them fail)

- [ ] T027 [P] [US2] Write `tests/sim/biome.test.ts` for `ALPINE`, `FOOTHILLS`, `bandWeight`, `biomeParamsAt`: constants match data-model table verbatim (`amplitude 1200/400`, `baseFrequency 1/1800 / 1/1100`, `ridgeSharpness 0.8/0.15`, `heightOffset +40/-60`, `snowHeight 700/450`, `forestTop/Bottom 520/220 and 380/140`, `rockSlope 0.75/0.85`, `fogDensity 1.0/0.8`); `bandWeight` is 0 at an Alpine band centre, 1 at the next Foothills centre, 0.5 at the boundary, monotonic across `TRANSITION_WIDTH`, constant outside it, period `2 * BAND_WIDTH`, phase changes with seed; `bandWeight(x, seed)` is independent of z by construction (function takes only x); `biomeParamsAt` at `w = 0` equals `ALPINE` field-by-field, at `w = 1` equals `FOOTHILLS`, at `w = 0.5` equals the mean; writes into `out` (FR-019, FR-020, FR-021, research R5)
- [ ] T028 [P] [US2] Write `tests/sim/chunks.test.ts` for `lodForRing`/`createChunkGrid`: `lodForRing` maps rings `0..2 → 0`, `3..7 → 1`, `8..16 → 2` per `LOD_RINGS`; first `update` at origin fills `toLoad` with every chunk whose centre is within `VIEW_RINGS` chunks (Euclidean, ≈804 entries, never the full 33×33 square) sorted nearest-first and `toFree` empty; after `markResident` of all, a second `update` at the same position yields empty lists; moving the Plane by one chunk in +x yields a `toLoad` set that is exactly the new disc minus the old and a `toFree` set that is exactly the old disc minus the new (equal sizes, all at the leading/trailing edge); LOD is by Chebyshev ring (`lodForRing`) even though residency is by Euclidean distance; chunks whose ring crosses an `LOD_RINGS` boundary appear in both lists with different `lod` (re-fill, not resize); `residentCount` tracks; lists are reused (caller-supplied, `length = 0` reset, no new arrays) (FR-016, FR-024, research R2)
- [ ] T029 [P] [US2] Extend `tests/sim/terrain.test.ts` (from T011): heights inside an Alpine band centre reach > 900 m somewhere in a 4 km sample while a Foothills centre never exceeds 450 m; the fraction of sampled points below `WATER_LEVEL` is larger in Foothills than Alpine (FR-022, FR-022f, lake frequency); across a Transition the maximum height sampled per 100 m slab changes monotonically (no jump) (FR-021)

### Implementation for User Story 2

- [ ] T030 [US2] Implement `src/sim/biome.ts` (`ALPINE`, `FOOTHILLS` frozen objects, `bandWeight` via smoothstep over `TRANSITION_WIDTH` on a seed-phased triangle wave with period `2 * BAND_WIDTH`, `biomeParamsAt` lerping every field into `out`) to make T027 pass; remove the temporary stub from `src/sim/terrain.ts` (T014) and import `biomeParamsAt` so T029 passes
- [ ] T031 [US2] Implement `src/sim/chunks.ts` (`lodForRing`, `createChunkGrid`: wanted set from Plane chunk coordinate and `VIEW_RINGS`, resident `Map<string, lod>` keyed `"cx,cz"` built once, diff into caller lists, nearest-first sort with a preallocated index array) to make T028 pass
- [ ] T032 [P] [US2] Implement `src/render/terrainMaterial.ts`: `createTerrainMaterial()` returning one `ShaderMaterial` with uniforms `sunDirection`, `waterLevel`, palette colours (FR-022e), fog colours (FR-022g), sun disc colours; per-vertex attributes `position`, `normal`, `biome` (`snowHeight`, `forestTop`, `forestBottom`, `rockSlope`, `fogDensity` packed as two `vec4`s); vertex stage flattens `y < waterLevel` to `waterLevel` and flags water (research R3); fragment stage: altitude/slope palette with smooth blends, forest speckle from a hashed `floor(worldPos.xz / SPECKLE_SIZE)` (FR-022d), sun-orientation shading warm/cool with soft contrast (FR-022b, FR-022g), gold lake colour with a Blinn-style specular lobe toward the sun and soft shoreline blend (FR-022c), lavender fog whose colour comes from the shared `skyGradient(dir)` GLSL string exported from `src/render/sky.ts` (research R4); no cast shadows
- [ ] T033 [P] [US2] Implement `src/render/sky.ts`: export `SKY_GRADIENT_GLSL` (peach horizon → soft pink → pale blue zenith, `SUN_DIRECTION` disc + halo, FR-022a/g) and `createSkyMesh()`: full-screen triangle pair, `depthWrite: false`, `depthTest: false`, `renderOrder = -1`, camera-inverse-projection uniform updated each frame (research R4)
- [ ] T034 [US2] Implement `src/render/terrainMesh.ts`: `createChunkPool()` preallocating `POOL_PER_LOD` `BufferGeometry` per LOD with `(res + 1 + 2)^2` vertices including a one-vertex skirt ring dropped by `SKIRT_DEPTH` (research R2); `fillChunk(geometry, key, seed)` writes positions from `heightAt`, normals from `normalAt`, `biome` attributes from `biomeParamsAt`, then `needsUpdate` on the attributes; `acquire(lod)`/`release(geometry)`; each chunk is one `Mesh` sharing the material from T032; no allocation after warm-up
- [ ] T035 [US2] Wire `src/main.ts`: create `ChunkGrid`, pool, sky mesh, terrain material; each frame after the sim steps call `grid.update(plane.x, plane.z, toLoad, toFree)`, release `toFree` meshes to the pool, fill at most `CHUNKS_PER_FRAME` from `toLoad` (nearest-first) and `markResident`; set `scene.background = null`, remove the placeholder ground and `DirectionalLight` from T025/T026; camera `far` covers `VIEW_RINGS * CHUNK_SIZE` and fog reaches full opacity at that distance so pop-in is hidden (FR-016a, SC-005)
- [ ] T036 [US2] Make `tests/render/smoke.test.ts` (T020) fully green: adjust module exports so material, pool fill for each LOD, sky and plane build in Node without `WebGLRenderer`

**Checkpoint**: US1 + US2 demonstrable; quickstart scenarios 5-7 pass; `npm test` fully green; `npm run size` under 600 KB.

---

## Phase 5: User Story 3 - Control speed (Priority: P2)

**Goal**: Wheel and pinch change Throttle between min and max smoothly; the Plane never stops or reverses.

**Independent Test**: Scroll up/down and pinch in/out; speed rises/falls between limits (quickstart scenario 4).

### Tests for User Story 3 (write first, see them fail)

- [ ] T037 [P] [US3] Extend `tests/sim/input.test.ts` (from T017) for `wheelToThrottle`/`pinchToThrottle`: wheel `deltaY < 0` raises throttle by `THROTTLE_STEP`, `> 0` lowers; clamped to [0, 1]; pinch `scaleDelta > 1` raises proportionally, `< 1` lowers; each changes `lastInputTime`; both write into `out` (FR-011)
- [ ] T038 [P] [US3] Extend `tests/sim/flight.test.ts` (from T018): throttle 1 → speed rises smoothly (bounded acceleration per step) to `MAX_SPEED`; throttle 0 → falls to `MIN_SPEED` and never below; speed changes are continuous (|Δspeed| per step ≤ `MAX_ACCEL * SIM_DT`) (FR-007, US3 scenarios 1-2)

### Implementation for User Story 3

- [ ] T039 [US3] Implement `wheelToThrottle` and `pinchToThrottle` in `src/sim/input.ts` (replacing the T021 throws) and bounded speed approach in `src/sim/flight.ts` to make T037/T038 pass
- [ ] T040 [US3] Wire `src/main.ts`: `wheel` listener (`passive: false`, `preventDefault`) → `wheelToThrottle`; two-finger `touchmove` → `pinchToThrottle` from finger-distance ratio, and while two fingers are down steering input is frozen; when one finger lifts, steering resumes from that finger's new start point (Edge Cases multi-touch); "last event wins" when wheel and pinch arrive in one frame

**Checkpoint**: quickstart scenario 4 passes on desktop and phone.

---

## Phase 6: User Story 4 - Watch it fly itself (Priority: P2)

**Goal**: After 5 s idle the Autopilot levels the Plane then gently banks; any input disengages within one frame; Autopilot obeys floor and speed limits.

**Independent Test**: Leave the page 10 s → level then gentle banking; move the mouse → immediate manual control (quickstart scenario 8, SC-008).

### Tests for User Story 4 (write first, see them fail)

- [ ] T041 [P] [US4] Write `tests/sim/autopilot.test.ts` for `stepAutopilot`: `engaged` false while `simTime - input.lastInputTime < IDLE_TO_AUTOPILOT` and `steerOut` untouched; at exactly `IDLE_TO_AUTOPILOT` it engages, records `engagedAt = simTime`, and drives `steerOut` to zero (level) until `simTime - engagedAt >= LEVEL_OUT_TIME`; then `steerOut.x = AUTOPILOT_BANK_AMPL/MAX_ROLL * sin(phase)` with `|steerOut.x| < 0.5` always (amplitude below half the roll limit, FR-026) and `steerOut.y = 0`; any `input.active`/`lastInputTime` change → `engaged = false` on that same step (FR-027, SC-008); phase advances at `AUTOPILOT_BANK_HZ`; integration test: 60 s of engaged autopilot through `stepFlight` never violates the floor or speed limits (FR-028)

### Implementation for User Story 4

- [ ] T042 [US4] Implement `src/sim/autopilot.ts` (`stepAutopilot` idle timer on sim time, level-out sub-phase, sine banking into `steerOut`) to make T041 pass
- [ ] T043 [US4] Wire `src/main.ts`: preallocate `AutopilotState` and a second `FlightInput` `steerOut`; each fixed step call `stepAutopilot(ap, input, simTime, SIM_DT, steerOut)` and feed `ap.engaged ? steerOut : input` to `stepFlight`; ensure the first pointer move after idle is reflected on the very next frame (SC-008)

**Checkpoint**: quickstart scenario 8 passes.

---

## Phase 7: User Story 5 - Learn the controls without a manual (Priority: P3)

**Goal**: One-line hint on load that fades on first steering input or after 6 s and never returns.

**Independent Test**: Load; see hint; move the mouse; see it fade (quickstart scenario 1).

### Implementation for User Story 5

- [ ] T044 [US5] Wire `src/main.ts`: on first non-zero Steer Vector or throttle change, or at `HINT_TIMEOUT` seconds of sim time, add class `hidden` to `#hint` once (CSS transition in `index.html` from T004); the hint is the only overlay (FR-030, US5 scenarios 1-2). No `src/sim` change, no test beyond the smoke test (render/DOM only).

**Checkpoint**: All five user stories independently demonstrable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verify budgets, tighten zero-alloc, close the loop with the constitution.

- [ ] T045 Run quickstart "Manual performance check" 1-5 in Chrome on the laptop reference and via remote debugging on the phone reference; record fps, allocation sampling result, first-frame time, and `npm run size` output in the implementing PR description (constitution II, research R8, SC-003, SC-001, SC-004)
- [ ] T046 Fix any steady-state allocation attributed to `src/sim/**`, `src/render/terrainMesh.ts` fill path, or the frame callback in `src/main.ts` found in T045 (module-level scratch objects, no closures in the loop)
- [ ] T047 [P] Tune `src/constants.ts` (`CAMERA_SPRING`, `AUTOPILOT_BANK_*`, palette thresholds, `SKIRT_DEPTH`, fog falloff) against quickstart scenarios 2, 6, 8 so the Pastel Dawn mood and "no popping or seams" (FR-016a, FR-022g, SC-005) hold; every change is a `constants.ts`-only edit
- [ ] T048 [P] Run a 1-hour `?seed=42` max-speed flight (SC-005) and a hidden-tab / resize / orientation pass (FR-008, FR-029, Edge Cases); fix any precision or refit defect found
- [ ] T049 [P] Update `CONTEXT.md` glossary if any new domain term was introduced in code (e.g. `ChunkGrid`, `BandWeight`), and confirm `docs/adr/0001` still describes the shipped stack
- [ ] T050 Run `/speckit-analyze` against spec.md, plan.md, tasks.md and resolve any inconsistency it reports before marking the feature done

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T002-T007 in parallel after T001
- **Foundational (Phase 2)**: depends on Phase 1; BLOCKS every story (nothing flies without `heightAt`)
- **US1 (Phase 3)** and **US2 (Phase 4)**: both P1; US1 first because US2's demo needs a Plane and camera to fly through it. `tests/render/smoke.test.ts` (T020) is written in Phase 3 but only fully green after T036.
- **US3 (Phase 5)**: depends on US1 (`input.ts`, `flight.ts` exist)
- **US4 (Phase 6)**: depends on US1 (`stepFlight`, `FlightInput`); independent of US2/US3
- **US5 (Phase 7)**: depends on US1 (first steer event) only
- **Polish (Phase 8)**: depends on all stories

### User Story Dependencies

- **US1**: after Phase 2; no story dependencies
- **US2**: after Phase 2; integrates with US1's `main.ts` loop but `biome.ts`, `chunks.ts`, `terrainMaterial.ts`, `sky.ts`, `terrainMesh.ts` and their tests can be built independently
- **US3**: after US1
- **US4**: after US1
- **US5**: after US1

### Within Each User Story

- Test tasks MUST be written and observed failing before their implementation task (constitution III)
- `src/sim` module → its test green → `main.ts` wiring
- Story complete (checkpoint) before moving to the next priority

### Parallel Opportunities

- Phase 1: T002-T007 (six files) in parallel after T001
- Phase 2: T008-T011 (four test files) in parallel; T012-T014 in parallel once their tests fail
- Phase 3: T017-T020 in parallel; T023 in parallel with T021/T022/T024
- Phase 4: T027-T029 in parallel; T032 and T033 in parallel with T030/T031
- Phase 5: T037 and T038 in parallel
- Phase 8: T047, T048, T049 in parallel
- Across stories: once US1 is done, US3, US4, US5 touch disjoint sim files and can proceed in parallel; their `main.ts` wiring tasks (T040, T043, T044) must be serialised

---

## Parallel Example: User Story 2

```bash
# Tests first, all together (each must fail before implementation):
Task: "T027 tests/sim/biome.test.ts"
Task: "T028 tests/sim/chunks.test.ts"
Task: "T029 extend tests/sim/terrain.test.ts"

# Then sim modules together:
Task: "T030 src/sim/biome.ts"
Task: "T031 src/sim/chunks.ts"

# Render modules in parallel with the sim modules (smoke-tested only):
Task: "T032 src/render/terrainMaterial.ts"
Task: "T033 src/render/sky.ts"
```

---

## Implementation Strategy

### MVP First (US1 over placeholder ground)

1. Phase 1 Setup → CI green on an empty app
2. Phase 2 Foundational → `heightAt` exists and is tested
3. Phase 3 US1 → a steerable Plane with soft floor and chase camera over a flat placeholder
4. **STOP and VALIDATE**: quickstart scenarios 1-3

### Incremental Delivery

1. Phase 4 US2 → real Alpine/Foothills terrain, sky, lakes; first "stunning" build; bundle check
2. Phase 5 US3 → throttle
3. Phase 6 US4 → autopilot (kiosk-ready)
4. Phase 7 US5 → hint
5. Phase 8 → measured budgets recorded, `/speckit-analyze`

### Suggested PR slicing

One PR per phase (Phases 1+2 may merge), each green on CI, so the constitution's "tests in the same PR as the mechanic, written first" is auditable from the commit order inside each PR.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task
- Every `src/sim` task cites the FR it satisfies; every test task cites what must fail first
- `main.ts` is touched by T016, T025, T026, T035, T040, T043, T044: serialise those
- Zero-alloc is a review criterion on every task touching the frame loop, not a separate task
- Avoid: adding a dependency other than `three` (constitution I), a keyboard handler (FR-013), any overlay beyond `#hint` (FR-030), or a City/buildings path (FR-023)
