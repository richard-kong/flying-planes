# Phase 0 Research: Landscape Themes

**Feature**: 002-landscape-themes | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

Decisions are resolved for planning. Runtime and device acceptance remain unverified.
Research used local source and two read-only investigations of
[main at a306073](https://github.com/richard-kong/flying-planes/tree/a3060732b9c7e7a883ee4de64d7672b29f7f76d2).
Source-derived estimates below are not browser measurements.

## 1. Theme representation

**Decision**: One immutable `Theme` record per world in a new pure module `src/sim/themes.ts`,
carrying regional terrain parameter pairs, shaping controls, surface level and kind, terrain
palette, sky gradient, fog, and lighting. A `WorldContext { theme, seed }` value threads through
the existing pure functions.

**Rationale**: The spec treats a Theme as a complete world preset (FR-006, FR-019), so terrain,
surfaces, sky, fog, and lighting must be chosen together or a switch can present a mixed world.
A single record keeps that atomicity in one place and keeps the seam pure, satisfying the
constitution's DOM-free and WebGL-free simulation rule.

**Alternatives rejected**: Separate per-aspect registries (terrain preset, palette preset, sky
preset) allow inconsistent combinations and add lookup code for no current use. Class hierarchies
with per-Theme subclasses add abstraction the constitution's minimum-code principle forbids when
there is no second use.

## 2. Terrain generation strategy

**Decision**: Extend the existing generator rather than adding per-Theme generators.
`biomeParamsAt(x, world, out)`, `heightAt(x, z, world)`, and `normalAt(..., out)` take the world
context; a new `surfaceHeightAt(x, z, world) = max(heightAt, theme.surface.level)` replaces direct
`WATER_LEVEL` use in flight and camera clearance.

**Rationale**: The generator is already parameterised by amplitude, base frequency, ridge
sharpness, and height offset through blended `BiomeParams`, so Nature (gentler relief, lower warp
and detail) needs parameters only. Arctic needs one extra shaping control — a smooth
valley-floor widening / U-profile applied to the existing ridged noise — which is far cheaper than
duplicating streaming, LOD, clearance, and determinism behaviour three times.

**Alternatives rejected**: Three independent generators triple the test surface for every terrain
change and make LOD/seam behaviour diverge per Theme. Post-processing heightfields after
generation would break the pure point-sampled `heightAt` contract that camera clearance and the
soft floor depend on.

## 3. Preserving the Alien Planet baseline

**Decision**: Alien Planet uses the current constants and bypasses the new shaping transform
entirely. Band hashing, band phase, interpolation, noise seeds, arithmetic order, warp strength
300, five ridge octaves, and detail amplitude 0.06 stay byte-identical for it. Golden numeric
fixtures (heights, normals, lake masks, negative coordinates, band boundaries) lock the baseline.

**Rationale**: FR-008/FR-023 require the existing look to survive as Alien Planet. The current
terrain tests compare the generator against itself, so they cannot detect baseline drift; fixtures
recorded before refactoring can.

**Alternatives rejected**: Trusting review alone; re-deriving Alien parameters through the new
shaping path (any reordering of floating-point operations shifts output).

## 4. Chooser and flight lifecycle

**Decision**: A pure lifecycle module distinguishes boot, choosing, preparing, flying, restoring,
and recoverable errors. Initial chooser selection is Nature; reopening selects the active Theme.
Every preparation or restoration takes a monotonically increasing generation token. Cancel from
an unchanged paused world resumes directly; after its terrain was released it rebuilds first.
Every slice checks ownership before writing. Cancel invalidates the candidate and waits for its
outstanding work to settle before buffers are reused. An opaque overlay covers incomplete worlds
until terrain, surfaces, sky, and camera commit together. See [lifecycle contract](./contracts/lifecycle.md).

**Rationale**: FR-018/FR-019/FR-020 forbid mixed-Theme frames, duplicate concurrent preparation,
and an abandoned launch replacing a restored flight. A generation token is the smallest mechanism
that makes all three checkable, and it makes the race conditions unit-testable without a browser.

**Alternatives rejected**: Boolean `isPreparing` flags cannot distinguish a stale completion from
the current one. Promise cancellation alone still lets a resolved continuation write into freshly
reused buffers.

## 5. Memory policy and Cancel restoration

**Decision**: Keep one bounded geometry pool and one set of flight materials. Preparing another
Theme hides and releases the old world's residency back into that pool, clears its coordinate
ownership, and overwrites the buffers. No second pool or cached world is created. The paused
flight survives as a small snapshot (see
[data-model.md](./data-model.md)). Cancel invalidates the candidate generation, enters `restoring`,
rebuilds around the snapshot's camera region first, restores the snapshot, and resets the
wall-clock baseline without replaying menu time. Target: resumed within two seconds on the
reference devices, with visible restoration feedback (FR-015).

**Rationale**: The owner chose lower peak memory over instant Cancel. Peak memory during a switch
would otherwise hold two full worlds; the current pool accounts for about 51 MiB of typed-array
storage before Three.js object and GPU copies. Pool reuse bounds the peak without repeated
allocation. It does not promise that allocated memory drops on every switch. Preview resources
and genuinely obsolete resources are explicitly disposed; all pooled geometry, shared materials,
and the renderer are disposed on teardown. Removing meshes alone does not release GPU resources
([Three.js disposal guide](https://threejs.org/manual/en/how-to-dispose-of-objects.html)).

**Alternatives rejected**: Retaining the old world until the new one commits (instant Cancel, double
peak memory); caching all three worlds (triples world storage without a required use).

## 6. Startup and preparation scheduling

**Decision**: Use a row-sliced preparation path with a per-frame deadline and generation checks.
Prioritise the camera's visible region and movement margin; readiness requires complete visible
coverage through the Theme's intended fog, safe plane/camera framing, and matching surface and
sky. Do not shorten the viewing distance to claim readiness. Peripheral rings continue filling
after readiness. Initial Nature rendering, all three decoded cards, and chooser usability share
the two-second navigation budget.

**Rationale**: Arithmetic over the current constants shows full-disc readiness cannot meet the
two-second budget: the 16-ring Euclidean disc holds 797 chunks (25 / 200 / 572 per LOD), and at
`CHUNKS_PER_FRAME = 2` filling it takes 399 frames — 6.65 s at 60 fps, 13.3 s at 30 fps — before
any generation, upload, or shader-compile cost. This is arithmetic from `src/constants.ts`, not a
measured first-frame failure, but it rules out "fill everything, then show" as a readiness rule.

**Alternatives rejected**: Raising `CHUNKS_PER_FRAME` for startup (long frames, missed 60 fps);
widening fog to hide holes (weakens the existing visual contract, FR-024); showing a partial world
(forbidden by FR-019).

## 7. Residency bookkeeping

**Decision**: Replace the nested maps with preallocated toroidal metadata sized from
`2 * VIEW_RINGS + 1` (currently 33×33), full signed coordinate tags, fixed attached meshes, and
bounded queues. Mirror that ownership in the render module so `main.ts` does not reintroduce
maps or `new Mesh` on chunk crossings. Retain old LOD geometry until its replacement is ready;
pool exhaustion defers work instead of allocating. Preallocate replacement spares and test the
worst simultaneous transition. Cold pool construction can yield while preparing, but its
capacity must be fixed before entering steady flight.

**Rationale**: The constitution requires zero steady-state heap allocation, and the current nested
maps still allocate after warm-up (convergence T051). Crossing one chunk boundary currently removes
33 departures plus 40 LOD replacements before refill, and refilling takes ~37 frames at the current
budget — visible holes (T055). Both are prerequisites for Themes because preparation and switching
reuse the same residency path.

## 8. Preview cards

**Decision**: Three static cards generated once per page visit, sequentially, from the shared Theme
terrain/material/sky pipeline at one fixed preview Seed and a representative camera per Theme.
One reusable 256×144 RGBA8 render target with depth, no stencil, no MSAA, no mipmaps. Read back
with `readRenderTargetPixelsAsync()`, flip rows, draw into a 2D canvas, `toBlob()` →
`URL.createObjectURL()`. Preview geometry, materials, buffers, and the target are released before
flight starts; object URLs are revoked when their images are permanently discarded. Render a
stationary Nature view early, then schedule preview work without advancing it. Decode all three
images before declaring startup ready. Selecting a card changes only the pending selection.

**Rationale**: FR-023 requires faithful, asset-free previews that stay correct as the Themes are
tuned. A single small target bounds the extra memory; sequential generation avoids three
simultaneous worlds. Async readback avoids the synchronous GPU stall of `readRenderTargetPixels`.

**Colour decision**: Preserve the existing custom terrain/sky shader output in both main and
preview rendering. Those shaders write `gl_FragColor` without output-conversion chunks; adding
CPU sRGB encoding to their readback would change the card relative to the current scene.
Use `NoToneMapping`, copy their RGBA8 output with a row flip and opaque alpha, and check the
card against a main-canvas render at the same view. Preserve terrain `Color(hex)` conversion
and the sky's rounded raw RGB literals when moving values into uniforms. A broader colour-space
cleanup is outside this feature. Three's ordinary render-target and canvas output differ for
materials that use its conversion chunks, so `outputColorSpace` alone is not a solution. Sources:
[WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html),
[RenderTarget](https://threejs.org/docs/pages/RenderTarget.html),
[colour management](https://threejs.org/manual/en/color-management.html),
[disposal guide](https://threejs.org/manual/en/how-to-dispose-of-objects.html),
[r180 WebGLRenderer source](https://github.com/mrdoob/three.js/blob/r180/src/renderers/WebGLRenderer.js),
[r180 WebGLProgram source](https://github.com/mrdoob/three.js/blob/r180/src/renderers/webgl/WebGLProgram.js),
and the current [terrain](../../src/render/terrainMaterial.ts) / [sky](../../src/render/sky.ts) shaders.

**Renderer state**: Save and restore render target, viewport, scissor and scissor test, clear
state, output colour space, tone mapping and exposure, and any temporarily swapped camera/uniform
references in a `try/finally`, before any asynchronous yield. The target stays alive until its
readback settles. `renderer.resetState()` resets GL state, not application state.

**Alternatives rejected**: Hand-drawn illustrations (drift from the real worlds); a second renderer
or a per-card target (more context/memory); shipped images (forbidden asset dependency).

## 9. Renderer ownership

**Decision**: One `WebGLRenderer` for the page lifetime, kept across Theme switches and disposed
only on application teardown. Themes apply through `applyTheme` functions that mutate preallocated
uniforms on the existing terrain and sky materials.

**Rationale**: Renderer recreation loses shader caches and risks context-loss handling. Mutating
preallocated uniforms keeps the frame path allocation-free.

## 10. Testing approach and the one new dev dependency

**Decision**: Keep the Vitest/Node suite for all pure simulation and lifecycle logic. Add exactly
one pinned dev dependency, `playwright@1.63.0`, used through its
[library API](https://playwright.dev/docs/library) from a separate, serial Vitest browser suite
excluded from the default Node run. Provide `test:browser` (isolated verification bundle, owns
preview server and browser lifecycle) and `soak:rendered` (headed, real-time rendered flight).

**Rationale**: Constitution III demands a genuine render smoke test; the existing
`tests/render/smoke.test.ts` builds a scene and asserts shader strings without ever creating a
`WebGLRenderer` or rendering a frame (convergence T052). Playwright supplies a real browser without
introducing a second test runner. The constitution also limits dev dependencies; this narrowly
scoped addition needs its browser-smoke justification in the implementation PR. No runtime
dependency is added.

**Supply-chain check** ([npm registry](https://registry.npmjs.org/playwright), checked 2026-09-20):
playwright 1.63.0 published 2026-09-04 (>15 days old); three stays at the locked 0.180.0 and
vitest at 3.2.7. Installation belongs to implementation, not this documentation change.

**Alternatives rejected**: A native headless GL harness would add a separate graphics environment
instead of testing the target browser. A mocked context cannot establish real shader compilation.

## 11. Reference-device verification

**Decision**: Automated functional and rendering checks in CI (which may use
[SwiftShader](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md) and
therefore cannot establish frame-rate budgets), plus an owner-run benchmark guide in
[quickstart.md](./quickstart.md) covering cold 4G startup, per-Theme five-minute flights, 50
switches, hidden-tab/rotation recovery, and the remaining First Flight 60-minute rendered soak.

**Rationale**: SC-001/002/004/006 name device budgets (60 fps laptop, 30 fps phone, two-second
startup, two-second Fly and Cancel) that no VM with software rendering can certify. Keeping the
guide in the feature directory makes the evidence reviewable alongside the plan.

## 12. Disposition of First Flight convergence tasks

Only Theme prerequisites are pulled into this feature; the rest stay open in
[001-first-flight/tasks.md](../001-first-flight/tasks.md).

| Task | Disposition | Reason |
|---|---|---|
| T051 | Prerequisite | Residency must be bounded and allocation-free before switching reuses it. |
| T052 | Prerequisite | Changed shaders and preview readback need an actual WebGL smoke. |
| T053 | Defer to 001 | Independent quaternion correction; unrelated to Themes. |
| T054 | Prerequisite | Every fresh launch needs initialised previous/current poses. |
| T055 | Prerequisite | Replacement must not create coverage holes during preparation. |
| T056 | Prerequisite | New landforms inherit the existing LOD discontinuity. |
| T057 | Prerequisite | Ice and water must stay planar (001 FR-022c; 002 FR-009/012). |
| T058 | Prerequisite | Fresh-activity semantics are required for paused/resumed flights. |
| T059 | Prerequisite | Gesture termination and fresh-input gating cross the menu boundary. |
| T060 | Retained external verification | Expanded to all Themes and switches in the owner benchmark. |
| T061 | Retained external verification | Rendered hour, hidden-tab recovery, orientation. |
| T062 | Prerequisite | Time-zero hint reset now repeats on every launch. |
| T063 | Prerequisite | Resize must remap existing active input without bypassing fresh-input gating after the chooser. |
| T064 | Prerequisite | Sky and fog must use the synchronised camera for every Theme. |
| T065 | Defer | Legacy artifact cleanup; 002 verification uses corrected directions. |

## 13. Unmeasured items

Startup, Fly, and Cancel timing, reference-device frame rates, 50-switch memory stability, and
visual identity of the three worlds are **unmeasured**. They are neither passes nor demonstrated
failures until the owner benchmark is run.

## 14. Surface and LOD continuity

**Decision**: Keep one terrain/surface material. Clip crossing triangles at the Theme's surface
plane during geometry fill, using preallocated worst-case scratch/output buffers, so all water
or ice vertices lie on that plane. Use the same intersections on shared edges. Morph fine detail
toward the neighbouring coarse triangulation before LOD exchange; keep coarse/fine edge positions
and normals compatible. Morphing affects presentation, not the deterministic `heightAt` function.
Pool bounds must include shoreline expansion and any morph attributes, rather than copying today's
51 MiB estimate as a new capacity guarantee.

**Rationale**: T055 retains coverage but does not solve T056's detail popping or T057's sloped
shoreline triangles. Both defects become conspicuous in Arctic's ice and broad valleys.

**Alternatives rejected**: Skirts alone hide some cracks but do not smooth a height jump. Vertex
flattening alone leaves mixed triangles partly above the surface; recolouring them cannot fix
their geometry. Validate topology helpers headlessly, then judge the integrated rendering in the
single WebGL smoke and recorded visual scenarios.
