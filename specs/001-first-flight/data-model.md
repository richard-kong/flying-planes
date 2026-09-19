# Data Model: First Flight

All entities are plain mutable objects preallocated once and updated in place (zero-alloc hot
loop). Vectors/quaternions are `three/src/math` types. Units: metres, seconds, radians.

## Seed

| Field | Type | Rules |
|-------|------|-------|
| `seed` | `number` (uint32) | From `?seed=<whole number>` if present and finite (FR-018); otherwise `randomSeed()` and the URL is updated via `history.replaceState` so the address bar can be shared. |

## SteerVector / Throttle (input)

| Field | Type | Rules |
|-------|------|-------|
| `steer.x` | `number` ∈ [-1, 1] | Right positive. Pointer: `(clientX - w/2) / (w/2)`; touch: drag offset / `TOUCH_FULL_DEFLECTION_PX` (FR-009, FR-010). |
| `steer.y` | `number` ∈ [-1, 1] | Up on screen = -1 = nose down; down on screen = +1 = nose up (US1 scenario 3). |
| `throttle` | `number` ∈ [0, 1] | Wheel: ±`THROTTLE_STEP` per notch; pinch: scale delta (FR-011). Initial 0.5 (cruise). |
| `lastInputTime` | `number` | Sim time of last non-zero steer change or throttle change; feeds Autopilot (FR-026, FR-027). |
| `active` | `boolean` | False when pointer leaves the window or touch ends → steer resets to (0, 0) (FR-012). |

## PlaneState (Flight Model)

| Field | Type | Rules |
|-------|------|-------|
| `position` | `Vector3` | `y >= heightAt(x, z) + MIN_ALTITUDE_ABOVE_TERRAIN` after every step (FR-006), enforced by easing, not clamping. |
| `orientation` | `Quaternion` | Derived from `heading`, `pitch`, `roll`. |
| `heading` | `number` | Radians; rate = `roll * TURN_RATE_PER_ROLL` (FR-003). |
| `pitch` | `number` | ∈ [-MAX_PITCH, MAX_PITCH] (FR-004). |
| `roll` | `number` | ∈ [-MAX_ROLL, MAX_ROLL] (FR-004). Decays to 0 within `LEVEL_OUT_TIME` at zero steer (FR-005). |
| `speed` | `number` | ∈ [MIN_SPEED, MAX_SPEED], approaches `lerp(MIN, MAX, throttle)` (FR-007). |

State transitions: `stepFlight` is a pure in-place function of `(state, input, dt)`; there is no
other writer. `prev` copy kept for render interpolation.

## AutopilotState

| Field | Type | Rules |
|-------|------|-------|
| `engaged` | `boolean` | `simTime - lastInputTime >= IDLE_TO_AUTOPILOT` (FR-026); any input → false immediately (FR-027). |
| `engagedAt` | `number` | Sim time at which `engaged` last became true; banking starts only once `simTime - engagedAt >= LEVEL_OUT_TIME` (level out first, FR-026). |
| `phase` | `number` | Advances at `AUTOPILOT_BANK_HZ`; produces steer `x = AUTOPILOT_BANK_AMPL * sin(phase)`, `y = 0`. |

Autopilot writes a SteerVector, so FR-028 holds by construction (it goes through the same
Flight Model limits).

## CameraPose (Chase Camera)

| Field | Type | Rules |
|-------|------|-------|
| `position` | `Vector3` | Springs toward `plane.position + plane.orientation * CAMERA_OFFSET`; `y >= heightAt(x, z) + CAMERA_MIN_CLEARANCE` (FR-015). |
| `target` | `Vector3` | Plane position + `CAMERA_LOOK_AHEAD` along heading. |
| `up` | `Vector3` | World up rotated by `roll * CAMERA_ROLL_FOLLOW` about the view axis. |

## BiomeParams

One struct per Biome plus a blended `out` struct (FR-019, FR-021).

| Field | Alpine | Foothills | Blended by |
|-------|--------|-----------|-----------|
| `amplitude` | 1200 | 400 | `bandWeight` |
| `baseFrequency` | 1/1800 | 1/1100 | |
| `ridgeSharpness` | 0.8 | 0.15 | |
| `heightOffset` | +40 | -60 (more terrain under water) | |
| `snowHeight` | 700 | 450 (above max → rare) | |
| `forestTop` / `forestBottom` | 520 / 220 | 380 / 140 | |
| `rockSlope` (cos) | 0.75 | 0.85 | |
| `fogDensity` | 1.0 | 0.8 | |

`bandWeight(x, seed)`: bands along the X axis, offset by `seed`-derived phase; `w = 0` at Alpine
band centres, `1` at Foothills, smoothstep across `TRANSITION_WIDTH` (FR-020).

## TerrainChunk

| Field | Type | Rules |
|-------|------|-------|
| `cx`, `cz` | `int` | Chunk grid coordinate; world origin `(cx * CHUNK_SIZE, cz * CHUNK_SIZE)`. |
| `lod` | `0 | 1 | 2` | From ring distance to the Plane's chunk (R2). |
| `geometry` | pooled `BufferGeometry` (render-side only) | Position + normal + `biomeParams` attributes filled from `heightAt`; skirt vertices along the border. |
| `state` | `wanted | resident | free` | `ChunkGrid.update(planeX, planeZ)` diffs wanted vs resident: releases chunks outside `VIEW_RINGS` to the pool, queues missing nearest-first, fills ≤ `CHUNKS_PER_FRAME` per frame (FR-016, FR-024). |

Determinism (FR-017): `heightAt` and chunk fill depend only on `(x, z, seed)`; the `ChunkGrid`
wanted set depends only on the Plane chunk coordinate.

## Sun / Sky (constants, not state)

`SUN_DIRECTION` unit vector from `SUN_ELEVATION` (12°) and `SUN_AZIMUTH`; palette hexes per
FR-022a/c/e/g. Shared by `sky.ts` and `terrainMaterial.ts` as uniforms.
