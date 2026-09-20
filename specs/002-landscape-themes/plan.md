# Implementation Plan: Landscape Themes

**Branch**: `devin/1789904166-landscape-themes-plan` | **Date**: 2026-09-20
**Spec**: [spec.md](./spec.md)
**Input**: Confirmed planning interview and `specs/002-landscape-themes/spec.md`.
**Status**: Phase 1 design complete; runtime implementation and device acceptance pending.

## Summary

Add a startup Theme Chooser and complete Nature, Alien Planet, and Arctic presets to the existing
static flight app. Thread an immutable `WorldContext` through one shared terrain generator,
clearance logic, and render adapters. Preserve today's terrain and appearance as Alien Planet.
Nature changes relief and colours; Arctic adds smooth valley shaping and frozen surfaces.

One page Seed survives every switch. Fly always creates a fresh Flight; Change theme freezes the
current one. A logical snapshot supports Cancel even after the old terrain has been released
into one reusable pool. Generation tokens, cancellation acknowledgement, and a readiness gate
prevent stale work or mixed-Theme frames. Static cards render actual Theme terrain once at a
fixed Seed using the existing renderer.

The design includes the overlapping First Flight convergence fixes and an owner-run laptop/phone
benchmark guide. It does not implement the feature, generate tasks, or close existing backlog
items. Next workflow command: `/speckit-tasks`.

## Technical Context

| Concern | Decision |
|---|---|
| Language/version | TypeScript 5.9.3, `strict: true`, ES2022; npm and Node 20.19+ (CI uses Node 20), or 22.12+. |
| Primary dependencies | Locked Three.js 0.180.0 only at runtime; Vite 7.3.6 and Vitest 3.2.7 retained. |
| Storage | In-memory Theme records, one page Seed, one Flight snapshot, cached preview Blob URLs; no server, database, or remembered Theme. |
| Testing | Test-first Vitest/Node mechanics and lifecycle; one real WebGL smoke parameterised by Theme, plus browser interaction scenarios. Exact-pinned `playwright@1.63.0` is the sole proposed dev addition. |
| Target platform | Evergreen desktop/mobile browsers with WebGL2; mouse, touch, and keyboard menu navigation. |
| Project type | Single static Vite application; existing GitHub Pages build/base-path behaviour retained. |
| Performance goals | 60 fps integrated-GPU laptop; 30 fps mid-tier phone; first Nature frame and complete usable chooser within 2 s over simulated 4G; Fly and Cancel restoration within 2 s. |
| Constraints | ≤600 KB gzipped JS, no binary assets, no runtime dependencies beyond Three.js, no steady-state frame-loop allocations, bounded streaming residency. |
| Scale/scope | Three fixed Themes, one plane, one active Flight, at most one paused snapshot and one preparation operation. Night and other new flight mechanics remain excluded. |

Theme values are calibrated during implementation against deterministic fixtures and the visual
matrix in [quickstart.md](./quickstart.md). This is tuning within the agreed design, not an
unresolved choice of architecture or scope.

## Constitution Check

### Before Phase 0 research

| Principle | Planning gate |
|---|---|
| I. Minimum code | Pass: one generator and no new runtime dependency. Three Themes supply a concrete use for the parameter seam; startup, launch, and restoration share preparation. |
| II. Performance | Pass for planning: budgets unchanged. Existing allocation, startup, and continuity gaps are dependencies below, not claims of compliance. |
| III. Test-first mechanics | Pass: capture baseline fixtures and failing tests before changing terrain, input, streaming, clearance, or lifecycle. Replace the construction-only render test with real WebGL smoke. |
| IV. Procedural content | Pass: terrain and previews generated from Seed and Theme parameters; no shipped images, models, or textures. |
| V. Input abstraction | Pass: flight consumes the same Steer Vector and Throttle. Menu events are isolated; keyboard never controls flight. |

### After Phase 1 design

All design gates still pass, with no requested constitutional exception. The interfaces keep
simulation free of DOM/WebGL/scene objects and preserve existing math types. Shared pool reuse
and row-sliced preparation avoid two simultaneous full worlds. Preview readback, cancellation,
and teardown have explicit ownership rules. Playwright is a justified development-only browser
driver used by Vitest; its justification must appear in the implementing PR.

**Implementation merge gates remain open:** passing headless and browser checks; measured payload,
startup, launch, restore, allocations, and reference-device frame rates; visual identity and
continuity evidence. Software-rendered VM results cannot establish device performance. Any
failed budget must be fixed or escalated, never silently weakened. This documentation PR changes
no runtime or toolchain and removes no runtime code. Domain terms already exist in `CONTEXT.md`;
implementation updates it where interfaces or definitions change.

## Architecture and implementation seams

### 1. Pure world sampling

`src/sim/themes.ts` defines the three read-only records and `WorldContext { theme, seed }`.
See [type contract](./contracts/themes.ts) and [data model](./data-model.md).
`biomeParamsAt`, `heightAt`, `normalAt`, `createPlaneState`, `stepFlight`, and `stepCamera`
replace their seed argument with that context. `stepFlight` retains its existing `FlightInput`.
`surfaceHeightAt = max(heightAt, theme.surface.level)` serves both plane and camera clearance.
`parseSeed`, `randomSeed`, the band layout, and the input abstraction retain their interfaces.

Keep Alien's noise seeds, arithmetic order, band interpolation, warp, and detail identical.
Record golden fixtures before the refactor at positive/negative coordinates, region transitions,
and shores. Move current palette/sky/fog/light values into Alien without changing conversion or
rounding. Nature uses gentler terrain parameters. Arctic uses the continuous valley transform
described in the data model, reduced detail, snowy/icy palettes, and zero forest contribution.
The shared path must produce all three, not dispatch to three terrain generators.

### 2. Streaming and world preparation

Keep allocation-bounded residency metadata in `src/sim/chunks.ts`; place mesh/pool ownership and
preparation in `src/render/world.ts`. This module gives startup, launch, and restoration the same
small interface instead of putting three variants of streaming in `main.ts`.

Preallocate tagged slots, meshes, replacement spares, geometry buffers, and bounded work queues
outside active flight. A pool miss defers; it never calls `new Mesh`, grows a map, or expands
geometry while flying. Keep the resident LOD until its replacement is ready. Morph fine heights
and normals to the coarse triangulation, including shared edges, before exchange. Clip shore
triangles to the surface plane using bounded buffers so ice and water remain flat through mixed
land/surface triangles. Recalculate pool capacity for those attributes and worst-case topology.

The current 797-chunk disc takes at least 399 frames at two fills/frame. Startup therefore cannot
wait for that queue unchanged. Prepare visible camera coverage and a movement margin in bounded
row slices; keep the intended fog and view distances. Fill unseen peripheral chunks afterwards.
Readiness includes upload/shader readiness, plane framing, and matching sky and surfaces, not just
finished CPU buffers. Initialise previous/current plane and camera poses before any render and
synchronise the camera world matrix before sky uniforms.

### 3. Flight lifecycle and chooser

`src/sim/session.ts` owns headless transition guards, snapshot capture/restore, and the preparation
generation. `src/ui/chooser.ts` is a DOM adapter for those events and statuses; `main.ts` retains
the fixed-step loop and application wiring. The [lifecycle contract](./contracts/lifecycle.md)
is the authoritative transition table.

Opening Change theme freezes simulation, interpolation, hint fade, and terrain morph progress.
Browsing retains the paused world. Fly releases its residency, reuses the same buffers under an
opaque overlay, and commits a fresh Flight atomically. Cancel before release resumes directly;
after release it restores the saved region and interpolation state first. Invalidate and
acknowledge the candidate job before reusing buffers. Rejected/stale jobs cannot alter state or
dispose resources belonging to the next generation. Keep the snapshot until launch or restoration
success; errors retain the appropriate retry target.

Clear physical gestures and pending throttle intents on both sides of the chooser. Restore
Throttle, speed, attitude, Autopilot history, simulation time, and hint state on Cancel; clear only
steering intent until fresh input. Preserve the saved first visible frame before another step,
reset `lastNow`, and never replay time spent paused. Activity tracking must detect time-zero
steering, touch activation, and clamped throttle independently of value changes. Resize remaps
already-active input without inventing activity or bypassing the fresh-input gate.

Use native labelled radio controls and buttons in a modal dialog, visible focus, busy/error
announcements, and scrolling phone layouts. Menu pointer/wheel/touch handlers never feed the
flight mappers. Keep Change theme away from the central flight view. No UI framework is needed.

### 4. Theme rendering and static previews

Parameterise the existing shared terrain/surface material and shared sky-gradient GLSL with
uniforms; keep one flight material set and one renderer. Terrain fog and sky consume identical
Theme gradient and sun values. Keep the existing Alien colour response; colour-space cleanup
is not part of this feature.

`src/render/previews.ts` reuses the Theme sampling/material functions, three representative camera
poses, and one fixed preview Seed. Render sequentially to one 256×144 RGBA8 target. Restore all
renderer/camera/uniform state before yielding; readback, row flip, Blob conversion, and image
decode produce cached object URLs. Dispose temporary geometry/materials/target after readback;
revoke URLs when discarded. Successful cards never regenerate on selection or reopening.
Failed readback/Blob/decode exposes retry and cannot count as complete startup.

Render stationary Nature early. Finish all three previews and the usable chooser within the
same two-second navigation budget. Preview and world preparation share bounded scheduling;
they must not create competing rendering jobs or advance the simulation.

## Dependency ordering for task generation

These are design stages, not `tasks.md` or completion checkboxes.

1. **Establish regressions and browser smoke.** Preserve Alien fixtures; add failing coverage for
   pure Theme seams, startup poses, bounded residency, replacement coverage, shoreline topology,
   and activity/gesture lifecycle. Use the real browser smoke before relying on new shaders.
2. **Shared terrain and render foundation.** Parameterise the generator and clearance, add Nature
   and Arctic records, then bounded preparation, LOD morphing, planar surfaces, and sky sync.
3. **Lifecycle and input isolation.** Write failing transition/snapshot tests with controlled
   completions; wire startup, restart, pause, Cancel, restoration, retries, and fresh-input gates.
4. **Chooser and previews.** Connect the native controls and once-per-visit actual-terrain cards.
   Exercise accessibility, orientation, state restoration, and preview cleanup.
5. **Acceptance evidence.** Run the quickstart checks, all directed switches and same-Theme
   restarts, 50-switch resource checks, real-device benchmarks, and the outstanding rendered soak.
   Record evidence before closing any matching First Flight task.

## Traceability and First Flight backlog

| Obligation | Planned evidence / dependency |
|---|---|
| FR-001–005, FR-023; SC-001/002/007 | Initial Nature chooser, three actual-terrain cards, accessible controls, selection-only behaviour, launch timings. |
| FR-006–011; SC-003/005 | Preset invariants, preserved Alien fixtures, Theme/Seed determinism, distinct landforms, surface masks and visual review. |
| FR-012/016/017/021 | Theme-aware clearance, pose initialisation, default input, fresh-flight reset, preserved Cancel state, hint lifecycle. |
| FR-013–020; SC-004/007 | Headless state/race tests and browser launch/cancel/restore/error/hidden-tab scenarios. |
| FR-022/024; SC-006 | Minimal flight UI, bundle/allocations, five-minute Flights, repeated switching and owner benchmarks. |
| 001 T051/052/054 | Required here: bounded ownership, actual WebGL smoke, initialised opening presentation. |
| 001 T055–059 | Required here: retain replacement coverage, smooth LODs, planar shores, fresh activity and complete gesture lifecycle. |
| 001 T062–064 | Required here: time-zero hint, resize input mapping compatible with menu gating, synchronised sky camera. |
| 001 T060/061 | Keep open until owner/device and rendered-soak evidence exists; expanded by this guide, not replaced by CI. |
| 001 T053/065 | Remain separately tracked: pitch/quaternion orientation correction and legacy artifact cleanup. |

Full rationale is in [research §12](./research.md#12-disposition-of-first-flight-convergence-tasks).
No 001 task is marked complete by this plan. The deferred orientation defect remains a known
First Flight limitation; record it separately during visual review rather than claiming all
prior obligations have converged.

## Project Structure

### Documentation (this feature)

```text
specs/002-landscape-themes/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── themes.ts
    └── lifecycle.md
```

`tasks.md` is intentionally absent until `/speckit-tasks`.

### Proposed implementation locations

```text
index.html                      # chooser markup/layout and hint presentation
src/main.ts                     # lifecycle, input and fixed-step/render wiring
src/constants.ts                # retain flight/streaming constants; move Theme-owned values
src/sim/themes.ts               # new: three records and WorldContext
src/sim/session.ts              # new: pure transitions and snapshot rules
src/sim/{biome,terrain,flight,camera,chunks,input,autopilot}.ts
src/render/world.ts            # new: preparation and mesh/pool ownership
src/render/previews.ts         # new: static cards and temporary-resource ownership
src/render/{terrainMesh,terrainMaterial,sky}.ts
src/ui/chooser.ts              # new: DOM adapter
tests/sim/                     # existing suites plus Theme/session regressions
tests/render/                  # genuine smoke and browser interaction suite
scripts/                       # isolated browser/soak drivers
vitest.config.ts               # preserve default Node tests; exclude browser suite
vitest.browser.config.ts       # new: serial Vitest suite using Playwright library
.github/workflows/ci.yml        # browser smoke alongside current checks
```

**Structure decision**: Keep the existing single-project layout. Theme records are a pure seam
used by flight, previews, and clearance; world preparation hides resource ownership used by
startup, restart, and restoration. No per-Theme class, registry framework, worker, server, or
second renderer is introduced. The TypeScript contract is design documentation, not runtime code.

## Complexity Tracking

No constitutional violations or exceptions are proposed. The development-only Playwright addition
is required for actual browser shader compilation and menu interaction coverage; Vitest remains
the test runner. Pool metadata, snapshots, and generation tokens address current streaming and
Cancel requirements with concrete callers. Pure mechanics remain independently testable.

## Planning completion checks

Research decisions, data model, internal/UI contracts, and quickstart guide are present.
The setup script resolved this feature through `.specify/feature.json`; no extension hooks were
configured before or after planning. Artifact links, unresolved markers, contract types, and
the absence of a feature task list are checked before submission.
Runtime acceptance remains pending; the documentation PR's existing checks are only baseline
regression checks.
