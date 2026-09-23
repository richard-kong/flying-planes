---
description: "Implementation tasks for Aircraft Selection"
---

# Tasks: Aircraft Selection

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [aircraft contract](./contracts/aircraft.ts),
[lifecycle delta](./contracts/lifecycle-delta.md), and [quickstart.md](./quickstart.md).

**Baseline**: `main` at `897e0f3` (PR #22 merged: spec, plan artifacts and the 30-candidate
visual study). Approved directions: H3 Executive, L1 Classic trainer, F5 Interceptor,
P1 Narrow-body, B4 Sport, G2 Vintage; current in-flight footprint; Phong shading.

**Tests**: Required by Constitution III for the session lifecycle and the pure aircraft records;
write and observe them failing before the implementation task that makes them pass. Geometry,
materials and lights are render code: covered by the real WebGL smoke and browser scenarios,
never by shader or draw-call unit tests. Every test task lists the behaviour it must fail on.

**Organization**: Setup, shared foundation, US1 (P1, believable Light Plane), US2 (P1, six
aircraft chooser), US3 (P2, Change flight / Cancel), then polish and acceptance. US1 is the MVP:
after Phase 3 the app ships a Phong-shaded Light Plane with a spinning propeller and no other
visible change.

## Format: `[ID] [P?] [Story] Description`

- Every task uses an unchecked box, a sequential ID, and exact repository-relative file paths.
- `[P]` permits parallel work only within the groups listed under Dependencies.
- `[US1]`, `[US2]`, `[US3]` identify story work; setup, foundation and polish tasks carry none.
- Captures and recordings belong on the implementing PR, never in the repository or bundle.

## Phase 1: Setup

**Purpose**: Establish the pure aircraft vocabulary and its headless test so every later task
has a stable `AircraftTypeId` to reference.

- [X] T001 Write the failing headless suite `tests/sim/aircraft.test.ts` asserting: `AIRCRAFT` has exactly six records in order `helicopter, light, fighter, airliner, biplane, glider`; ids and names are unique; `DEFAULT_AIRCRAFT === "light"`; `PLANE_FOOTPRINT === 8 * 0.64`; `footprintScale(t) * Math.max(t.footprint.length, t.footprint.span) === PLANE_FOOTPRINT` for every record (the helicopter's `span` is its rotor disc); the smaller footprint dimension after scaling is `>= 0.35 * PLANE_FOOTPRINT`; `spinners.length > 0` only for `helicopter` (`mainRotor` axis `y` + `tailRotor` axis `x`), `light` and `biplane` (`propeller` axis `z`), and every `rate > 0`; `stepSpin(p, dt) === p + dt` and stays finite after 10⁶ steps (wrap at `2π`). It must fail because `src/sim/aircraft.ts` does not exist.
- [X] T002 Create `src/sim/aircraft.ts` implementing `AircraftTypeId`, `SpinnerSpec`, `AircraftType`, `AIRCRAFT` (six records with card `name`/`description` copied from the study's H3/L1/F5/P1/B4/G2 entries in `src/render/aircraft-prototype.ts` and natural `footprint` metres measured from those builders), `DEFAULT_AIRCRAFT`, `PLANE_FOOTPRINT`, `aircraftById`, `footprintScale`, `stepSpin` (phase wraps modulo `2π`) per `specs/003-aircraft-selection/contracts/aircraft.ts`; no Three.js import. T001 passes.
- [X] T003 [P] Add domain terms **Aircraft Type**, **Flight Chooser** (replacing the Theme Chooser entry, noting the World and Aircraft sections) and **Spinner** (propeller/rotor pivot advanced by a shared phase that freezes on pause) to `CONTEXT.md`, keeping **Plane** as the entity name regardless of appearance.

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: Extend the pure session lifecycle with the aircraft axis and land the render module
with lights, so every story can build on the same state, snapshot and scene wiring.

- [X] T00- [ ] T004 Extend `tests/sim/session.test.ts` with failing cases from `specs/003-aircraft-selection/contracts/lifecycle-delta.md`: `createSession` yields `aircraftSelection === "light"` and `activeAircraft === null`; `selectAircraft` works only in `choosing` and never changes `selection`; `selectTheme` never changes `aircraftSelection`; `pressFly` returns `aircraftType` and bumps `generation` even when both selections equal the active pair; `preparationReady` commits `activeAircraft`; `preparationFailed` keeps the pending `aircraftSelection`; `openChooser`, `pressCancel` (both `resume` and `restoring`), `restoreReady` and `restoreFailed` reset `aircraftSelection` to `activeAircraft`. Also assert `FlightSnapshot` accepts `aircraftType` and `spinPhase` via a typed literal.
- [X] T00- [ ] T005 Implement the deltas in `src/sim/session.ts`: add `aircraftSelection: AircraftTypeId` and `activeAircraft: AircraftTypeId | null` to `ChooserState`, `aircraftType` to `PreparationRequest`, `aircraftType` and `spinPhase: number` to `FlightSnapshot`, and export `selectAircraft(s, id): boolean`; update `createSession`, `pressFly`, `preparationReady`, `openChooser`, `pressCancel`, `restoreReady` exactly as the delta table specifies. T004 passes; all existing session tests stay green.
- [X] T006 Create `src/render/aircraft.ts` by porting the shared helpers (`loft`, `section`, `body`, `airfoil`, `wing`, `wingPair`, `fin`, `rod`, `wheel`, `propeller`, `rotor`, `tailRotor`, `nacelle`, `windowRow`, `canopy`, `stripe`, `makeMaterials`) from `src/render/aircraft-prototype.ts` and only the six approved builders (H3, L1, F5, P1, B4, G2) keyed by `AircraftTypeId`; export `buildAircraft(type: AircraftType): Aircraft` returning `{ type, group, spinners }` where `group` is scaled by `footprintScale`, centred on the airframe box (objects tagged `userData.rotor` still render inside it), forward +Z / up +Y, and `spinners` are the pivot `Object3D`s in `AircraftType.spinners` order; export `disposeAircraft`, `createAircraftLights` (one `HemisphereLight`, one `DirectionalLight`) and `applyThemeToLights(lights, theme)` copying `theme.sky.zenith`/`horizon` into the hemisphere colours and `theme.sky.sunDirection`/`sunDisc` into the directional light. Materials: `MeshPhongMaterial` for body, accent, trim, metal, blade; transparent `MeshPhongMaterial` for glass; `MeshLambertMaterial` for rubber. Forbid any per-frame allocation inside this module.
- [X] T007 Extend `tests/render/webgl.browser.test.ts` so the real-frame smoke mounts all six `buildAircraft` groups plus `createAircraftLights` and renders one frame per aircraft without page errors, asserting each scaled group's world bounding-box dominant axis `max(x, z) ≈ PLANE_FOOTPRINT` within 2% (for the helicopter the rotor disc supplies that axis) and that the visible pixel count of the aircraft over a flat-colour background is non-zero for every type. Expected to fail until T006 exists.

## Phase 3: User Story 1 — Fly a believable aircraft (P1)

**Goal**: The default Flight shows the Phong-shaded L1 Light Plane with a spinning propeller,
lit per Theme, with the Flight Model, Chase Camera, Autopilot and Soft Floor untouched.

**Independent test**: `npm run test:browser` scenario flies Nature at `?seed=42`, asserts the
Light Plane occupies the same screen region as the previous box plane, the propeller pivot's
rotation advances between frames while flying, and `tests/sim/{flight,camera,autopilot,input}.test.ts`
are unchanged and green.

- [X] T008 [US1] Write failing browser scenarios in a new `tests/render/aircraft.browser.test.ts` using `launchChromium`, `gotoAndWaitChooser` and `flyTheme` from `tests/render/browser-helpers.ts`: (a) after Fly on Nature the page's `__verifyAircraft()` hook (added in T009) reports `type === "light"`, `visible === true` and a projected bounding box fully inside the viewport at 960×600 and 390×844; (b) sampling `__verifyAircraft().spinPhase` twice 500 ms apart while flying gives a strictly increasing value; (c) during Autopilot (no input for 6 s) it still increases.
- [X] T009 [US1] Wire aircraft into `src/main.ts`: at boot build all six via `buildAircraft(aircraftById(id))`, add every `group` to `scene` with `visible = false`, add the lights; replace `createPlaneMesh` usage with a `let active: Aircraft` reference whose `group` receives the existing position/quaternion interpolation and `planePosUniform` updates; add `let spinPhase = 0` advanced by `stepSpin(spinPhase, dt)` inside the fixed-step loop only while `session.phase === "flying"`, and before each render set `spinner.rotation[axis] = spinPhase * rate` for the active aircraft's spinners (no allocation); at `preparationReady` show `aircraft[request.aircraftType]`, hide the previous, reset `spinPhase = 0`, call `applyThemeToLights`; expose a `__VERIFY_HOOKS__`-gated `globalThis.__verifyAircraft()` returning `{ type, visible, spinPhase, box: projected screen bbox }`. Delete `src/render/plane.ts`. T008 (a)–(c) pass.
- [X] T010 [US1] Extend `scripts/alloc-audit.ts` and `scripts/soak-rendered.ts` to accept an `aircraft` argument (default `light`) passed through as `?aircraft=<id>` (read by `src/main.ts` only under `__VERIFY_HOOKS__` to preselect the card) so the steady-state allocation audit and rendered soak cover the spinner update and aircraft interpolation; run the audit for `light` and record zero steady-state allocations in the PR.

**Checkpoint**: MVP shippable — Light Plane only, spinner animating, no chooser change.

## Phase 4: User Story 2 — Choose from six aircraft before flying (P1)

**Goal**: The chooser gains an Aircraft section with six static cards rendered from the real
geometry; any of the 18 combinations flies with the chosen aircraft and Theme.

**Independent test**: From a fresh load, for each aircraft × Theme: select, Fly, assert
`__verifyAircraft().type` matches and the aircraft is framed; card `<img>` sources are non-empty
data/blob URLs for all nine cards before the chooser becomes interactive.

- [X] T011 [P] [US2] Write failing browser scenarios in `tests/render/previews.browser.test.ts`: the preview set has nine cards; six `img[data-aircraft-img]` elements get decoded URLs with natural size 256×144; the chooser is not interactive (`bootReady`) until all nine are ready; `__verifyPreview("airliner")` returning `{ kind: "fail" }` leaves the Passenger Jet card in its `preview unavailable` fallback with name and radio still usable and never shows another aircraft's picture, and Retry completes it.
- [X] T012 [P] [US2] Write failing browser scenarios in `tests/render/chooser.browser.test.ts`: two `role="radiogroup"` sections with `aria-label` `World` and `Aircraft`; six labelled aircraft radios each wrapped by a `label.card`; default checked `light`; selecting an aircraft radio leaves the Theme radio unchanged and starts no flight; all cards and the Fly/Cancel bar are reachable by scrolling at 390×844 portrait and 844×390 landscape; hit targets ≥ 44 CSS px; wheel/drag over aircraft cards followed by Fly leaves Throttle and steering at their defaults until fresh input.
- [X] T013 [P] [US2] Write the 18-combination failing scenario in `tests/render/aircraft.browser.test.ts`: for every `AircraftTypeId` × `ThemeId`, select both, Fly, wait for `flying`, assert `__verifyAircraft().type` and the active Theme match, the projected bbox is inside the viewport at 960×600, and there are no page errors; additionally assert reload resets to `nature` + `light`.
- [X] T014 [US2] Extend `src/render/previews.ts`: `PreviewCard` becomes `ThemeCard | AircraftCard` (`kind` discriminator per `data-model.md`), `createPreviewSet` lists three Theme cards then six aircraft cards, `renderNextPreview`/`retryFailedPreviews` dispatch on `kind`; add `renderAircraftCard` that renders the boot-built `Aircraft.group` (passed in via a new `aircraft: Record<AircraftTypeId, Aircraft>` parameter) with the aircraft lights and the Nature sky gradient into the shared 256×144 target using the study framing (bounding-sphere fit, `fov 30`, camera direction `(-0.6, 0.34, 0.72)`, lookAt `(0, 0.1, 0.2)`), restoring the group's `visible`/transform state afterwards; readback, Blob, decode, revoke and `__verifyPreview` injection reuse the Theme path.
- [X] T015 [US2] Update `index.html`: retitle the dialog "Choose your flight", wrap the existing cards in a `World` section, add an `Aircraft` `role="radiogroup"` section with six `label.card` entries (`input[name=aircraft][value=<id>]`, `img[data-aircraft-img=<id>]`, `span.img-fallback[data-aircraft-fallback=<id>]`, `.name`, `.desc`) in the order helicopter, light, fighter, airliner, biplane, glider with `light` checked; make `.chooser-panel` scroll with the Fly/Cancel bar sticky at the bottom; change `#change-theme` text to "Change flight" (id unchanged).
- [X] T016 [US2] Update `src/ui/chooser.ts`: add `onSelectAircraft(id)` to `ChooserCallbacks`, change `setCardImage` to accept `PreviewCardKey` (`{ kind: "theme" | "aircraft", id }`), collect the six aircraft radios/images/fallbacks, reflect `state.aircraftSelection` in `sync`, and apply the same busy disabling and Escape handling to both groups.
- [X] T017 [US2] Wire `src/main.ts`: pass the built aircraft map into the preview set, call `setCardImage` with keyed cards, route `onSelectAircraft` to `selectAircraft`, gate `bootReady` on all nine cards, and confirm the active aircraft swap at `preparationReady` uses `request.aircraftType`. T011–T013 pass.

**Checkpoint**: Six selectable aircraft, nine cards, 18 combinations flying.

## Phase 5: User Story 3 — Change a Flight or resume it unchanged (P2)

**Goal**: Change flight pauses spinners with everything else; Cancel restores the original
aircraft and spinner phase without catch-up; Fly with any change (or none) starts fresh.

**Independent test**: Fly the Biplane over Arctic, open Change flight during a bank, switch to
Glider + Nature, Cancel: same aircraft, pose and blade angle. Reopen, press Fly with no change:
fresh Flight. Force a launch failure: prior Biplane Flight still recoverable.

- [X] T018 [P] [US3] Write failing browser scenarios in `tests/render/switching.browser.test.ts`: (a) open Change flight mid-flight, record `__verifyAircraft().spinPhase`, wait 1 s, assert unchanged; change both radios; Cancel; assert `type` is the original and `spinPhase` equals the recorded value on the first frame after resume, then increases; (b) Fly with aircraft-only change starts a fresh Flight (spawn pose, hint visible, `type` updated); (c) Fly with no change also restarts; (d) `__verifyLaunch` failure injection followed by Cancel restores the original aircraft; (e) after a Fly whose preparation is cancelled mid-way, the abandoned launch never swaps the visible aircraft.
- [X] T019 [US3] Implement snapshot handling in `src/main.ts`: at `openChooser` copy `activeAircraft` into `snapshot.aircraftType` and the live `spinPhase` into `snapshot.spinPhase`; on `resume` and `restoreReady` set the visible aircraft from `snapshot.aircraftType` and `spinPhase = snapshot.spinPhase` before the first rendered frame; ensure the spinner rotation write happens only from the current `spinPhase` so paused time is never replayed; ensure an invalidated preparation generation cannot toggle visibility. T018 passes.
- [X] T020 [US3] Extend the existing hidden-tab scenario in `tests/render/switching.browser.test.ts` ("resize and a hidden tab preserve phase and selection") so backgrounding the tab for 2 s during flight and returning yields a `spinPhase` delta consistent with the fixed-step clamp used for movement (no catch-up), and that a hidden tab with the chooser open keeps both pending radios selected.

## Phase 6: Polish and acceptance

- [ ] T021 Delete the visual study: `src/render/aircraft-prototype.ts`, `aircraft-prototype.html`, `scripts/capture-aircraft-prototypes.ts`, `scripts/build-aircraft-review.ts`; remove `.lavish/` from `.gitignore`; update the "Design review record" section of `specs/003-aircraft-selection/quickstart.md` to state the files were removed and where the PR captures live.
- [ ] T022 [P] Run `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build`, `npm run size`; record the gzipped total (expect < 160 KB) and the chooser-interactive time with nine cards in the PR Constitution Check; run `npm run soak:rendered` for the Passenger Jet and Helicopter and record allocation results.
- [ ] T023 [P] Capture PR evidence per `specs/003-aircraft-selection/quickstart.md`: six card images, the 18 aircraft × Theme chase views at `?seed=42`, and one paused-vs-resumed spinner comparison; attach to the implementing PR (not the repository).
- [ ] T024 Owner acceptance: on the reference laptop and phone, run quickstart steps 1–9, record fps for the Passenger Jet over Nature, and confirm SC-001 recognisability of all six cards and in-flight views; file any tuning of paint or proportions as follow-up commits on the same PR.

## Dependencies

- Phase order: 1 → 2 → 3 → 4 → 5 → 6. T003 may run alongside T001–T002.
- Within Phase 2: T004 before T005; T006 before T007; T005 and T006 are independent.
- US1 (T008–T010) requires T005 and T006. T008 must fail before T009.
- US2 (T011–T017) requires US1 (`main.ts` wiring). T011–T013 are parallel and must fail before
  T014–T017; T014, T015, T016 are independent files, T017 integrates them.
- US3 (T018–T020) requires US2 (both radio groups exist). T018 must fail before T019.
- Phase 6: T021 first (it removes files the earlier tests never import), then T022–T024.

## Parallel execution examples

- Phase 2: one agent on T004→T005 (`src/sim/session.ts`), another on T006→T007 (`src/render/aircraft.ts`, `tests/render/webgl.browser.test.ts`).
- Phase 4: T011, T012, T013 written together; then T014 (`previews.ts`), T015 (`index.html`) and T016 (`chooser.ts`) in parallel; T017 last.
- Phase 6: T022 and T023 in parallel after T021.

## Implementation strategy

1. **MVP (Phases 1–3)**: ship the L1 Light Plane with Phong lighting and a spinning propeller;
   the chooser is untouched, so risk is confined to `main.ts` wiring and one render module.
2. **Increment 2 (Phase 4)**: add the aircraft section and nine cards; all 18 combinations fly.
3. **Increment 3 (Phase 5)**: snapshot fields and spinner freeze/resume; error-path scenarios.
4. **Release (Phase 6)**: delete the study, measure budgets, owner device acceptance.

Each increment leaves `main` shippable; no task changes `src/sim/flight.ts`, `src/sim/camera.ts`,
`src/sim/autopilot.ts` or `src/sim/input.ts`.
