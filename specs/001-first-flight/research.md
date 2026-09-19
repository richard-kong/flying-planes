# Research: First Flight

Decisions settled in the planning interview (2026-09-19). No NEEDS CLARIFICATION remain.

## R1. Terrain generation on the CPU from one pure height function

- **Decision**: Each Terrain Chunk's vertex heights are computed in TypeScript by
  `heightAt(x, z, seed)` and uploaded once. The same function serves the Flight Model floor
  (FR-006), the Chase Camera clamp (FR-015), and the mesh.
- **Rationale**: One implementation is tested once and is the terrain; no CPU/GPU drift.
- **Alternatives**: vertex-shader displacement (needs a duplicate JS height for the floor;
  untestable terrain); Web Worker generation (more code, no second use yet; revisit if
  main-thread generation causes hitches on phones).

## R2. Fixed-ring LOD with skirts

- **Decision**: Every chunk has the same footprint (`CHUNK_SIZE = 256 m`). Grid resolution is a
  pure function of the Chebyshev ring distance from the Plane's chunk: ring 0-2 → 64x64,
  3-7 → 32x32, 8-16 → 16x16. Each chunk adds a downward skirt along its border to hide cracks
  between rings. LOD changes happen only far from the Plane, under fog (FR-016a).
- **Rationale**: Ring → resolution is trivially testable; skirts are ~10 lines.
- **Alternatives**: quadtree (largest single code item, not needed for "no visible popping");
  single resolution with short view distance (kills the distant-silhouette look).

## R3. One custom ShaderMaterial for terrain and lakes

- **Decision**: A single `ShaderMaterial`. Vertex stage: if `position.y < WATER_LEVEL`, set
  `y = WATER_LEVEL` and flag the fragment as water (normal up). Fragment stage: altitude and
  slope palette (FR-022, FR-022e), hashed forest speckle (FR-022d), Lambert-style sun-orientation
  shading with warm/cool tint and no shadow maps (FR-022b), lavender exponential fog to a
  sky-matched horizon colour (FR-022g), gold lake tint with a Blinn specular toward the sun
  (FR-022c). Biome-dependent thresholds are per-vertex attributes (blended by FR-021 weight).
- **Rationale**: One material, smooth blends independent of mesh resolution, lakes at zero extra
  geometry or draw calls; shaders are not unit-tested so complexity is free of test cost.
- **Alternatives**: `MeshStandardMaterial` + vertex colours + lake plane (banding at low LOD,
  extra draw calls, PBR fights the pastel look); Three.js `FogExp2` (cannot match the gradient
  horizon).

## R4. Sky as a background quad sharing the gradient with fog

- **Decision**: A full-screen quad (`depthWrite: false`, rendered first) with a GLSL
  `skyColor(dir)` gradient (peach → pink → pale blue) plus sun disc and halo from
  `SUN_DIRECTION`. The same GLSL function is `#include`d as a string constant in the terrain
  shader so fog resolves to the sky colour at the horizon.
- **Alternatives**: sky sphere mesh (needs a large geometry and camera-following); `Sky` addon
  (physically based, bigger, wrong mood).

## R5. Biome Transition blends parameters, not heights

- **Decision**: `bandWeight(x, seed)` returns w ∈ [0,1] via smoothstep over the transition width
  along the band axis. `biomeParamsAt(x, seed, out)` lerps every parameter of Alpine and
  Foothills (amplitude, base frequency, ridge sharpness, snow threshold, rock slope, forest band,
  fog density, water share via a height offset) by w; `heightAt` evaluates the noise once with
  the blended parameters.
- **Rationale**: Half the noise cost; test: params at band centre equal the Biome's, at the
  transition midpoint equal the average.
- **Alternatives**: evaluate both Biomes and lerp heights (2x noise evaluations per vertex).

## R6. Hand-rolled hashed value noise

- **Decision**: `noise.ts`: 32-bit integer hash `hash2(ix, iz, seed)`, bilinear value noise with
  quintic fade, `fbm(x, z, seed, octaves, lacunarity, gain)`, one domain-warp pass for ridges. All
  arithmetic is `Math.imul`/`>>> 0` integer hashing and IEEE doubles, so Node and browsers agree
  bit for bit (SC-006).
- **Alternatives**: simplex (more code, no visual gain at this scale); a noise library (forbidden
  by Principle I).

## R7. `sim/` vs `render/` seam

- **Decision**: `src/sim/**` imports only `three/src/math/*` (`Vector3`, `Quaternion`,
  `MathUtils`) and `../constants`. `src/render/**` and `src/main.ts` are the only files that
  import the rest of Three or touch DOM. A purity test greps `src/sim` for forbidden imports.
- **Alternatives**: flat `src/` (seam exists only by convention); hand-rolled math (reimplements
  quaternions to save nothing).

## R8. Performance verification

- **Decision**: CI gates bundle size (R10). Zero-alloc is enforced by design (module-level scratch
  `Vector3`/`Quaternion`, preallocated chunk geometry pool, no closures/literals inside
  `update()`/`render()`) and checked manually with Chrome DevTools Memory allocation sampling as
  documented in `quickstart.md`. fps is measured manually on the two reference devices and
  recorded in the implementing PR's Constitution Check.
- **Alternatives**: headless-browser fps/heap sampling in CI (flaky, second tool); in-page stats
  overlay (spec forbids HUD).

## R9. DPR cap

- **Decision**: `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))`, no user setting.
- **Rationale**: Fill rate is the phone bottleneck; the soft pastel look hides the resolution.

## R10. CI

- **Decision**: `.github/workflows/ci.yml` on `pull_request` and `push` to `main`: `npm ci`,
  `tsc --noEmit`, `vitest run`, `vite build`, then a shell step that gzips `dist/assets/*.js`,
  sums the sizes, and fails above 600 KB. No lint or formatter in this feature.

## R11. Render smoke test without a GPU

- **Decision**: `tests/render/smoke.test.ts` runs in Node: it constructs the terrain material,
  fills one chunk from the geometry pool for each LOD, builds sky and plane meshes, adds them to
  a `Scene`, and calls `scene.updateMatrixWorld(true)`. It asserts no throw and that shader
  source strings are non-empty. Actual WebGL rendering is verified manually (quickstart).
- **Rationale**: Vitest browser mode needs Playwright (new dev dependency, flaky in CI); a fake
  WebGL context proves nothing the scene-graph build does not.
- **Alternatives**: Vitest browser mode; `vi.mock('three')`.

## R12. Simulation loop

- **Decision**: Fixed step `SIM_DT = 1/120 s` with an accumulator (max 8 steps per frame, then
  drop time) and render-state interpolation between the previous and current sim state. Autopilot
  idle timer counts sim time.
- **Rationale**: FR-008 frame-rate independence; bit-identical Flight Model tests.
- **Alternatives**: variable dt (test results depend on step size; tunnelling through terrain
  floor at low fps).

## Starting constants (all in `src/constants.ts`, tuned during implementation)

| Name | Value | Source |
|------|-------|--------|
| `CRUISE_SPEED` | 60 m/s | Q1 |
| `MIN_SPEED` / `MAX_SPEED` | 35 / 110 m/s | FR-007 |
| `BAND_WIDTH` | 3600 m (60 s cruise) | FR-020 |
| `TRANSITION_WIDTH` | 600 m (10 s cruise) | FR-021 |
| `CHUNK_SIZE` | 256 m | Q1 |
| `VIEW_RINGS` | 16 (≈4 km) | Q1 |
| `LOD_RINGS` | [2, 7, 16] → [64, 32, 16] | R2 |
| `CHUNKS_PER_FRAME` | 2 | Q2 |
| `ALPINE_MAX_HEIGHT` / `FOOTHILLS_MAX_HEIGHT` | 1200 / 400 m | Q1 |
| `WATER_LEVEL` | 120 m | Q1 |
| `MIN_ALTITUDE_ABOVE_TERRAIN` | 40 m | FR-006 |
| `MAX_ROLL` / `MAX_PITCH` | 45° / 30° | FR-004 |
| `LEVEL_OUT_TIME` | 2 s | FR-005 |
| `IDLE_TO_AUTOPILOT` | 5 s | FR-026 |
| `AUTOPILOT_BANK` | 12° at 0.1 Hz | FR-026 |
| `CAMERA_OFFSET` | (0, 18, -55) m plane-local | FR-014 |
| `CAMERA_SPRING` / `CAMERA_ROLL_FOLLOW` | 4 /s, 0.3 | Q4 |
| `SUN_ELEVATION` / `SUN_AZIMUTH` | 12° / fixed | FR-022a |
| `SIM_DT` | 1/120 s | R12 |
| `MAX_DPR` | 1.5 | R9 |
| Palette hexes | per FR-022a/c/e/g | spec |
