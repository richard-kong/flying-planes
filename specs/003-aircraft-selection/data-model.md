# Data Model: Aircraft Selection

**Feature**: 003-aircraft-selection | **Date**: 2026-09-23

All types below are additions or changes to existing pure modules unless noted as render code.
Type-level contract: [contracts/aircraft.ts](./contracts/aircraft.ts).

## AircraftType (pure, `src/sim/aircraft.ts`)

| Field | Type | Notes |
|---|---|---|
| `id` | `"helicopter" \| "light" \| "fighter" \| "airliner" \| "biplane" \| "glider"` | Stable identity used by session state, snapshot, DOM radios and tests. |
| `name` | string | Card title: Helicopter, Light Plane, Fighter Jet, Passenger Jet, Biplane, Glider. |
| `description` | string | One short card sentence. |
| `spinners` | readonly `SpinnerSpec[]` | Empty for fighter, airliner, glider. |
| `footprint` | `{ length: number; span: number }` metres | Natural airframe dimensions before normalisation, used by the SC-002 headless check. |

`SpinnerSpec { name: "propeller" | "mainRotor" | "tailRotor"; axis: "x" | "y" | "z"; rate: number }`
where `rate` is radians per second of simulated time.

Invariants:

- Exactly six records, in chooser order `helicopter, light, fighter, airliner, biplane, glider`.
- `DEFAULT_AIRCRAFT = "light"`.
- `max(length, span)` of every record lies within ±20% of the Light Plane after normalisation to
  the shared footprint, i.e. the normalisation ratio uses `max(length, span)` so the check is
  trivially true for the largest dimension and asserts the other dimension does not collapse
  below 35% of the footprint (guards against a thread-like glider or a stubby airliner).

## Aircraft (render code, `src/render/aircraft.ts`)

| Field | Type | Notes |
|---|---|---|
| `type` | `AircraftTypeId` | |
| `group` | `Group` | Normalised to `PLANE_FOOTPRINT` (5.12 m), centred on the airframe box, forward +Z, up +Y. |
| `spinners` | `Object3D[]` | Pivot groups matching `AircraftType.spinners` order; rotation is written by `main.ts`. |

`buildAircraft(type: AircraftType, materials): Aircraft` is called six times at boot. `disposeAircraft`
disposes geometries and materials (used by browser resource tests only; the app never rebuilds).

## ChooserState (pure, extended)

| Field | Change |
|---|---|
| `selection: ThemeId` | unchanged |
| `aircraftSelection: AircraftTypeId` | new; pending aircraft card, `"light"` at boot |
| `active: ThemeId \| null` | unchanged |
| `activeAircraft: AircraftTypeId \| null` | new; committed at `preparationReady`, restored at `restoreReady` |
| other fields | unchanged |

Transition deltas (see [contracts/lifecycle-delta.md](./contracts/lifecycle-delta.md)):

- `selectAircraft(s, id)`: only in `choosing`, mirrors `selectTheme`.
- `pressFly`: request carries `aircraftType: s.aircraftSelection`; same-Theme-different-aircraft
  still bumps `generation` and enters `preparing`.
- `preparationReady`: sets `activeAircraft = aircraftSelection`.
- `openChooser` / `pressCancel` / `restoreReady`: `aircraftSelection = activeAircraft ?? aircraftSelection`.

## PreparationRequest (pure, extended)

Adds `aircraftType: AircraftTypeId`. Preparation itself is unchanged (terrain only); `main.ts`
reads the field at commit to choose the visible `Aircraft`.

## FlightSnapshot (pure, extended)

| Field | Type | Notes |
|---|---|---|
| `aircraftType` | `AircraftTypeId` | Restored on Cancel with the Theme. |
| `spinPhase` | number | Radians; the master phase all spinners derive from. Copied at pause, written back at resume. |

The snapshot stays flat and allocated once; both fields are scalars.

## PreviewSet (render code, extended)

`cards: (ThemeCard | AircraftCard)[]` where

- `ThemeCard { kind: "theme"; themeId; status; url }` (existing card renamed by discriminator)
- `AircraftCard { kind: "aircraft"; aircraftType; status; url }`

Nine cards; `done` is true only when every card is `ready`. `renderNextPreview` dispatches on
`kind`; aircraft cards render the boot-built `Aircraft.group` into the shared 256×144 target with
the aircraft lights and a fixed sky gradient, then follow the existing readback/decode path.

## Chooser DOM (render code, `index.html` + `src/ui/chooser.ts`)

- Two `role="radiogroup"` sections inside `#chooser`: `aria-label="World"` (existing) and
  `aria-label="Aircraft"` (new, six `.card` labels with `input[name=aircraft]`).
- `ChooserCallbacks.onSelectAircraft(id)` added; `ChooserHandle.setCardImage` accepts either
  card key (`{ kind: "theme", id } | { kind: "aircraft", id }`).
- `#change-theme` button text becomes "Change flight".

## Lighting (render code, `src/render/aircraft.ts`)

`AircraftLights { hemi: HemisphereLight; sun: DirectionalLight }` created once; `applyThemeToLights(lights, theme)`
copies the Theme's sky zenith/horizon colours and sun direction/colour at each world commit or restore.
