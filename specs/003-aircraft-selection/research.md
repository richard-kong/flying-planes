# Research: Aircraft Selection

**Feature**: 003-aircraft-selection | **Date**: 2026-09-23

Each entry records a decision, the reasoning, and the alternatives that were considered.
Decisions marked *owner* came from the planning interview or the Lavish design review.

## 1. Visual direction per aircraft (owner, Lavish review of 30 candidates)

| Type | Chosen | Study ID | Defining traits kept from the candidate |
|---|---|---|---|
| Helicopter | Executive | H3 | Teardrop cabin, tapered enclosed boom, shrouded (fenestron-style) tail rotor, white body with blue band and boom stripe, two-blade main rotor, slim skids. |
| Light Plane | Classic trainer | L1 | Strut-braced high wing, tricycle gear, swept fin, white body with red fin and cheatline, two-blade nose propeller. |
| Fighter Jet | Interceptor | F5 | Long pointed nose, small mid-set delta-ish wings, single tall fin, ventral and side intakes, single exhaust, light grey body with orange fin and cheatline. |
| Passenger Jet | Narrow-body | P1 | Long round fuselage, wraparound cockpit glazing, one window row, swept low wings with winglets, two underwing nacelles, conventional tail, white body with blue fin and cheatline. |
| Biplane | Sport | B4 | Two staggered equal-span wings with N-struts and cabane, open single cockpit with windscreen, radial-style nose, two-blade prop, wheels, cream body with red fin. |
| Glider | Vintage | G2 | Long gently tapered wings with modest dihedral, slim pod-and-boom fuselage, low bubble canopy, conventional (not T) tail, cream body with brown trim. |

Rationale: the six candidates were the reviewer's picks from five per type; the remaining
24 are discarded (Principle I). The study source (`src/render/aircraft-prototype.ts`,
`aircraft-prototype.html`, `scripts/capture-aircraft-prototypes.ts`,
`scripts/build-aircraft-review.ts`) stays only until the production aircraft land; the
implementation PR that adds `src/render/aircraft.ts` MUST delete it (spec FR-010 requires no
shipped assets; the constitution forbids code without a shipped behaviour).

Whole-set answers from the same review: **keep the current in-flight size** (the 8 m box plane
at scale 0.64, i.e. ~5 m footprint) and **soft Phong shading**, not flat-facet or toon.

Alternatives rejected: photoreal/PBR materials (would want textures, banned by Principle IV);
importing glTF models (banned); one shared "generic plane" with swapped parts (fails SC-001
recognisability).

## 2. Geometry technique: lofted cross-sections + primitives

Decision: fuselages, booms, nacelles and painted stripes are lofted from superellipse rings;
wings and fins are lofted airfoil rings with taper, sweep and dihedral; struts, gear, masts and
axles are cylinders; wheels are cylinders; canopies are half ellipsoids/spheres; propellers and
rotors are thin boxes on pivot groups. This is what the study already uses and it produces
recognisable shapes at roughly 2–6 k triangles per aircraft.

Rationale: no runtime dependency beyond Three.js, deterministic, diff-reviewable, and cheap to
build once at load. `BufferGeometry` built by `loft()` with computed vertex normals gives the
soft Phong look the owner chose. `DoubleSide` materials avoid backface holes on thin lofts.

Alternatives: `LatheGeometry` (round only, no superellipse belly), `ExtrudeGeometry` with
`Shape` (higher vertex counts, uneven normals), CSG (no dependency available).

## 3. Materials and lighting

Decision: each aircraft uses one small material set (`body`, `accent`, `trim`, `glass`,
`metal`, `rubber`, `blade`) of `MeshPhongMaterial`/`MeshLambertMaterial`. The scene gains one
`HemisphereLight` (sky/ground colours from the active Theme sky) and one `DirectionalLight`
(Theme sun direction/colour) so the aircraft reads in all three Themes. Terrain and sky keep
their own shaders and are unaffected by these lights.

Rationale: the current plane is `MeshBasicMaterial` (unlit, flat purple) which is why it reads
as boxes. Phong under two lights is the cheapest "believable" shading in Three.js and needs no
shadow maps. Lights are created once at boot and updated (colour/direction copy) at Theme
commit, never per frame.

Alternatives: `MeshStandardMaterial` (PBR needs an environment map for good results and costs
more per fragment on phones); baked vertex colours (no specular highlight on glass/metal).

## 4. Footprint normalisation

Decision: `buildAircraft(type)` builds the model at its natural proportions, measures the
airframe bounding box **excluding rotor/propeller discs**, and scales the group so
`max(width, length)` equals the current plane's footprint (8 × 0.64 = 5.12 m). Helicopter rotor
diameter is additionally capped at 1.07 × footprint so the disc stays inside the card frame.
Spec SC-002 (largest span within ±20% of the Light Plane) is checked by a headless test on the
pure geometry description, not by eye.

Alternatives: true relative sizes (airliner 30 m would dominate the view and defeat the chase
camera framing — rejected by owner); scaling by wing span only (glider becomes a thread).

## 5. Rotor and propeller animation

Decision: `Aircraft` exposes `spinners: Object3D[]` with a per-spinner axis and speed
(rad/s). `main.ts` advances one `spinPhase` per simulation step from the fixed step
(`dt`), multiplies by each spinner's ratio, and writes `rotation` on the pivot — no
allocation. The phase is stored in `FlightSnapshot.spinPhase` so Cancel resumes from the
same blade position and pausing does not catch up (FR-006). Speed is constant, independent of
Throttle (spec: appearance only; flight speed already communicates Throttle).

Alternatives: `THREE.AnimationMixer` (allocates, clock-driven, would run while paused);
Throttle-proportional RPM (nice, but adds a coupling the spec explicitly excludes).

## 6. Aircraft in session state and snapshot

Decision: `AircraftType` becomes a second axis of `ChooserState`: `aircraftSelection` (pending)
and `activeAircraft` (committed). `PreparationRequest` carries `aircraftType`; `FlightSnapshot`
gains `aircraftType` and `spinPhase`. Transitions are otherwise unchanged: Fly always bumps the
generation and prepares a fresh Flight even when only the aircraft differs (FR-014); Cancel
restores the snapshot's aircraft.

Aircraft swap is purely a scene-graph operation: `main.ts` keeps all six built `Group`s from
boot (built once, ~30 k triangles total, well under budget) and sets `visible` on the active
one at commit/restore. No preparation job is needed for the aircraft itself, so `preparing`
remains terrain-driven.

Alternatives: build the aircraft lazily at Fly (adds work inside the launch budget and a
possible frame hitch); a separate aircraft preparation phase (unneeded complexity).

## 7. Preview cards for aircraft

Decision: extend `previews.ts` with a second card kind. Aircraft cards render the actual built
`Group` against a fixed neutral sky gradient (Nature sky colours) with the two aircraft lights,
using the three-quarter camera from the study (bounding-sphere fit, 30° FOV, direction
(−0.6, 0.34, 0.72)). They share the existing 256×144 render target, sequential scheduling,
readback → Blob → decoded `<img>`, retry and disposal rules. `PreviewSet.cards` becomes a
discriminated union `ThemeCard | AircraftCard`.

Rationale: reuses the proven readback pipeline; nine cards at 256×144 fit the two-second
startup budget (the study renders a 640×360 card in <10 ms under SwiftShader). The chooser
opens when **all nine** cards are ready or failed (spec edge case: never a partial chooser).

Alternatives: `<canvas>` per card with live WebGL (nine contexts, banned by browsers); CSS-only
silhouettes (not the actual design, fails FR-010).

## 8. Chooser layout

Decision (interview default, owner skipped the question): one scrolling dialog with two labelled
`radiogroup` sections, **World** (3 cards) then **Aircraft** (6 cards), and one Fly/Cancel bar.
Aircraft cards use the same `.card` markup/CSS with a `name="aircraft"` radio group. The
in-flight button text changes from "Change theme" to "Change flight"; its `id` stays
`change-theme` to keep browser tests stable, with the label change asserted.

Alternatives: tabs/steps (hides one choice), a 3×3 grid (cramped on phones).

## 9. Testing strategy

- Headless (Vitest/Node): `tests/sim/session.test.ts` extended for the aircraft axis; new
  `tests/sim/aircraft.test.ts` on the pure `AIRCRAFT` records (six IDs, unique names, default
  `light`, footprint tolerance from the geometry description, spinner metadata present for
  helicopter/light/biplane and absent for the rest).
- Geometry builders are render code (Three.js `Group`s) and are covered by the existing WebGL
  smoke plus a new browser scenario: for each of six aircraft × three Themes, Fly, then assert
  the aircraft is visible and inside the viewport (FR-011 framing) and that `spinPhase` advances
  during flight and holds while the chooser is open.
- Bundle size check (`npm run size`) is the payload gate; the geometry code is expected to add
  well under 20 KB gzipped.

## 10. Removal ledger for the implementation PR

- Delete `src/render/plane.ts` (replaced by `src/render/aircraft.ts`).
- Delete `src/render/aircraft-prototype.ts`, `aircraft-prototype.html`,
  `scripts/capture-aircraft-prototypes.ts`, `scripts/build-aircraft-review.ts` once the six
  production builders are checked in.
