# Phase 1 Data Model: Landscape Themes

**Feature**: 002-landscape-themes | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

All types below are plain, immutable-where-possible data. Everything under `src/sim/` stays pure:
no DOM, no WebGL, no Three.js scene objects in inputs or outputs. Existing Three.js math types
(`Vector3`, `Quaternion`) remain permitted, enforced by
`tests/sim/purity.test.ts`.

## Theme

A complete world preset. Three records exist: `nature`, `alien`, `arctic`.

| Field | Type | Notes |
|---|---|---|
| `id` | `"nature" \| "alien" \| "arctic"` | Stable identifier; also the chooser card key. |
| `name` | `string` | Display name. |
| `description` | `string` | One-line chooser copy. |
| `bands` | `readonly [Readonly<BiomeParams>, Readonly<BiomeParams>]` | The two regional parameter sets the existing band blend interpolates between (today's Alpine/Foothills pair, per Theme). |
| `shaping` | `ThemeShaping` | Post-ridge shaping controls; Alien uses the identity configuration and bypasses the transform. |
| `surface` | `ThemeSurface` | Lake/ice plane level and kind. |
| `palette` | `ThemePalette` | Terrain colour ramp, shoreline, forest, rock, snow/ice tints. |
| `sky` | `ThemeSky` | Three gradient stops, sun disc/halo colour and direction. |
| `fog` | `ThemeFog` | Colour and density multiplier applied over the existing per-band density. |
| `lighting` | `ThemeLighting` | Ambient/key strength, warm/cool tints, surface specular strength and shininess; uses the sky's sun direction. |
| `preview` | `ThemePreview` | Camera placement for the static card; all use the shared `PREVIEW_SEED`. |

The existing `BiomeParams` shape contains `amplitude`, `baseFrequency`,
`ridgeSharpness`, `heightOffset`, `snowHeight`, `forestTop`, `forestBottom`, `rockSlope`,
`fogDensity`. Alien's two records reproduce today's constants exactly.

`ThemeShaping`: `{ warpStrength, detailAmplitude, valleyWidth, valleyFlatness }`.
`valleyWidth`/`valleyFlatness` drive Arctic's broad glacial valleys. For the existing normalised
ridge/round blend `s`, blend toward `smoothstep(valleyWidth, 1, s)` by `valleyFlatness`, before
height scaling and detail. Test this continuous, monotonic shaping against broad valley and ridge
profiles; tune Arctic's relief, detail, and width together. Alien's zero shaping strength bypasses
the transform so its original arithmetic is unchanged. Nature also uses the bypass with gentler
terrain parameters.

`ThemeSurface`: `{ level: number, kind: "water" | "ice" }`. `level` replaces the global
`WATER_LEVEL` in flight soft-floor and camera-clearance maths.

**Validation**: All numbers finite; amplitudes/frequencies positive; `ridgeSharpness` and
`valleyFlatness` in `[0, 1]`; `valleyWidth` in `[0, 1)`; warp/detail nonnegative; fog density
positive; altitude thresholds ordered. The chosen surface level must produce both land and
surface regions in deterministic fixtures; a theoretical amplitude bound alone does not prove this.
Nature and Alien retain forest blending; Arctic has `forestStrength = 0`.
Palette, fog, and sky colours are `0xRRGGBB` numbers; lighting tints are multipliers.
The render adapter retains the existing material/sky colour conversion rules
([research §8](./research.md#8-preview-cards)). Records and nested fields are read-only.

## WorldContext

`{ theme: Theme, seed: number }`. Threaded through `biomeParamsAt`, `heightAt`, `normalAt`,
`surfaceHeightAt`, `fillChunk`, `createPlaneState`, `stepFlight`, and `stepCamera`. It is the only
new parameter those functions gain; terrain output is a pure function of
`(theme.id, seed, x, z)` for a fixed release's preset values. Hot-path functions allocate nothing.
Creation and snapshot capture occur outside active flight.

## Seed

A non-negative integer in `[0, 4294967295]`. Keep the current `parseSeed` query rules; invalid or
missing values use `randomSeed` once at page boot. Chooser selection, Fly, retry, and Cancel never
replace the page Seed. `PREVIEW_SEED` is a separate fixed constant shared by all cards.

## Flight

The active aggregate combines a `WorldContext`, current/previous plane and camera state,
simulation clock/interpolation phase, `FlightInput`, `AutopilotState`, and hint state. Only the
`flying` phase advances it. Fly creates a fresh aggregate at the normal start, whereas Cancel
restores its snapshot. Scene meshes and GPU ownership stay in the rendering adapter.

## Biome

Unchanged concept: regional variation *within* a Theme, produced by the existing band hash, band
phase, and interpolation. A Theme supplies the two endpoint parameter sets; the Biome blend
between them is Theme-independent code.

## ChooserState

The chooser's observable state, a discriminated union on `phase`:

| Phase | Payload | Meaning |
|---|---|---|
| `booting` | `generation`, `selection = nature` | Nature background and previews loading; no prior Flight or Cancel. |
| `choosing` | `selection`, `snapshot?`, `priorTerrainResident`, `error?` | Cards visible; Cancel offered only with a snapshot. Error identifies `startup`, `launch`, or `restore` so Retry selects the correct operation. |
| `preparing` | `selection`, `generation` | One world being built; Fly and selection changes are blocked. |
| `flying` | `theme`, `seed` | World committed and controllable. |
| `restoring` | `generation` | Cancel is rebuilding the snapshot's world; simulation stays paused. |

Primary transitions (guards, retries, and error actions are in the
[lifecycle contract](./contracts/lifecycle.md)):

```text
booting --ready--> choosing(nature, no snapshot)
booting --failure--> choosing(startup error)
choosing --Fly--> preparing
choosing --Cancel, prior terrain resident--> flying (snapshot resumed)
choosing --Cancel, prior terrain released--> restoring
preparing --commit(current generation)--> flying
preparing --failure--> choosing(error, selection retained)
preparing --Cancel, snapshot exists--> restoring
preparing --Cancel, no snapshot--> (not offered)
flying --Change theme--> choosing (flight frozen, snapshot taken)
restoring --restored--> flying (snapshot resumed)
restoring --failure--> choosing(error, snapshot retained, retry or fresh flight)
```

Invariants:

- Exactly one `generation` is live. A stale completion cannot write into shared buffers or dispose
  a newer job's resources. Shared buffers are reused only after cancellation is acknowledged.
- `flying` is entered only by an atomic commit of terrain, surfaces, sky, and camera together.
- `preparing` and `restoring` ignore duplicate Fly presses and selection changes.
- Selecting a card in `choosing` mutates `selection` only: never the paused world, never previews.

## FlightSnapshot

Everything needed to resume a paused flight exactly, while its terrain is released. Small, flat,
and allocated once.

| Field | Purpose |
|---|---|
| `themeId`, `seed` | Which world to rebuild. |
| `plane` | Complete current `PlaneState`: position, orientation quaternion, heading, pitch, roll, speed. Velocity is derived; Throttle lives in input. |
| `planePrev` | Previous-step render position and quaternion for interpolation. |
| `cameraPose`, `cameraPosePrev` | Both chase-camera poses. |
| `simTime`, `accumulator` | Simulation clock and interpolation phase; wall-clock baseline is reset on resume so menu time is never replayed. |
| `input` | Saved Throttle and flight-activity time/sequence used by Autopilot; physical gestures and queued intents are discarded. |
| `autopilot` | Engaged flag, engagement time, last-seen-input state. |
| `hint` | `inputSeen`, `hidden`, and fade progress (the CSS transition must be frozen too). |
| `chunkManifest` | Bounded logical chunk/LOD list and morph progress for visible terrain. Rebuild the saved presentation without retaining GPU buffers. |

On resume: gestures are ended, steering neutralised, queued throttle cleared, and fresh pointer or
touch events are required before control resumes — without resetting idle history, so Autopilot
does not spuriously re-engage. These input resets deliberately do not alter saved attitude or
speed.

## PreparationJob

| Field | Purpose |
|---|---|
| `generation` | Monotonic token; the cancellation and staleness key. |
| `themeId`, `seed` | Target world. |
| `kind` | `startup` \| `launch` \| `restore`. |
| `phase` | `terrain` \| `previews` (startup only) \| `commit`. |
| `deadline` | Per-slice time budget so preparation never blocks a frame. |
| `readiness` | Visible coverage through the fog envelope, safe framing, surface and sky applied. |

## ThemePreviewCard

| Field | Purpose |
|---|---|
| `themeId` | Card key. |
| `imageUrl` | Object URL from `toBlob()`; revoked when permanently discarded. |
| `status` | `pending` \| `ready` \| `failed` (failure shows retry feedback; text-only fallback is degraded, not successful startup). |

Generated once per page visit, sequentially, from a single reusable 256×144 RGBA8 target that is
released before flight starts. Null Blob, image decode, or readback failure is recoverable.
Reopening the chooser reuses successful cached images; only a failed card is regenerated on retry.

## Relationships

```text
Theme 1 ── 2 Biome endpoint parameter sets (within the Theme)
Theme 1 ── 1 ThemePreviewCard (per page visit)
WorldContext = Theme + Seed  ──drives──>  terrain, surfaces, sky, fog, lighting
ChooserState ──owns──> PreparationJob (0..1)  and  FlightSnapshot (0..1)
FlightSnapshot ── references ──> Theme + Seed
```
