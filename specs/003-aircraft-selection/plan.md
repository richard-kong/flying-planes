# Implementation Plan: Aircraft Selection

**Branch**: `devin/1790160938-aircraft-selection-plan` | **Date**: 2026-09-23
**Spec**: [spec.md](./spec.md)
**Input**: Planning interview, Lavish design review of 30 prototypes, `specs/003-aircraft-selection/spec.md`.
**Status**: Phase 1 design complete; six visual directions approved; runtime implementation pending.

## Summary

Replace the three-box plane with six procedurally built, Phong-shaded aircraft (Helicopter,
Light Plane, Fighter Jet, Passenger Jet, Biplane, Glider) that share the existing Flight Model,
Chase Camera, Autopilot and Soft Floor unchanged. The Theme Chooser becomes a Flight Chooser with
two labelled sections, World and Aircraft, one Fly/Cancel bar, and nine static cards rendered by
the existing preview pipeline. Aircraft choice is a second axis of the pure session state and of
the Flight Snapshot, together with a spinner phase so propellers and rotors freeze on pause and
resume without catch-up. All six `Group`s are built once at boot and toggled by visibility at
world commit/restore, so no new preparation phase exists.

The visual direction is fixed by the owner's review: **H3 Executive, L1 Classic trainer,
F5 Interceptor, P1 Narrow-body, B4 Sport, G2 Vintage**, at the current in-flight footprint, with
soft Phong shading. See [research §1](./research.md#1-visual-direction-per-aircraft-owner-lavish-review-of-30-candidates).

## Technical Context

| Concern | Decision |
|---|---|
| Language/version | TypeScript 5.x, `strict: true`, ES2022; npm, Node 20/22 as today. |
| Primary dependencies | Three.js 0.180.0 only at runtime. Vite, Vitest, Playwright 1.63.0 (dev, already present). **No additions.** |
| Storage | In-memory: six built aircraft groups, one pending/active aircraft id in session state, `aircraftType` + `spinPhase` in the single Flight Snapshot, nine cached preview Blob URLs. Nothing persisted. |
| Testing | Test-first Vitest/Node for session transitions and pure aircraft records; browser Vitest (Playwright/SwiftShader) for smoke, framing, spinner freeze/resume, chooser sections, card failure/retry; `npm run size` for payload. |
| Target platform | Evergreen desktop/mobile browsers with WebGL2; pointer, touch, keyboard menu navigation only. |
| Project type | Single static Vite application (unchanged). |
| Performance goals | 60 fps laptop iGPU / 30 fps phone with the heaviest aircraft (Passenger Jet); nine cards and interactive chooser within the existing 2 s startup budget; zero steady-state frame allocations. |
| Constraints | <= 600 KB gzipped JS; no binary assets; procedural geometry built at boot; aircraft swap never allocates in the frame loop; Flight Model signature untouched. |
| Scale/scope | Six aircraft × three Themes = 18 combinations; one fixed paint scheme each; static cards; no per-aircraft physics, sounds, cockpit or landing. |

## Constitution Check

### Before Phase 0 research

| Principle | Planning gate |
|---|---|
| I. Minimum code | Pass: one aircraft module with six builders sharing loft/wing/strut helpers (six concrete uses). No new runtime dependency. Study code and `plane.ts` are deleted by the implementing PR. |
| II. Performance | Pass for planning: geometry built at boot, spinners updated by writing a rotation scalar, aircraft swap is a `visible` flag. Budgets are measured, not assumed. |
| III. Test-first mechanics | Pass: session transitions (a core lifecycle mechanic) get failing tests first; Flight Model/Camera/Input untouched and their suites prove it. Geometry/materials are render code covered by smoke + browser scenarios, not unit tests. |
| IV. Procedural content | Pass: every shape and paint is code; preview cards render the live geometry into a target at runtime. |
| V. Input abstraction | Pass: the aircraft radios are menu events; no new path into the Flight Model. |

### After Phase 1 design

All gates still pass; no exception is requested. The pure `AircraftType` record keeps
`session.ts` free of Three.js. Lighting is two lights updated at commit, not per frame. Nine
256×144 card renders reuse one atlas target, pipelined with the six aircraft in one pass (002
preview contract, amended); the startup deadline slicer already exists.
Removal ledger is explicit in [research §10](./research.md#10-removal-ledger-for-the-implementation-pr).

**Implementation merge gates remain open:** green typecheck/tests/browser tests; measured size,
chooser-interactive time, allocation soak and owner-device fps for the Passenger Jet; visual
evidence for all 18 combinations per [quickstart](./quickstart.md).

## Architecture and implementation seams

### 1. Pure aircraft records (`src/sim/aircraft.ts`)

Six read-only `AircraftType` records ([contract](./contracts/aircraft.ts)): id, card name and
description, spinner specs (axis + constant rate), natural footprint. `DEFAULT_AIRCRAFT = "light"`,
`PLANE_FOOTPRINT = 7.68`, `footprintScale()`, `stepSpin()`. Headless tests assert order, default,
spinner presence (helicopter/light/biplane only) and the SC-002 footprint tolerance.

### 2. Session state and snapshot (`src/sim/session.ts`)

Add `aircraftSelection`/`activeAircraft` to `ChooserState`, `aircraftType` to
`PreparationRequest`, `aircraftType`/`spinPhase` to `FlightSnapshot`, and `selectAircraft()`.
Transition deltas are in [contracts/lifecycle-delta.md](./contracts/lifecycle-delta.md); every
existing guard and generation rule is unchanged. Tests extend `tests/sim/session.test.ts`.

### 3. Aircraft geometry, materials and lights (`src/render/aircraft.ts`)

Port the six picked builders from the study with the shared helpers (`loft`, `section`, `body`,
`wing`, `wingPair`, `fin`, `rod`, `wheel`, `propeller`, `rotor`, `tailRotor`, `nacelle`,
`windowRow`, `canopy`, `stripe`). `buildAircraft(type)` normalises to `PLANE_FOOTPRINT` excluding
rotor discs, centres the airframe, and returns `{ group, spinners }`. `createAircraftLights()` and
`applyThemeToLights()` provide a hemisphere + directional pair driven by Theme sky/sun values.
Materials are `MeshPhongMaterial` (body, accent, trim, metal, blade), `MeshPhongMaterial` with
transparency for glass, `MeshLambertMaterial` for rubber. Delete `src/render/plane.ts`.

### 4. Frame loop wiring (`src/main.ts`)

At boot: build six aircraft, add all to the scene hidden, add lights. Replace `plane` with the
active `Aircraft.group` reference; interpolation and `planePosUniform` code is unchanged. In the
fixed step while flying: `spinPhase = stepSpin(spinPhase, dt)`; before render write
`spinner.rotation[axis] = spinPhase * rate` per spinner (no allocation). At `preparationReady`:
show `aircraft[request.aircraftType]`, hide the previous, reset `spinPhase`, apply Theme lights.
At pause: copy `aircraftType` and `spinPhase` into the snapshot; at `resume`/`restoreReady`:
restore both. Rename the button label to "Change flight".

### 5. Previews (`src/render/previews.ts`)

`PreviewSet.cards` becomes `ThemeCard | AircraftCard` (nine cards). Aircraft cards render the
boot-built group with the aircraft lights and the Nature sky gradient using the study's
three-quarter framing (bounding-sphere fit, 30° FOV, direction (−0.6, 0.34, 0.72)) into the
shared target, then follow the existing readback/decode/retry/dispose path. `bootReady` waits for
all nine.

### 6. Chooser (`index.html`, `src/ui/chooser.ts`)

Add an `Aircraft` radiogroup section with six `.card` labels under the existing World section;
one scrolling panel, shared Fly/Cancel bar. `onSelectAircraft`, `setCardImage(key, …)`, sync of
both radio groups, shared busy/disable/Escape behaviour. Title becomes "Choose your flight".

## Dependency ordering for task generation

1. **Failing tests first**: aircraft records, session aircraft axis and snapshot fields, chooser
   sections and card keys (browser), spinner freeze/resume and framing scenarios (browser).
2. **Pure layer**: `src/sim/aircraft.ts`, `session.ts` deltas.
3. **Render layer**: `src/render/aircraft.ts` (six builders + lights), delete `plane.ts`, wire
   `main.ts` (visibility swap, spinners, snapshot fields, lights per Theme).
4. **Chooser and previews**: nine cards, two sections, "Change flight" label, retry/failure paths.
5. **Cleanup and evidence**: delete the study files, update `CONTEXT.md` (Aircraft Type, Flight
   Chooser, Spinner), run quickstart acceptance, record budgets in the PR Constitution Check.

## Traceability

| Obligation | Planned evidence |
|---|---|
| FR-001–005, SC-001 | Six builders from the approved picks; 18 combination captures; card recognisability walkthrough. |
| FR-006 | Spinner phase in snapshot; browser scenario: rotates in flight, frozen while chooser open, resumes at same angle. |
| FR-007 | Flight/camera/autopilot/input suites unchanged and green; no signature changes in `flight.ts`, `camera.ts`. |
| FR-008–012, SC-002/003 | Session tests for defaults and independence; footprint tolerance test; nine cards ready before `bootReady`. |
| FR-013–018, SC-004–006 | Session transition tests with aircraft axis; browser Fly/Cancel/restore/error/input-isolation scenarios. |
| FR-019–020, SC-007/008 | `npm run size`, soak allocation check, startup timing under the browser test, owner-device fps. |

## Project Structure

### Documentation (this feature)

```text
specs/003-aircraft-selection/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md                 # /speckit-tasks output, not created here
└── contracts/
    ├── aircraft.ts
    └── lifecycle-delta.md
```

### Implementation locations

```text
index.html                     # Aircraft radiogroup section, "Choose your flight", "Change flight"
src/main.ts                    # six groups, visibility swap, spinners, lights, snapshot fields
src/sim/aircraft.ts            # new: pure AircraftType records, footprint, stepSpin
src/sim/session.ts             # aircraft axis in state, request and snapshot
src/render/aircraft.ts         # new: six builders, shared helpers, lights (replaces plane.ts)
src/render/previews.ts         # ThemeCard | AircraftCard, nine cards
src/ui/chooser.ts              # two radio groups, onSelectAircraft, keyed setCardImage
CONTEXT.md                     # Aircraft Type, Flight Chooser, Spinner
tests/sim/aircraft.test.ts     # new
tests/sim/session.test.ts      # extended
tests/render/*.browser.test.ts # aircraft framing, spinner, chooser sections, card failure
removed: src/render/plane.ts, src/render/aircraft-prototype.ts, aircraft-prototype.html,
         scripts/capture-aircraft-prototypes.ts, scripts/build-aircraft-review.ts
```

**Structure decision**: keep the single-project layout. One pure records module (used by
session, previews and tests) and one render module (used by main and previews) are the only new
files; no registry, plugin system, worker, or per-aircraft class.

## Complexity Tracking

No constitutional violations. Building all six aircraft at boot (rather than on demand) is
deliberate: ~30 k triangles total is negligible, and it keeps Fly/Cancel free of geometry work and
the frame loop free of allocations.

## Planning completion checks

Research, data model, contracts and quickstart are present and linked. Constitution Check passed
before and after design. The planning PR carries the study source and the six approved capture
images; the study source is scheduled for deletion by the implementation PR.
