# Feature Specification: First Flight

**Feature Branch**: `001-first-flight`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "A web app of a plane flying over different visually stunning
landscapes, flown with mouse movements and gestures. First feature: fly the Plane over endless
terrain that alternates between mountain and city Biomes, with a Chase Camera and Autopilot on
idle."

## Clarifications

### Session 2026-09-19

- Q: How are Mountain and City regions laid out across the world so that they alternate no matter
  which way the Plane flies? → A: Parallel bands across one world axis, each about 60 s of cruise
  flight wide, with a Biome Transition zone of about 10 s of flight at each boundary; flying
  parallel to the bands stays in one Biome.
- Q: How does the sun behave, and does it cast shadows? → A: Sun fixed in the world at a low
  golden-hour elevation (about 10 degrees above the horizon), visible as a disc with a bright halo;
  terrain and buildings are shaded by their angle to the sun, with no cast shadows.
- Q: What light does the City give off, beyond the glowing windows already specified? → A:
  Window grids with a Seed-determined fraction of dark windows, plus static rows of warm street
  lights along both edges of every road, brighter and denser toward the band centre; no
  animation and no bloom.
- Q: Which natural scenery should Mountain valleys contain beyond the altitude colour palette and
  fog? → A: Still lakes wherever terrain dips below a fixed water level (flat, sky-tinted, soft
  shoreline, no waves), plus a dark-green forest colour band with a coarse speckle between the
  vegetation and rock altitudes (colour only, no tree geometry).
- Q: What visual style should the terrain surface have, and how much detail should stay visible
  near versus far from the Plane? → A: Smooth-shaded terrain with fine detail (small ridges and
  gullies) near the Plane, fading to smooth silhouettes in the distance.

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

### User Story 2 - Fly over endless mountains and cities (Priority: P1)

As the Plane flies, terrain keeps appearing ahead and disappearing behind, in every direction,
forever. The world is striped into parallel bands that alternate between two Biomes: snow-capped
mountains at golden hour with fog in the valleys, and a city of lit buildings on a grid of dark
roads. Between the two the landscape blends over a stretch of flight rather than switching
abruptly. Each visit shows a different world, but the same `?seed=` in the address bar always
shows the same world.

**Why this priority**: Equal to Story 1; the landscape is the reason to fly. Two Biomes prove
the Biome mechanic from day one.

**Independent Test**: Fly straight for several minutes; observe terrain never runs out, the
Biome alternates mountain -> city -> mountain, and the transition is gradual. Reload with the same
`?seed=` and observe identical terrain at the start position.

**Acceptance Scenarios**:

1. **Given** any heading, **When** the Plane flies for 5 minutes at maximum Throttle, **Then**
   terrain is always present beneath and ahead of the Plane with no visible gaps or edges;
   ground near the Plane shows small ridges and gullies while distant ridgelines are smooth,
   with no visible pop as terrain approaches.
2. **Given** the Plane is over a mountain region, **When** it flies across the band axis,
   **Then** it enters a city region, and later another mountain region, with each region long
   enough to be experienced as a place rather than a flicker; **When** it flies parallel to the
   bands, **Then** it stays in the same Biome indefinitely.
3. **Given** the Plane crosses from mountain to city, **When** the visitor watches the boundary,
   **Then** the ground palette, building density, and fog blend over a fixed stretch of flight
   rather than changing in a single frame.
4. **Given** a mountain region, **Then** terrain colour varies by altitude (snow on peaks, rock
   on slopes, a speckled dark-green forest band below the rock, lighter vegetation in valleys),
   valley floors that dip below the water level hold flat still lakes tinted by the sky, the sun
   sits low with a warm sky gradient, and valleys hold fog.
   **When** the Plane turns toward the sun, **Then** slopes facing the Plane darken and the sun
   disc and halo come into view; **When** it turns away, **Then** facing slopes brighten; no
   cast shadows appear in either case.
5. **Given** a city region, **Then** the ground is mostly flat, buildings are box-shaped with
   varied heights on a regular grid separated by dark road gaps, building faces show grids of
   warm lit windows with some dark, and rows of street lights line both edges of every road.
   **When** the Plane flies from the edge of the city band toward its centre, **Then** the
   street lights become brighter and denser; none of the lights flicker, move, or animate.
6. **Given** two page loads with the same `?seed=` value, **Then** the terrain and buildings at
   the starting position are identical; **Given** two loads with no `?seed=`, **Then** the
   worlds differ.

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
- Plane flies to extreme distances from the start: terrain and buildings still generate
  correctly with no visible precision artefacts within a 1-hour continuous flight.
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
  produce identical terrain heights, Biome layout, and building placement at every coordinate.
- **FR-018**: The Seed MUST be read from the `seed` URL query parameter when it is a whole
  number; otherwise a random Seed MUST be chosen per page load.
- **FR-019**: The world MUST contain exactly two Biomes in this feature: Mountain and City.
- **FR-020**: Biome Regions MUST be parallel bands spanning the world along one fixed world axis,
  alternating Mountain, City, Mountain, ... across that axis. Each band MUST be wide enough to be
  crossed in about 60 seconds at cruise speed; band order and offset derive from the Seed.
- **FR-021**: Between adjacent bands a Biome Transition MUST blend terrain height profile,
  ground palette, fog, and building density over a fixed distance crossed in about 10 seconds at
  cruise speed; no per-frame jump in any of these MUST be visible.
- **FR-016a**: Terrain MUST be smooth-shaded (no visible facets). Near the Plane the surface
  MUST show fine detail (small ridges and gullies layered on the large forms); with distance this
  fine detail MUST fade out so far terrain reads as smooth silhouettes. Detail changes MUST not
  be visible as popping or seams from the Chase Camera.
- **FR-022**: Mountain Biome: tall varied peaks; ground colour by altitude (snow above a
  threshold, rock on steep slopes, a dark-green forest band below the rock altitude, lighter
  vegetation on valley floors); fog concentrated in valleys; a warm-to-cool sky gradient.
- **FR-022c**: In the Mountain Biome, terrain below a fixed world water level MUST be covered by
  a flat, still lake surface tinted by the sky and sun, with a soft colour blend at the shoreline.
  Lakes MUST have no waves, ripples, or movement, and MUST not appear in the City Biome (the
  city ground sits above the water level); lakes fade out through the Biome Transition.
- **FR-022d**: The forest band MUST carry a coarse, Seed-deterministic speckle in colour only;
  no tree geometry MUST be generated.
- **FR-022a**: A single sun MUST be fixed in world space at a low golden-hour elevation (about 10
  degrees above the horizon) in a fixed compass direction shared by both Biomes, and MUST be
  visible in the sky as a disc with a bright halo when the Camera faces it.
- **FR-022b**: Terrain and buildings MUST be shaded by their orientation to the sun (sun-facing
  surfaces warm and bright, surfaces facing away cool and dark) so that turning the Plane changes
  the lighting of the scene. No cast shadows MUST be rendered.
- **FR-023**: City Biome: near-flat ground; box buildings on a regular grid with varied heights
  and dark road gaps between blocks; same sky and sun as FR-022a.
- **FR-023a**: Every building face MUST show a regular grid of warm lit windows in which a
  Seed-determined fraction of windows is dark, so that facades differ from one another.
- **FR-023b**: Every road MUST carry a row of warm street lights along each edge. Street light
  brightness and spacing MUST vary with distance from the band centre: brightest and densest at
  the centre, dimmest and sparsest at the band edges, fading out through the Biome Transition.
- **FR-023c**: City lights MUST be static: no flicker, movement, animation, or glow post-effect.
- **FR-024**: Terrain and buildings MUST be produced on demand around the Plane and released
  when far behind, in Terrain Chunks.
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
  carrying heights, palette, and (in City regions) building footprints and heights.
- **Biome**: Named parameter set (Mountain, City) for terrain shape, palette, fog, sky, water
  level, buildings, and lights.
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
- **SC-007**: The Plane never intersects terrain or buildings in any test flight, including
  full nose-down input held for 30 seconds.
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
- Golden hour is a fixed lighting state; there is no day/night cycle in this feature.
- The Biome sequence alternates strictly Mountain/City; additional Biomes, weather, clouds,
  moving water, tree geometry, traffic, animated or flickering lights, glow post-effects, sound, and any HUD or
  settings are explicitly out of scope and belong to later features.
- Deployment target is any static file host; deployment itself is out of scope for this spec.
- Constitution v1.0.0 governs: minimum code, performance budgets, strict TDD for core mechanics,
  procedural-only assets, single input abstraction.
