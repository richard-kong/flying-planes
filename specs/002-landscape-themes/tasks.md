---
description: "Implementation tasks for Landscape Themes"
---

# Tasks: Landscape Themes

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [Theme contract](./contracts/themes.ts),
[lifecycle contract](./contracts/lifecycle.md), and [quickstart.md](./quickstart.md).

**Baseline**: `main` at `d4ae026`, including the approved N4/A4 references and merged First Flight
convergence work. All tasks below are new, unchecked work for feature 002. IDs are local to this
feature; references prefixed `001` refer to the separate First Flight task list.

**Tests**: Required by Constitution III, FR-024, and the plan. Write and observe failing tests
before changing core mechanics or lifecycle rules, then implement and refactor. Baseline fixtures
are captured while the old implementation still passes; new expectations must fail for the
intended missing behaviour, not a broken harness. Shader appearance is reviewed visually, with
one actual WebGL smoke parameterised by Theme; do not add shader-string unit tests.

**Organization**: Setup, shared foundation, US1 (P1), US2 (P1), US3 (P2), then release validation.
US1 is the interaction MVP once the three-Theme foundation exists. All stories and acceptance gates
are required for release.

## Format: `[ID] [P?] [Story] Description`

- Every task uses an unchecked box, a sequential ID, and exact repository-relative file paths.
- `[P]` permits parallel work only within the groups and prerequisite barriers listed below.
- `[US1]`, `[US2]`, and `[US3]` identify story work; shared and release tasks have no story label.
- Tests, fixtures, and verification drivers are source files. Captures and recordings belong on
  the implementing PR, not in the repository or production bundle.

## Baseline reconciliation

The plan's original descriptions of missing First Flight fixes predate merged convergence work.
Reuse the coordinate table, retained LOD replacement, morph attributes, input activity handling,
initial camera pose, and sky synchronisation now present. Extend their regressions for Themes;
do not repeat the old fixes or uncheck completed 001 tasks.

Two planned improvements still need implementation: geometry pools and mesh acquisition currently
have allocating fallbacks, and world preparation has no Theme lifecycle or bounded cancellation.
The planned clipped shore topology also differs from the current fragment-depth projection.
T008–T018 cover those changes without assuming the original defects are still present.

The current browser smoke is `tests/render/webgl.test.ts`, uses Puppeteer, and runs with the
default Vitest suite. T002 migrates its coverage to the planned Playwright library and isolated
browser suite; it does not introduce a second browser driver alongside it.

001 T053 and T065 are already checked off; preserve their corrected orientation and documentation.
001 T060/T061 remain external acceptance obligations, addressed by T060–T064 below. Their existing
checkboxes are not proof of any new Theme's acceptance.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preserve the existing Alien world and prepare reliable verification before changing it.

- [ ] T001 Capture the unmodified Alien generator's Seed 42 and additional-seed heights, normals, band endpoints/transitions, shoreline masks, negative coordinates and distant coordinates as numeric fixtures in `tests/fixtures/alien.ts` with assertions in `tests/sim/alien-baseline.test.ts`; save matching flight/overview captures on the implementing PR and record the baseline revision and viewpoints in `specs/002-landscape-themes/quickstart.md` before any generator or shader refactor.
- [ ] T002 Migrate `tests/render/webgl.test.ts` from Puppeteer to the plan's exact-pinned `playwright@1.63.0` library through npm in `package.json` and `package-lock.json`; remove Puppeteer after migration, add `scripts/test-browser.ts` and `vitest.browser.config.ts`, exclude browser tests from `vitest.config.ts`, and include new configs/drivers in `tsconfig.json`; `test:browser` must own an isolated verification build outside `dist/`, a free-port server, serial Vitest execution, browser cleanup and a nonzero result for missing Chromium/WebGL2 while preserving the existing real-frame assertions.
- [ ] T003 [P] Update `.github/workflows/ci.yml` after T002 to install Playwright Chromium and run `test:browser` alongside typecheck, Node tests, build and size; replace the Puppeteer browser-install step and retain the 600 KB production gzip gate.
- [ ] T004 [P] Update `specs/002-landscape-themes/quickstart.md` after T002 with actual commands and migrated smoke location, remove the resolved T053 orientation caveat, and add the approved N4 Limestone Lakes/A4 Blue Glacier Basin Seed 42 flight/overview comparison to the visual matrix; retain pending device results and existing 001 T060/T061 obligations.

**Checkpoint**: Existing mechanics and real rendering pass in their separate suites; Alien fixtures
and reference captures precede all changes below. No prototype captures are shipped as assets.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Supply the shared three-Theme generator, renderer, safe preparation and input boundary
used by startup, previews and later switching. Complete this phase before story integration.

### Tests first

- [ ] T005 [P] Add preset and Seed contract tests in `tests/sim/themes.test.ts` and `tests/sim/seed.test.ts`: IDs are exactly `"nature" | "alien" | "arctic"`; quote/enforce the data-model constraints "All numbers finite; amplitudes/frequencies positive", "`ridgeSharpness` and `valleyFlatness` in `[0, 1]`", "`valleyWidth` in `[0, 1)`", "warp/detail nonnegative", "fog density positive", "altitude thresholds ordered", and "Records and nested fields are read-only"; preserve Seed as "A non-negative integer in `[0, 4294967295]`" and existing parse rules, with separate fixed `PREVIEW_SEED`.
- [ ] T006 [P] Add failing WorldContext sampling and shaping tests in `tests/sim/biome.test.ts` and `tests/sim/terrain.test.ts` for bit-identical Theme/Seed rebuilding, two blended regional endpoints, unchanged Alien fixtures, Arctic's continuous monotonic valley transform, caller-owned outputs, finite distant/negative samples, and actual land plus water/ice regions in every Theme.
- [ ] T007 [P] Extend `tests/sim/flight.test.ts` and `tests/sim/camera.test.ts` with selected-surface clearance, safe launch height, initial previous/current poses before a callback shorter than `SIM_DT`, preserved speed/input semantics and the already-fixed pitch/quaternion alignment; water/ice above raw terrain must protect both plane and camera.
- [ ] T008 [P] Extend `tests/sim/chunks.test.ts` with bounded reset/rebuild ownership, full signed coordinate tags, axial/diagonal/far-coordinate movement, deferred pool exhaustion and budget-limited LOD replacement coverage; exercise repeated crossings rather than stationary-only updates.
- [ ] T009 [P] Add headless sampling/topology regressions in `tests/sim/terrain-topology.test.ts` for all LODs: clipped crossing triangles lie on the Theme surface plane, adjacent chunks share intersections, morphed positions and normals meet the coarse triangulation, and capacity covers worst-case shoreline expansion without allocations or buffer overflow.
- [ ] T010 [P] Extend `tests/sim/input.test.ts` and `tests/sim/autopilot.test.ts` for the fresh-input gate, neutralising steering without altering saved Throttle/activity history, ended gestures and queued intents, time-zero activity, clamped wheel/pinch activity, touch activation, two-to-one handoff, cancellation/blur and resize that cannot count as fresh input.

### Shared implementation

- [ ] T011 Define the immutable `Theme`, `ThemeId`, `WorldContext`, `THEMES`, `themeById` and `PREVIEW_SEED` contract in `src/sim/themes.ts`, migrating Theme-owned values out of `src/constants.ts`; provide all three complete presets and two regional endpoints per Theme, preserve Alien values/conversions, seed Nature/Arctic parameters from the approved N4/A4 visual cues, enforce "Nature and Alien retain forest blending; Arctic has `forestStrength = 0`", and keep all nested records read-only without importing the finite prototype renderer.
- [ ] T012 Thread WorldContext through `src/sim/biome.ts` and `src/sim/terrain.ts`; implement shared Theme shaping and `surfaceHeightAt = max(heightAt, theme.surface.level)`, bypass shaping for Alien without changing noise seeds/arithmetic/band layout, use Nature's gentler parameters and Arctic's valley controls, and keep the functions pure with caller-owned scratch/output data.
- [ ] T013 Update `src/sim/flight.ts` and `src/sim/camera.ts` to use the selected visible surface and WorldContext, preserving `FlightInput`, speed/attitude conventions and test-first clearance/initialisation guarantees; update their callers in `src/main.ts`, `scripts/soak.ts` and existing tests without inventing a second flight-input path.
- [ ] T014 Extend `src/render/terrainMesh.ts` to consume WorldContext in full and row-sliced fills, sharing pure array-based clipping/morph helpers in `src/sim/terrain-topology.ts` between both paths; implement surface-plane triangle clipping and matching coarse/fine position/normal morphs, size preallocated scratch/index/attribute buffers for worst-case topology, retain one terrain/surface material and make all T009 assertions pass without scene objects in the pure helper interface.
- [ ] T015 Implement bounded residency and mesh ownership in `src/render/world.ts`, adapting `src/sim/chunks.ts`, `src/render/terrainMesh.ts`, `src/constants.ts` and `src/main.ts`; reuse the existing coordinate table, preallocate queues/meshes/LOD replacement spares, defer pool misses instead of calling `new Mesh` or growing geometry, retain the outgoing LOD until its replacement is ready, and provide reset plus teardown for both resident and free resources.
- [ ] T016 Parameterise `src/render/terrainMaterial.ts` and `src/render/sky.ts` with the Theme's complete palette, sky gradient, fog, surface kind/level and fixed lighting; apply preallocated uniforms together, preserve Alien's existing colour conversions, synchronise the camera world matrix before sky updates, and replace superseded fragment-depth shore projection with T014's flat geometry without double-applying either technique.
- [ ] T017 Add the shared preparation operation in `src/render/world.ts`: job fields `generation`, `themeId`, `seed`, `kind`, `phase`, `deadline` and `readiness` follow `data-model.md`; slice fills by deadline, prioritise visible camera coverage plus movement margin through unchanged intended fog, require GPU upload/shader/surface/sky/pose readiness, continue peripheral streaming afterwards, and acknowledge cancelled writes/readbacks before another generation reuses the single pool.
- [ ] T018 Implement T010's input boundary helpers in `src/sim/input.ts` and wire them in `src/main.ts` without changing the Steer Vector/Throttle abstraction; clear physical gestures and pending wheel/pinch intents, preserve saved idle history, require a fresh event after a closed gate, suppress menu-origin synthetic events until release, and keep the merged activity/resize/hint regressions passing.

**Checkpoint**: All three complete worlds can be prepared through the same pipeline with safe
clearance and valid poses. Updated Node tests and the migrated real-frame smoke pass for the
shared changes. This does not establish device timing or final visual approval.

## Phase 3: User Story 1 - Choose a world before flying (Priority: P1)

**Goal**: A stationary Nature scene and usable chooser offer three decoded, faithful static cards.
Selection changes only the pending Theme; Fly starts a safely framed fresh Flight.

**Independent Test**: Fresh-load and reload on desktop and touch: Nature always selected, no Cancel
or simulation advance before a first Flight, all cards labelled and decoded, selection does not
change background/Seed/Throttle, and each Theme launches using only the specified activations.
Exercise keyboard menu controls, narrow screens and rotation. Device timings are gated in T060.

### Tests first

- [ ] T019 [P] [US1] Add failing startup lifecycle tests in `tests/sim/session.test.ts` for Nature default, one page Seed chosen once, boot/choose/prepare/fly transitions, selection-only events, one current generation, duplicate-action guards, fresh defaults, startup/launch errors with retained selection, and no Cancel without a prior Flight.
- [ ] T020 [P] [US1] Add initial chooser/Fly browser scenarios in `tests/render/startup.browser.test.ts` using T002's isolated build: stationary Nature, all three named cards/descriptions, fixed defaults, valid/malformed/missing Seed compatibility, reload resetting Nature, early first-frame framing, one activation for Nature/two for other Themes, and first controllable frame readiness.
- [ ] T021 [P] [US1] Add browser preview assertions in `tests/render/previews.browser.test.ts` for shared-generator output, offscreen/main-view colour parity, correct row orientation, three decoded cached cards at fixed Seed, renderer-state restoration before yields, bounded target/resources, and readback/null-Blob/decode failures with retry and stale URL cleanup.
- [ ] T022 [P] [US1] Add chooser accessibility/input-isolation browser scenarios in `tests/render/chooser.browser.test.ts` for labelled radios, non-colour selection, visible keyboard focus, responsive scrolling/44 CSS pixel targets, text zoom, preparation/error announcements, blocked busy actions and menu pointer/wheel/touch/keyboard events leaving Flight unchanged.

### Implementation

- [ ] T023 [US1] Implement startup lifecycle and Seed ownership in `src/sim/session.ts` using the contract's discriminated `booting`, `choosing`, `preparing`, `flying`, `restoring` phases; startup is `selection = nature`, errors identify `startup`, `launch` or `restore`, and "`preparing` and `restoring` ignore duplicate Fly presses and selection changes"; keep transitions headless and preparation ownership explicit without persisting preferences.
- [ ] T024 [P] [US1] Build the initial native modal chooser in `index.html` and `src/ui/chooser.ts` with three labelled radio cards/descriptions/images, Fly, visible focus and checked indicators, conditional Cancel, polite status and error alerts, phone-safe scrolling/safe areas and targets at least 44 CSS pixels high; emit lifecycle events rather than steering or mutating renderer state.
- [ ] T025 [P] [US1] Implement sequential actual-terrain previews in `src/render/previews.ts` using one shared 256×144 RGBA8 target with depth and no stencil/MSAA/mipmaps, `PREVIEW_SEED` and Theme cameras; reuse shared sampling/material/sky functions, async readback, row flip/opaque alpha, `toBlob`, object URLs and decode, preserving existing colour output with `NoToneMapping`.
- [ ] T026 [US1] Complete preview ownership/retry in `src/render/previews.ts`: save and restore target, viewport, scissor, clear state, output colour space, tone mapping/exposure and camera/uniform references in `try/finally` before yielding; retain the target until readback settles, release temporary geometry/materials/target before flight, cache successful URLs, regenerate only failed cards and reject stale completions; card `status` is `"pending" | "ready" | "failed"` and degraded text-only fallback is not successful startup.
- [ ] T027 [US1] Wire boot and bounded preview/world scheduling in `src/main.ts`: parse or generate the page Seed once, render stationary Nature early, initialise both plane/camera interpolation states, freeze simulation/hint/morph time outside `flying`, finish all three decoded previews before ready chooser/Fly, and measure navigation-to-first-frame separately from navigation-to-ready-chooser without widening fog to meet readiness.
- [ ] T028 [US1] Connect initial Fly in `src/main.ts` and `src/ui/chooser.ts` to session/preparation: lock selection and duplicate launch, show the opaque progress overlay, atomically commit matching terrain/surfaces/sky/fog/light/pose, reset normal starting state and hint, clear menu gestures, reset the wall-clock baseline, and accept flight controls only from fresh canvas input.
- [ ] T029 [US1] Add controlled startup/launch/preview failure and delayed-completion injection to `scripts/test-browser.ts` and its verification-build adapter, then finish retry/error wiring in `src/main.ts` and `src/ui/chooser.ts`; preserve selection, retry only unfinished startup work, allow another Theme and never expose a partial world or Cancel-to-background; hooks must be absent from the production bundle.
- [ ] T030 [US1] Complete focus, keyboard and layout behaviour in `src/ui/chooser.ts` and `index.html`: Tab/Shift+Tab, radio arrows, Space/Enter, conditional Escape, usable status/error paths and no disabled-focus trap; bind flight listeners to the canvas and flying state in `src/main.ts`, so scrolling/pinching a phone chooser cannot throttle or start flight.
- [ ] T031 [US1] Run the US1 Node and browser scenarios in `tests/sim/session.test.ts`, `tests/render/startup.browser.test.ts`, `tests/render/chooser.browser.test.ts` and `tests/render/previews.browser.test.ts`; fix failures and record readiness, preview parity and mouse/touch/keyboard evidence in `specs/002-landscape-themes/quickstart.md`, leaving reference-device timing unverified until T060.

**Checkpoint**: US1 works without mid-flight Theme switching. This is the interaction MVP; US2
confirms visual fidelity/continuous exploration and US3 supplies pause, Cancel and restart.

## Phase 4: User Story 2 - Explore three distinct landscapes (Priority: P1)

**Goal**: Earth-like Nature follows N4, Arctic follows A4, and Alien preserves First Flight,
with deterministic, continuous terrain and consistent flight controls.

**Independent Test**: Fly all three at Seed 42 through opening, mountain, valley, shore and regional
transition views. Compare Nature/Arctic flight and overview views to the pinned approved captures,
compare Alien to T001, and repeat routes after restart/reload for matching land/surface positions.

### Tests first

- [ ] T032 [P] [US2] Extend `tests/sim/terrain.test.ts` with fixed-region relief/valley-width measurements and deterministic transition routes for all Themes: Nature gentler than Alien, Arctic broader floors and distinct ridges, both land/surface regions, gradual bands, finite normal samples and matching results at negative/distant coordinates; establish quantitative assertions before tuning.
- [ ] T033 [P] [US2] Extend `tests/sim/alien-baseline.test.ts` to run T001's fixed values through WorldContext and preview/flight sampling entrypoints, rejecting changes to Alien's band/noise arithmetic, terrain, normals or lake mask rather than comparing the new generator only against itself.
- [ ] T034 [P] [US2] Extend the single real smoke in `tests/render/webgl.test.ts` to parameterise all three Themes, enter each via the chooser and render the expected plane/sky/terrain plus visible water or ice; reject blank readback, missing drawables, shader compile/link, GL/page errors and missing WebGL2 rather than counting a construction-only test as rendered coverage.

### Implementation and visual acceptance

- [ ] T035 [US2] Tune Nature in `src/sim/themes.ts` against N4 Limestone Lakes: green foothills/forest bands, alpine meadows, pale limestone faces, white snow, turquoise lakes and clear daylight with gentler relief; use `specs/002-landscape-themes/spec.md#approved-visual-references` and T032 measurements, preserving endless regional generation instead of copying the finite prototype world.
- [ ] T036 [US2] Tune Arctic in `src/sim/themes.ts` against A4 Blue Glacier Basin: broad glacial valleys, sculpted snowy ridges, stronger blue ice, flat frozen lakes and cold daylight with zero temperate forest contribution; satisfy T032 and the shared shaping constraints without introducing a separate generator or shipped assets.
- [ ] T037 [US2] Verify and correct Alien parameter/material parity in `src/sim/themes.ts`, `src/render/terrainMaterial.ts` and `src/render/sky.ts` using T001/T033: Alpine/Foothills shapes, cool dusky terrain, gold lakes, low pale-gold sun, Pastel Dawn and lavender fog; fix defects without new spires/craters/objects or colour-space redesign.
- [ ] T038 [US2] Calibrate all Theme preview poses in `src/sim/themes.ts` and shared output in `src/render/previews.ts` so fixed-Seed cards represent each world's required landforms and colour relationships, including N4/A4 cues; rerun T021 parity/state checks and keep successful cards static on selection/reopening.
- [ ] T039 [US2] Capture Seed 42 flight and overview views matching the approved N4/A4 viewpoints plus mountain/valley/shore/transitions using `scripts/test-browser.ts`, compare against the pinned source/captures in `specs/002-landscape-themes/spec.md`, and record the visual verdict in `specs/002-landscape-themes/quickstart.md` with PR-hosted evidence; include Alien T001 comparison, LOD seams, planar surfaces and sun/fog alignment during turns, fixing observed gaps without claiming prototype approval is production acceptance.
- [ ] T040 [US2] Run per-Theme deterministic route, clearance, speed, steering and Autopilot regressions in `tests/sim/terrain.test.ts`, `tests/sim/flight.test.ts`, `tests/sim/camera.test.ts` and `tests/render/webgl.test.ts`; verify regional continuity and matching terrain/surface placement on reload and repeated preparation, recording results in `specs/002-landscape-themes/quickstart.md`.

**Checkpoint**: Visual and functional evidence covers all three complete presets. Reference-device
frame-rate/startup claims still depend on the final phase.

## Phase 5: User Story 3 - Try another theme without reloading (Priority: P2)

**Goal**: Change theme freezes the current Flight. Cancel resumes its saved presentation, rebuilding
released terrain when necessary; Fly always starts a fresh Flight, including the same Theme.

**Independent Test**: Exercise all six directed switches and three same-Theme restarts on mouse and
touch. Compare snapshot to first restored frame after direct Cancel, Cancel during preparation,
60 seconds paused and hidden-tab recovery. Inject delayed/stale completions and launch/restoration
failure; retry must target the right operation without losing the prior Flight.

### Tests first

- [ ] T041 [P] [US3] Extend `tests/sim/session.test.ts` with the complete lifecycle transition table, snapshot field round trips, direct/rebuilt Cancel, same-Theme fresh restart, preserved selection/snapshot on errors, restore retry versus fresh launch, duplicate-action guards and stale success/failure rejection using controlled completions.
- [ ] T042 [P] [US3] Extend `tests/sim/input.test.ts` and `tests/sim/autopilot.test.ts` for Fly/Cancel boundaries with non-default Throttle, manual and engaged-Autopilot snapshots, stationary pointer, held menu touch, queued wheel/pinch and resize; neutral steering must neither overwrite saved attitude/speed nor reset idle history or immediately re-engage Autopilot.
- [ ] T043 [P] [US3] Add `tests/render/switching.browser.test.ts` for six directed switches, three same-Theme restarts, pause/hint/interpolation invariance, 60-second/hidden-tab pause, Cancel before/after release and racing completion, launch failure before/after release, restore failure with retry/fresh launch, duplicate busy actions, focus recovery and mouse/touch/keyboard access.
- [ ] T044 [P] [US3] Add controlled ownership/resource scenarios in `tests/render/world.browser.test.ts` for one pool/renderer/material set, manifest/morph restoration, cancellation acknowledgement before buffer reuse, rejected stale writes/disposal, and teardown of resident/free geometry; use T029's verification adapter without adding production debug controls.

### Implementation

- [ ] T045 [US3] Implement `FlightSnapshot` capture/restore in `src/sim/session.ts` as "Small, flat, and allocated once": preserve `themeId`, `seed`, complete `plane`, `planePrev`, `cameraPose`, `cameraPosePrev`, `simTime`, `accumulator`, saved input Throttle/activity time/sequence, `autopilot`, hint `inputSeen`/`hidden`/fade progress, and bounded `chunkManifest` with LOD/morph progress; retain no GPU resources.
- [ ] T046 [US3] Complete the pure transition rules in `src/sim/session.ts`: selecting a card mutates only selection, Change theme captures once and selects the active Theme, Cancel needs a snapshot, direct versus rebuilt resume depends on residency, every launch/restore increments generation, errors preserve snapshot/selection with the correct retry target, and "Exactly one `generation` is live" until cancellation is acknowledged.
- [ ] T047 [US3] Extend `src/render/world.ts` for candidate release and snapshot restoration: keep the paused residency while browsing, return it to the single reusable pool only on Fly, await cancellation acknowledgement before reuse, rebuild the saved camera region and LOD/morph manifest, keep the snapshot through errors, and prevent a stale generation from writing to or disposing a later generation's resources.
- [ ] T048 [US3] Add Change theme and conditional Cancel/Retry adapters in `src/ui/chooser.ts` and `index.html`; show only Change theme and the temporary hint outside modal/progress/error states, keep the central flight view clear, restore focus to Change theme, allow Escape only with a prior Flight and no restoration in progress, and announce preparing/restoring/errors accessibly.
- [ ] T049 [US3] Wire pause and presentation capture in `src/main.ts` and `index.html`: freeze fixed-step clock, accumulator, plane/camera interpolation, terrain morphs, Autopilot and hint/CSS fade together; terminate physical gestures on entry, preserve selection across resize/orientation/visibility changes and never count chooser input or menu time as flight activity.
- [ ] T050 [US3] Wire direct and rebuilt Cancel in `src/main.ts`: clear only steering/physical gestures/queued throttle, restore all saved state and the first saved interpolation presentation before another simulation step, reset `lastNow` without catch-up, require fresh input and keep an opaque "Restoring flight…" state until terrain/surfaces/sky/camera are ready.
- [ ] T051 [US3] Connect every Fly, including same-Theme Fly, in `src/main.ts` to a new Flight: reset normal start/heading, safe surface-relative altitude, level attitude, speed/default Throttle, neutral steering, disengaged Autopilot, idle/hint timers and previous/current poses while retaining page Seed; discard the prior snapshot only after successful atomic commit.
- [ ] T052 [US3] Complete recoverable launch/restore failure and retry integration in `src/main.ts` and `src/ui/chooser.ts` with T029's verification adapter: retain the prior Flight, lock duplicate actions while busy, allow Cancel after failed launch and retry or fresh Fly after failed restoration, and reject late abandoned commits/cleanup so partial or mixed worlds never become visible.
- [ ] T053 [US3] Execute all switch/restart/cancellation/error paths in `tests/render/switching.browser.test.ts` and `tests/render/world.browser.test.ts` for mouse, touch and keyboard menu operation; compare saved and first restored state including hint/morph progress, record evidence in `specs/002-landscape-themes/quickstart.md`, and leave the two-second reference-device result to T060.
- [ ] T054 [US3] Add and run 50 completed changes with intervening Cancel/retry in `tests/render/resources.browser.test.ts`; track warmed pool occupancy, geometry/texture/program counts, settled available memory and three cached preview URLs, verify no card regeneration, no second renderer/pool, no stale resource disposal and bounded teardown, and record VM evidence separately from owner-device memory/performance results.
- [ ] T055 [US3] Complete resize/orientation, pointer remapping and 60-second hidden-tab recovery scenarios in `tests/render/chooser.browser.test.ts` and `tests/render/switching.browser.test.ts` across flying/choosing/preparing/restoring/error states; preserve selection/snapshot, reachability, fresh-input isolation and no elapsed-time replay, fixing any reproduced integration defects in `src/main.ts` or `src/ui/chooser.ts`.

**Checkpoint**: All three stories and automated races/resource checks pass. Cancellation timing,
steady-state allocations and hardware performance still require the final evidence below.

## Phase 6: Polish and Cross-Cutting Acceptance

**Purpose**: Finish release tooling and record the evidence needed to meet the unchanged budgets.
The owner-device tasks are external acceptance gates; automated/VM results cannot check them off.

- [ ] T056 [P] Add `scripts/soak-rendered.ts` and `soak:rendered` in `package.json` using the existing isolated browser harness: support `--minutes 60 --seed 42 --theme alien --headed`, operate the chooser rather than adding a public Theme URL, drive a deterministic maximum-speed route through both bands/two transitions with normal input mappers, record rendered time/errors/resources/frame data, exit nonzero on failures and clean up all owned processes.
- [ ] T057 [P] Update `CONTEXT.md` and `specs/002-landscape-themes/quickstart.md` for implemented Theme/Flight/snapshot/preparation ownership, actual test/soak commands and N4/A4 review evidence; remove obsolete single-world/global-water instructions and keep benchmarks explicitly pending until measured.
- [ ] T058 Run `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build`, `npm run size` and `git diff --check` against `package.json` and `.github/workflows/ci.yml`; verify release output excludes preview screenshots, finite prototype entrypoints and verification/failure-injection hooks, remains a static GitHub Pages-compatible build, adds no runtime dependency beyond Three.js and ships at most 600 KB gzipped JavaScript.
- [ ] T059 Audit steady-state frame/streaming work in `src/main.ts`, `src/render/world.ts`, `src/render/terrainMesh.ts` and `src/sim/chunks.ts` using allocation traces while crossing chunks after warm-up; remove any application allocation, queue growth or pool-miss fallback under observed workloads and record trace/tool limitations in `specs/002-landscape-themes/quickstart.md` without treating flat heap totals alone as proof.
- [ ] T060 Have the owner run the cold-load/Fly/Cancel timings in `specs/002-landscape-themes/quickstart.md` on their reference laptop and phone: record revision/device/browser/GPU/DPR and reproducible 4 Mbps down/1 Mbps up/150 ms 4G shaping; five cold samples per device must show both first Nature frame and usable three-preview chooser within two seconds, and five samples per launch/same-Theme/direct-Cancel/rebuilt-Cancel path must each reach the first correct controllable frame within two seconds, including cancellation acknowledgement/upload.
- [ ] T061 Have the owner run each Theme's five-minute representative route and warm allocation checks from `specs/002-landscape-themes/quickstart.md` on both reference devices; record all below-target windows/stalls, median/p95/p99 frame intervals and application allocation evidence, enforcing sustained 60 fps laptop/30 fps phone with zero steady-state allocations; fix demonstrated failures and leave unavailable measurements explicitly unverified.
- [ ] T062 Have the owner run 50 completed changes per device from `specs/002-landscape-themes/quickstart.md`, traversing all six directed pairs and three same-Theme restarts with interleaved Cancel/retry/hidden-tab/rotation checks; record warmed memory/resource counts every tenth change and at completion, requiring a bounded settled plateau, no mixed frames/failures and maintained frame-rate budgets.
- [ ] T063 Run and record the real-time headed 60-minute rendered Alien Planet Seed 42 maximum-speed soak via `scripts/soak-rendered.ts` per `specs/002-landscape-themes/quickstart.md`, followed by hidden-tab/resize/phone-orientation recovery; collect continuity, precision, errors and resource evidence at distant coordinates, fix reproduced defects, and do not substitute an accelerated Node soak or software-renderer FPS for device acceptance.
- [ ] T064 Run `/speckit-analyze` and reconcile completed acceptance evidence in `specs/002-landscape-themes/tasks.md`, `specs/002-landscape-themes/quickstart.md` and `specs/001-first-flight/tasks.md`; close 001 T060/T061 only when their respective device/soak evidence exists, retain any unmet gates, and attach red/green, visual, timing, allocation and resource results with a Constitution Check (including removed code/dependency rationale) to the implementing PR.

## Dependencies and Execution Order

### Phase graph

```text
Setup T001–T004
      |
Foundation T005–T018
      |
US1 T019–T031 (P1, interaction MVP)
      |
US2 T032–T040 (P1, final visual and exploration acceptance)
      |
US3 T041–T055 (P2, switching/resume)
      |
Polish T056–T059 --> owner/device/soak gates T060–T063 --> T064
```

US2 test authoring can start after the foundation; its browser/visual acceptance uses US1's real
chooser. US3 depends on US1's launch path and validated Theme preparation. No Phase 2 task depends
on a story-phase implementation. Do not implement the entire stories concurrently in shared files.

### Within-phase prerequisites

| Tasks | Prerequisite / barrier |
|---|---|
| T001 → T002 → T003/T004 | Capture baseline before harness migration; CI/docs then use real commands. |
| T005–T010 | Setup complete; independent test files, observe relevant failures before their implementations. |
| T011 → T012 → T013 | Preset types/data before sampling, sampling before clearance/callers. |
| T014 → T015 → T016 → T017 → T018 | Build on T011–T013; topology before pool capacities, matching material before readiness, then input foundation. |
| T019–T022 | Foundation complete; independent lifecycle/startup/preview/chooser suites. |
| T023 → (T024 and T025) → T026 → T027–T031 | Startup state before adapters; UI and previews can be authored independently, integration remains sequential. |
| T032–T034 → T035–T040 | Foundation and US1 complete for acceptance; test suites parallel, Theme tuning/material changes serial. |
| T041–T044 → T045–T055 | US1/US2 complete; test authoring parallel, snapshot → state rules → resource restore → UI → integration → evidence serial. |
| T056 and T057 → T058 → T059 | All stories complete; driver/package edits independent of docs, then final checks/allocation audit. |
| T060–T063 → T064 | Measure the same verified release; run timed/device scenarios serially so profiling/recording do not distort them. |

During implementation, update all direct callers when a public function signature changes and
keep the appropriate test group failing for its intended missing behaviour, not compilation drift.
Each story checkpoint must be buildable and independently exercisable through the real UI.

### Parallel examples

These are authoring groups, not permission to run competing workloads during performance tests.

| Group | Independent work |
|---|---|
| Setup, after T002 | T003 CI wiring and T004 acceptance-guide refresh. |
| Foundation, after setup | T005 presets/Seed; T006 terrain; T007 flight/camera; T008 chunks; T009 topology; T010 input/Autopilot tests. |
| US1, after foundation | T019 session tests, T020 startup browser tests, T021 preview browser tests and T022 chooser browser tests. |
| US1, after T023 and failing tests | T024 DOM chooser and T025 preview renderer; no shared source file writes. |
| US2, after US1 | T032 terrain measurements, T033 fixed Alien regressions and T034 real WebGL smoke extension. |
| US3, after US2 | T041 snapshot/transitions, T042 input boundary, T043 switch flows and T044 world ownership tests. |
| Polish, after stories | T056 rendered-soak driver/package script and T057 domain/acceptance documentation. |

## Requirement and Contract Coverage

| Obligation | Implementation / evidence tasks |
|---|---|
| FR-001 | T019, T020, T023, T027, T031 |
| FR-002 | T005, T011, T020, T024 |
| FR-003 | T021, T022, T024–T027, T031, T038 |
| FR-004 | T019, T020, T023, T027, T028 |
| FR-005 | T022, T024, T030, T048, T055 |
| FR-006 | T011, T012, T014, T016, T017 |
| FR-007 | T006, T032, T035, T038–T040 |
| FR-008 | T001, T011, T012, T016, T033, T037, T039 |
| FR-009 | T006, T009, T014, T032, T036, T039 |
| FR-010 | T006, T008, T009, T012, T014, T015, T032, T040 |
| FR-011 | T005, T019, T020, T023, T040, T051 |
| FR-012 | T007, T010, T013, T018, T040 |
| FR-013 | T041, T045, T046, T048, T049 |
| FR-014 | T022, T041–T043, T049, T050, T055 |
| FR-015 | T041, T043–T047, T050, T053, T060 |
| FR-016 | T019, T028, T041, T043, T051, T053 |
| FR-017 | T010, T018, T022, T028, T042, T050, T055 |
| FR-018 | T019, T023, T028, T041, T046, T052 |
| FR-019 | T016, T017, T028, T044, T047, T051–T053 |
| FR-020 | T029, T041, T043–T047, T052, T053 |
| FR-021 | T028, T041, T045, T049–T051, T053 |
| FR-022 | T024, T048, T058 |
| FR-023 | T011, T021, T025, T026, T038, T054, T058 |
| FR-024 | T002, T003, T005–T018, T056, T058–T064 |
| SC-001 | T020, T021, T026, T027, T031, T060 |
| SC-002 | T020, T028, T031, T060 |
| SC-003 | T001, T032–T039 |
| SC-004 | T041–T053, T055, T060, T062 |
| SC-005 | T005, T006, T020, T032, T033, T040 |
| SC-006 | T054, T059, T061, T062 |
| SC-007 | T022, T030, T043, T048, T052, T053, T055 |
| Theme/WorldContext/Seed contracts | T005–T007, T011–T014, T016, T023 |
| ChooserState/PreparationJob/single-operation ownership | T017, T019, T023, T029, T041, T044, T046, T047, T052 |
| FlightSnapshot/Flight/input preservation | T010, T018, T041, T042, T045, T049–T051 |
| ThemePreviewCard/render target/URL lifecycle | T021, T025, T026, T038, T054 |
| 001 T051/054–059/062–064 preservation and Theme extension | T007–T018, T040, T049–T055, T059 |
| 001 T052 migrated real-render coverage | T002, T003, T034 |
| 001 T053/T065 already resolved | T007, T004; no duplicate fix scheduled |
| 001 T060/T061 outstanding acceptance | T056, T058–T064 |

## Implementation Strategy

1. Preserve the merged baseline, then finish test-first shared mechanics and resource ownership.
2. Deliver **US1 as the interaction MVP**: actual three-Theme cards and flights, with no switching
   requirement yet. Complete its independent tests before moving on.
3. Complete US2's N4/A4 visual calibration, preserved Alien appearance and continuous exploration.
4. Add US3's switching, snapshots, cancellation, failures and recovery without changing the Seed
   or adding another world pool.
5. Run cross-cutting checks and collect the owner's device measurements. A demo or automated green
   suite does not waive visual acceptance, performance budgets, or pending First Flight obligations.

## Task-Generation Validation

- 64 tasks: 4 setup, 14 foundation, 13 US1, 9 US2, 15 US3 and 9 cross-cutting acceptance.
- Every task is unchecked and has a unique sequential ID and exact file paths; only story phases
  carry story labels. Parallel markers refer to the explicit non-conflicting groups above.
- Coverage maps all 24 functional requirements, 7 success criteria, entities and internal contracts.
- All design documents were read; before/after task extension hooks are absent in this checkout.
- Runtime implementation and acceptance results remain pending; no task is completed by generation.
