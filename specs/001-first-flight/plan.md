# Implementation Plan: First Flight

**Branch**: `001-first-flight` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-first-flight/spec.md`

## Summary

A single-page Three.js app: the Plane is airborne on load and steered by pointer offset / touch
drag (Steer Vector) with wheel / pinch Throttle; a spring-damped Chase Camera follows; after 5 s
idle the Autopilot levels and gently banks. Endless terrain streams in fixed-footprint Terrain
Chunks around the Plane, generated on the CPU from one pure `heightAt(x, z, seed)` function and
rendered with one custom shader that does the Pastel Dawn palette, sun-orientation shading,
lavender fog, and lakes (vertices below the water level flattened in the vertex shader). The world
alternates Alpine and Foothills Biomes in parallel bands with parameter-blended transitions.
Everything under `src/sim/` is pure, DOM-free TypeScript tested first in Vitest; `src/render/`
is covered by one smoke test.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true`, ES2022 target
**Primary Dependencies**: `three` (only runtime dependency); dev: `vite`, `vitest`, `typescript`
**Storage**: N/A (Seed from `?seed=` URL query; nothing persisted)
**Testing**: Vitest in Node for `src/sim/**`; one render smoke test that builds the full scene
graph (materials, geometry pool, sky, plane) without a `WebGLRenderer` and asserts nothing throws
(see research R11)
**Target Platform**: evergreen desktop and mobile browsers with WebGL2; static file host
**Project Type**: single-page web app (single Vite project)
**Performance Goals**: 60 fps laptop iGPU, 30 fps mid-range phone; first frame <= 2 s on 4G
**Constraints**: <= 600 KB gzipped JS incl. Three.js; zero steady-state heap allocations in the
frame loop; no binary assets; terrain streamed and culled
**Scale/Scope**: one scene, two Biomes, ~800 resident chunks (Euclidean disc of radius `VIEW_RINGS`, see research R2) across 3 LOD rings, ~15 source files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I Minimum Code | Only `three` at runtime; every module in the layout below serves a shipped behaviour; no module has fewer than two callers or is the only implementation of an interface | PASS (see Project Structure; `constants.ts` is shared by sim and render, the second use) |
| II Performance | Budgets restated in Technical Context; chunk pooling + fixed-step sim + scratch vectors designed for zero-alloc; DPR capped at 1.5; CI bundle-size step | PASS (design); measured numbers land in the implementing PRs |
| III Test-First | Every core mechanic maps to a `src/sim/*` module with a contract in `contracts/`; tasks will be ordered test → impl; render covered by one smoke test | PASS |
| IV Procedural | All geometry, palette, sky from Seed + Biome params; no assets | PASS |
| V One Input | `input.ts` is the only producer of Steer Vector / Throttle; Flight Model takes only those + dt | PASS |
| Tech constraints | TS strict, Vite, Vitest, WebGL2, interaction model per spec | PASS |
| Workflow | CI workflow with typecheck + Vitest + size check is part of this feature (research R10) | PASS |

Post-design re-check (after Phase 1): unchanged, PASS. No Complexity Tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-first-flight/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1-R12 with alternatives
├── data-model.md        # Phase 1: entities and validation rules
├── quickstart.md        # Phase 1: run, test, manual perf check
├── contracts/
│   └── sim.ts           # Phase 1: public TypeScript signatures of src/sim
├── mockups/scenery-moods.html
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
index.html                     # full-bleed canvas + one-line hint element
package.json, tsconfig.json, vite.config.ts, vitest.config.ts
.github/workflows/ci.yml       # typecheck, vitest, build, gzip size gate

src/
├── main.ts                    # bootstrap: seed, renderer, loop (accumulator), resize, hint fade
├── constants.ts               # every tunable number (world scale, envelope, camera, LOD, palette)
├── sim/                       # pure, DOM-free; imports only three/src/math/*
│   ├── seed.ts                # parseSeed(query) -> number; randomSeed()
│   ├── noise.ts               # hash, valueNoise, fbm, domain warp
│   ├── biome.ts               # bandWeight(x, seed), biomeParamsAt(x, seed, out)
│   ├── terrain.ts             # heightAt(x, z, seed), normalAt(...)
│   ├── chunks.ts              # ChunkGrid: wanted set by ring/LOD, diff against resident, pool
│   ├── input.ts               # pointer/touch/wheel/pinch events -> Steer Vector, Throttle
│   ├── flight.ts              # stepFlight(state, input, dt): envelope, floor, speed limits
│   ├── autopilot.ts           # idle timer, level-out, gentle banking; writes a Steer Vector
│   └── camera.ts              # chase camera spring, roll follow, terrain floor clamp
└── render/                    # touches WebGL/DOM; smoke-tested only
    ├── terrainMaterial.ts     # ShaderMaterial: palette, speckle, sun shading, fog, lake flatten
    ├── terrainMesh.ts         # geometry pool per LOD, skirts, fill from heightAt
    ├── sky.ts                 # background quad: gradient + sun disc/halo, shared GLSL gradient
    └── plane.ts               # procedural plane mesh (3 boxes, one material)

tests/
├── sim/                       # one file per src/sim module, Node environment
│   ├── seed.test.ts  noise.test.ts  biome.test.ts  terrain.test.ts  chunks.test.ts
│   ├── input.test.ts  flight.test.ts  autopilot.test.ts  camera.test.ts
│   └── purity.test.ts         # src/sim imports only three/src/math and ../constants
└── render/
    └── smoke.test.ts          # builds the full scene graph in Node, asserts no throw (R11)
```

**Structure Decision**: single Vite project; the `sim/` vs `render/` split is the test seam
(round-1 Q7). `sim/` may import `three/src/math/*` only; a Vitest test
(`tests/sim/purity.test.ts`) asserts no `sim/` file imports from `three` other than math, DOM
globals, or `render/`.

## Complexity Tracking

No constitution violations to justify.
