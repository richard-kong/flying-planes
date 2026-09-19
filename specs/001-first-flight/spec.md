# Feature Specification: First Flight

**Feature Branch**: `001-first-flight`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "A web app of a plane flying over different visually stunning
landscapes, flown with mouse movements and gestures. First feature: fly the Plane over endless
terrain that alternates between mountain and city Biomes, with a Chase Camera and Autopilot on
idle."

**Revision 2026-09-19**: after a visual mock-up review the City Biome was removed from this
feature; the world now alternates between two Mountain Biomes (Alpine and Foothills) under a
single Pastel Dawn lighting mood (see Clarifications, "Visual mock-up review").

## Clarifications

### Session 2026-09-19

- Q: How are Mountain and City regions laid out across the world so that they alternate no matter
  which way the Plane flies? → A: Parallel bands across one world axis, each about 60 s of cruise
  flight wide, with a Biome Transition zone of about 10 s of flight at each boundary; flying
  parallel to the bands stays in one Biome.
- Q: How does the sun behave, and does it cast shadows? → A: Sun fixed in the world at a low
  golden-hour elevation (about 10 degrees above the horizon), visible as a disc with a bright halo;
  terrain is shaded by its angle to the sun, with no cast shadows.
- Q: What light does the City give off, beyond the glowing windows already specified? → A:
  Window grids with a Seed-determined fraction of dark windows, plus static rows of warm street
  lights along both edges of every road, brighter and denser toward the band centre; no
  animation and no bloom. *(Superseded: the City Biome was removed in the visual mock-up
  review below.)*
- Q: Which natural scenery should Mountain valleys contain beyond the altitude colour palette and
  fog? → A: Still lakes wherever terrain dips below a fixed water level (flat, sky-tinted, soft
  shoreline, no waves), plus a dark-green forest colour band with a coarse speckle between the
  vegetation and rock altitudes (colour only, no tree geometry).
- Q: What visual style should the terrain surface have, and how much detail should stay visible
  near versus far from the Plane? → A: Smooth-shaded terrain with fine detail (small ridges and
  gullies) near the Plane, fading to smooth silhouettes in the distance.

### Visual mock-up review 2026-09-19

Four rendered mood variants (A Alpenglow, B Amber Haze, C Twilight Blue, D Pastel Dawn) were
reviewed side by side in mountain, transition, and city views (artifact:
`specs/001-first-flight/mockups/scenery-moods.html`, renders live with WebGL). Decisions:

- Q: Which overall mood? → A: **D Pastel Dawn**: high-key and soft. Pale gold sun about 12
  degrees above the horizon, milky sky (peach horizon through soft pink to a pale blue zenith),
  lavender fog, gentle contrast.
- Q: Which mountain palette? → A: Borrowed from **C Twilight Blue**: cool dusky palette of
  pink-tinted snow, violet-grey rock, deep blue-green forest, muted sage valleys, so the terrain
  reads cool against the warm pastel sky.
- Q: Which lake treatment? → A: Borrowed from **B Amber Haze**: lakes are strongly sun-tinted,
  reading as flat pools of warm gold light in the valley floors rather than as sky-blue water.
- Q: What about the City? → A: **Removed** from this feature (the rendered buildings did not
  meet the visual bar). Biome Regions and Biome Transitions stay, and now alternate between two
  Mountain Biomes: **Alpine** (tall snow-capped peaks, sparse lakes) and **Foothills** (lower
  rounded green hills, broad valleys, frequent lakes). City is deferred to a later feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Steer the Plane with the pointer (Priority: P1)

A visitor opens the page and, without clicking anything, is already flying. Moving the mouse away
from the centre of the screen banks and pitches the Plane toward that direction; moving it back
to the centre levels the Plane. On a phone, dragging a finger does the same. The Plane never
crashes: flying toward the ground eases the Plane back up to a minimum height above the terrain.

**Why this priority**: This is the product. Without a Plane that responds to the pointer there is
nothing to look at.

**Independent Test**: Load the page on a desktop browser with a mouse and on a phone; steer the
Plane in all four directions and toward the ground. Delivers a controllable Plane over terrain.

**Acceptance Scenarios**:

1. **Given** the page has loaded, **When** the visitor does nothing, **Then** the Plane is
   already airborne and moving forward over terrain within 2 seconds of navigation.
2. **Given** the pointer is at the screen centre, **When** the visitor moves it to the right
   half of the screen, **Then** the Plane rolls right and turns right; the further from centre,
   the steeper the roll, up to the roll limit.
3. **Given** the pointer is at the screen centre, **When** the visitor moves it toward the top
   of the screen, **Then** the Plane pitches down (nose toward the ground), and toward the bottom
   pitches up.
4. **Given** the Plane is banked, **When** the pointer returns to the centre, **Then** the Plane
   levels out within 2 seconds and flies straight.
5. **Given** a touch device, **When** the visitor drags one finger, **Then** the drag offset
   from its start point steers exactly as the mouse offset from centre does; lifting the finger
   is equivalent to returning the pointer to centre.
6. **Given** the Plane is descending toward terrain, **When** it reaches the minimum height
   above the ground, **Then** it stops descending and is eased upward until above the minimum;
   there is no crash, stop, or restart.

---

### User Story 2 - Fly over endless alpine peaks and green foothills (Priority: P1)

As the Plane flies, terrain keeps appearing ahead and disappearing behind, in every direction,
forever. The world is striped into parallel bands that alternate between two Biomes: Alpine,
tall snow-capped peaks with violet-grey rock and fog-filled valleys, and Foothills, lower rounded
green hills with broad valleys dotted with still, gold-lit lakes. Both sit under the same soft
pastel dawn sky. Between the two the landscape blends over a stretch of flight rather than
switching abruptly. Each visit shows a different world, but the same `?seed=` in the address bar
always shows the same world.

**Why this priority**: Equal to Story 1; the landscape is the reason to fly. Two Biomes prove
the Biome mechanic from day one.

**Independent Test**: Fly straight for several minutes; observe terrain never runs out, the
Biome alternates Alpine -> Foothills -> Alpine, and the transition is gradual. Reload with the
same `?seed=` and observe identical terrain at the start position.

**Acceptance Scenarios**:

1. **Given** any heading, **When** the Plane flies for 5 minutes at maximum Throttle, **Then**
   terrain is always present beneath and ahead of the Plane with no visible gaps or edges;
   ground near the Plane shows small ridges and gullies while distant ridgelines are smooth,
   with no visible pop as terrain approaches.
2. **Given** the Plane is over an Alpine region, **When** it flies across the band axis,
   **Then** it enters a Foothills region, and later another Alpine region, with each region long
   enough to be experienced as a place rather than a flicker; **When** it flies parallel to the
   bands, **Then** it stays in the same Biome indefinitely.
3. **Given** the Plane crosses from Alpine to Foothills, **When** the visitor watches the
   boundary, **Then** peak height, ground palette, fog, and lake frequency blend over a fixed
   stretch of flight rather than changing in a single frame.
4. **Given** an Alpine region, **Then** terrain colour varies by altitude (pink-tinted snow on
   peaks, violet-grey rock on slopes, a speckled deep blue-green forest band below the rock,
   muted sage vegetation in valleys), the few valley floors that dip below the water level hold
   flat still lakes glowing with the sun's warm gold, and valleys hold lavender fog.
   **When** the Plane turns toward the sun, **Then** slopes facing the Plane darken and the sun
   disc and halo come into view; **When** it turns away, **Then** facing slopes brighten; no
   cast shadows appear in either case.
5. **Given** a Foothills region, **Then** the terrain is lower and rounded with broad valleys,
   snow is absent or confined to the very highest tops, the forest and vegetation bands dominate
   the palette, and lakes are frequent and large; the sky, sun, and fog colour are the same as in
   Alpine regions.
6. **Given** two page loads with the same `?seed=` value, **Then** the terrain and lakes at the
   starting position are identical; **Given** two loads with no `?seed=`, **Then** the worlds
   differ.

---

### User Story 3 - Control speed (Priority: P2)

The visitor scrolls the mouse wheel (desktop) or pinches (touch) to change speed between a slow
cruise and a fast dash. Speed changes are smooth, and the Plane never stops or reverses.

**Why this priority**: Makes the flyover feel controllable and lets the visitor linger over
views, but the app is enjoyable at a fixed cruise speed without it.

**Independent Test**: Scroll up/down and pinch in/out; observe speed rising and falling between
the limits, never stopping.

**Acceptance Scenarios**:

1. **Given** the Plane is at cruise speed, **When** the visitor scrolls forward (or pinches
   out), **Then** speed increases smoothly up to the maximum.
2. **Given** the Plane is at maximum speed, **When** the visitor scrolls back (or pinches in)
   repeatedly, **Then** speed decreases smoothly to the minimum and no further; the Plane never
   stops or flies backward.

---

### User Story 4 - Watch it fly itself (Priority: P2)

When the visitor stops touching the mouse or screen for a few seconds, the Plane levels out and
begins gently banking left and right on its own, so an untouched page still looks alive. Any new
input takes back control instantly.

**Why this priority**: The page will often sit untouched (demo, second monitor, kiosk); it must
still be a good view. Not needed for the core experience of flying.

**Independent Test**: Leave the page alone for 10 seconds; observe level-out then gentle
banking. Move the mouse; observe immediate manual control.

**Acceptance Scenarios**:

1. **Given** the Plane is banked by the visitor, **When** no input occurs for 5 seconds,
   **Then** the Plane levels out and then begins a gentle, slow left-right banking pattern.
2. **Given** Autopilot is active, **When** the visitor moves the pointer or touches the screen,
   **Then** Autopilot disengages within one frame and the Plane follows the input.
3. **Given** Autopilot is active, **Then** the Plane's bank and pitch stay well inside the
   manual limits and it never descends below the minimum height.

---

### User Story 5 - Learn the controls without a manual (Priority: P3)

On first load a single line of text ("move to steer, scroll or pinch for speed") appears over the
scene and fades out once the visitor starts steering or after a few seconds. There is no other UI.

**Why this priority**: Discoverability nicety; the hover-to-steer model works without it.

**Independent Test**: Load the page; see the hint; move the mouse; see it fade.

**Acceptance Scenarios**:

1. **Given** a fresh page load, **Then** the hint is visible over the scene and nothing else
   (no buttons, readouts, or menus) is drawn over the canvas.
2. **Given** the hint is visible, **When** the visitor steers or 6 seconds pass, **Then** the
   hint fades out and does not return during that visit.

---

### Edge Cases

- Pointer leaves the browser window: treated as returning to centre (Plane levels out).
- Window is resized or device rotates: the scene fills the new viewport; steering offset is
  measured against the new centre; no terrain gaps appear.
- Browser tab is hidden and later shown: the Plane does not teleport a huge distance; simulation
  time is capped so the world resumes smoothly from roughly where it was.
- Very slow device that cannot hold the frame budget: the Plane's motion stays tied to real time
  (no slow motion); visual detail may reduce but steering must remain responsive.
- Multi-touch: the first finger steers; a second finger switches to pinch (Throttle) and does
  not steer; releasing back to one finger resumes steering from that finger's new start point.
- Wheel and pinch arriving in the same frame: the last event wins.
- `?seed=` is missing, empty, or not a whole number: a random Seed is used and the world still
  loads.
- Plane flies to extreme distances from the start: terrain and lakes still generate correctly
  with no visible precision artefacts within a 1-hour continuous flight.
- Plane descends over a lake: the minimum height is measured from the water surface, not the
  submerged terrain, so the Plane never enters the water.
- Plane flies directly toward the sun: the sun disc and halo are visible above the horizon and
  the terrain ahead is backlit; the Plane itself remains distinguishable against the sky.

## Requirements *(mandatory)*

### Functional Requirements

**Flight**

- **FR-001**: The Plane MUST be airborne and moving forward from the first rendered frame with no
  click or tap required.
- **FR-002**: The Flight Model MUST take only a Steer Vector, a Throttle, and elapsed time as
  input and produce the Plane's next position, orientation, and speed.
- **FR-003**: Steer Vector x MUST drive roll and, through roll, heading; Steer Vector y MUST
  drive pitch. Magnitude MUST map monotonically to steepness up to fixed limits.
- **FR-004**: Roll MUST be limited to +/-45 degrees and pitch to +/-30 degrees from level; the
  Plane MUST NOT invert.
- **FR-005**: With a zero Steer Vector the Plane MUST return to level flight within 2 seconds.
- **FR-006**: The Plane MUST NOT descend below a minimum height above the terrain directly under
  it; when it would, descent MUST stop and the Plane MUST be eased upward. There is no crash
  state.
- **FR-007**: Speed MUST stay within fixed minimum and maximum values; the Plane MUST never stop
  or move backward.
- **FR-008**: Simulation MUST advance with real elapsed time so motion is identical in speed on
  fast and slow devices; a single step MUST be capped so that a hidden tab does not produce a
  jump on return.

**Input**

- **FR-009**: Mouse pointer position relative to the viewport centre, normalised to [-1, 1] on
  each axis, MUST be the Steer Vector on desktop. No click is required.
- **FR-010**: On touch devices, a single-finger drag offset from its starting point, normalised
  to the same range, MUST be the Steer Vector; finger lift MUST yield a zero Steer Vector.
- **FR-011**: The mouse wheel MUST raise and lower Throttle in fixed increments; a two-finger
  pinch MUST raise (spread) and lower (pinch) Throttle proportionally to the pinch change.
- **FR-012**: The pointer leaving the window, and any input device becoming inactive, MUST
  yield a zero Steer Vector.
- **FR-013**: There MUST be no keyboard controls.

**Camera**

- **FR-014**: The Chase Camera MUST follow behind and slightly above the Plane, keeping it in
  the lower-centre of the view, and MUST smooth its motion so that steering produces a lag of the
  camera behind the Plane's bank rather than a rigid lock.
- **FR-015**: The Chase Camera MUST never be positioned below the terrain.

**World**

- **FR-016**: Terrain MUST extend without visible edges in every horizontal direction for the
  duration of any flight (endless world).
- **FR-017**: The world MUST be generated deterministically from a Seed: the same Seed MUST
  produce identical terrain heights, Biome layout, and lake placement at every coordinate.
- **FR-018**: The Seed MUST be read from the `seed` URL query parameter when it is a whole
  number; otherwise a random Seed MUST be chosen per page load.
- **FR-019**: The world MUST contain exactly two Biomes in this feature: Alpine and Foothills.
  Both are mountain landscapes sharing one palette, sky, sun, and fog colour (FR-022, FR-022a,
  FR-022e) and differing only in terrain shape, altitude range, and lake frequency.
- **FR-020**: Biome Regions MUST be parallel bands spanning the world along one fixed world axis,
  alternating Alpine, Foothills, Alpine, ... across that axis. Each band MUST be wide enough to
  be crossed in about 60 seconds at cruise speed; band order and offset derive from the Seed.
- **FR-021**: Between adjacent bands a Biome Transition MUST blend terrain height profile,
  altitude thresholds of the palette, fog density, and lake frequency over a fixed distance
  crossed in about 10 seconds at cruise speed; no per-frame jump in any of these MUST be visible.
- **FR-016a**: Terrain MUST be smooth-shaded (no visible facets). Near the Plane the surface
  MUST show fine detail (small ridges and gullies layered on the large forms); with distance this
  fine detail MUST fade out so far terrain reads as smooth silhouettes. Detail changes MUST not
  be visible as popping or seams from the Chase Camera.
- **FR-022**: Alpine Biome: tall varied peaks with steep slopes; ground colour by altitude (snow
  above a threshold, rock on steep slopes, a forest band below the rock altitude, vegetation on
  valley floors); fog concentrated in valleys; only the deepest valleys dip below the water level.
- **FR-022f**: Foothills Biome: lower, rounded hills with broad valleys; the same altitude
  palette as FR-022 but with the snow threshold at or above the highest hilltops so snow is rare
  or absent, the forest and vegetation bands covering most of the surface, and a larger share of
  the terrain below the water level so lakes are frequent and large.
- **FR-022e**: Shared palette (reference colours; the implementation MAY vary them slightly for
  shading but MUST keep the same hue relationships): snow pale pink-white (#f0d8e8), rock cool
  violet-grey (#4e4460), forest deep blue-green (#1f2e3a), valley vegetation muted sage
  (#4e6a55), shoreline soft grey-mauve (#6a6070). The terrain MUST read cool against the warm
  sky so peaks silhouette against the horizon.
- **FR-022c**: In both Biomes, terrain below a fixed world water level MUST be covered by a flat,
  still lake surface with a soft colour blend at the shoreline. Lake colour MUST be dominated by
  the sun's warm gold (reference #ffd9c8 to #ffc98a) rather than the sky's blue, so lakes read as
  pools of light; the lake surface MUST show a soft specular highlight when the Camera faces the
  sun. Lakes MUST have no waves, ripples, or movement.
- **FR-022d**: The forest band MUST carry a coarse, Seed-deterministic speckle in colour only;
  no tree geometry MUST be generated.
- **FR-022a**: A single sun MUST be fixed in world space at a low elevation of about 12 degrees
  above the horizon in a fixed compass direction shared by both Biomes, and MUST be visible in
  the sky as a small pale-gold disc (reference #fff0b0) with a soft warm halo (reference #ffd27a)
  when the Camera faces it.
- **FR-022b**: Terrain MUST be shaded by its orientation to the sun (sun-facing surfaces warm and
  bright, surfaces facing away cool and dark) so that turning the Plane changes the lighting of
  the scene. No cast shadows MUST be rendered.
- **FR-022g**: Pastel Dawn mood. The sky MUST be a high-key three-stop gradient: peach at the
  horizon (reference #ffe3c8), soft pink in the lower sky (reference #f2b8c6), pale blue at the
  zenith (reference #8fb3e6). Distance fog and valley fog MUST be lavender (reference #cbbde6 to
  #d8cdef) and MUST soften rather than blacken distant terrain; overall contrast MUST stay soft
  (no crushed blacks, no saturated red or orange bands in the sky).
- **FR-023**: The City Biome (near-flat ground, box buildings, roads, windows, street lights) is
  REMOVED from this feature and MUST NOT be generated. Its requirements (formerly FR-023a-c) are
  deferred to a later feature.
- **FR-024**: Terrain and lakes MUST be produced on demand around the Plane and released when far
  behind, in Terrain Chunks.
- **FR-025**: No image, model, or audio files MUST be shipped; all visuals are generated.

**Autopilot**

- **FR-026**: After 5 seconds with no steering or Throttle input, Autopilot MUST engage: level
  the Plane, then apply a slow, gentle alternating bank whose amplitude stays below half the
  manual roll limit.
- **FR-027**: Any steering or Throttle input MUST disengage Autopilot immediately.
- **FR-028**: Autopilot MUST respect FR-006 (minimum height) and FR-007 (speed limits).

**Presentation**

- **FR-029**: The scene MUST fill the entire viewport and re-fit on resize or orientation change.
- **FR-030**: The only overlay MUST be a one-line control hint shown on load that fades on first
  steering input or after 6 seconds, whichever is first, and does not return.

### Key Entities

- **Plane**: The single aircraft; has position, orientation (roll, pitch, heading), and speed.
- **Steer Vector**: Normalised 2D steering intent in [-1, 1] x [-1, 1]; device-agnostic.
- **Throttle**: Normalised speed intent in [0, 1]; device-agnostic.
- **Flight Model**: Pure rule set mapping (Plane state, Steer Vector, Throttle, elapsed time)
  to next Plane state, including minimum-height easing.
- **Autopilot**: Idle state machine producing a synthetic Steer Vector after 5 s of inactivity.
- **Chase Camera**: Pose derived from Plane state with smoothing.
- **Seed**: Whole number determining the entire world.
- **Terrain Chunk**: Fixed-size ground tile generated from Seed and its grid coordinate,
  carrying heights and palette.
- **Biome**: Named parameter set (Alpine, Foothills) for terrain shape, altitude thresholds, fog
  density, and lake frequency; sky, sun, fog colour, water level, and palette are shared.
- **Biome Region**: A band of the world, spanning it along one axis, assigned one Biome.
- **Biome Transition**: The fixed-width zone between two bands where parameters blend as a
  function of position across the band axis.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor is flying (Plane visible over terrain, responding to pointer)
  within 2 seconds of navigation on a 4G connection, with no clicks.
- **SC-002**: 9 of 10 first-time visitors steer the Plane in the intended direction on their
  first pointer movement without reading the hint.
- **SC-003**: Motion is smooth: 60 frames per second on a mid-range laptop with integrated
  graphics and 30 on a mid-range phone, sustained over a 5-minute flight through both Biomes and
  at least two Biome Transitions.
- **SC-004**: Total downloaded code is at most 600 KB compressed; zero image, model, or audio
  downloads.
- **SC-005**: A 1-hour continuous flight at maximum speed shows no terrain gaps, edges, pop-in
  seams between Terrain Chunks, visible detail-level popping, or visual jitter.
- **SC-006**: Two loads with the same `?seed=` produce pixel-identical terrain silhouettes at the
  start position; two loads without it produce visibly different worlds.
- **SC-007**: The Plane never intersects terrain or lakes in any test flight, including full
  nose-down input held for 30 seconds.
- **SC-008**: Left untouched for 10 seconds, the Plane is level and gently banking; the first
  pointer movement afterwards is reflected in the Plane's attitude on the very next frame.
- **SC-009**: Every core mechanic (Flight Model, input mapping, Chase Camera, terrain
  generation, Terrain Chunk streaming, Biome selection and transition, Autopilot) has automated
  tests that run without a browser, and those tests were written before the implementation.

## Assumptions

- Visitors use an evergreen desktop or mobile browser with hardware-accelerated 3D; older
  browsers are out of scope.
- "Mid-range laptop" and "mid-range phone" are interpreted as a 3-year-old integrated-GPU laptop
  and a 3-year-old mid-tier Android or iPhone.
- The Plane's visual model is a simple stylised shape generated in code; its exact look is a
  planning/implementation choice within the no-assets rule.
- Pastel dawn is a fixed lighting state; there is no day/night cycle in this feature.
- The Biome sequence alternates strictly Alpine/Foothills; a City Biome, additional Biomes,
  weather, clouds, moving water, tree geometry, glow post-effects, sound, and any HUD or settings
  are explicitly out of scope and belong to later features.
- Reference colours in FR-022a/c/e/g describe the reviewed mock-up; they guide, not bind, the
  implementation as long as the described mood and hue relationships hold.
- Deployment target is any static file host; deployment itself is out of scope for this spec.
- Constitution v1.0.0 governs: minimum code, performance budgets, strict TDD for core mechanics,
  procedural-only assets, single input abstraction.
