# Feature Specification: Realistic Aircraft Selection

**Feature Branch**: None created; specification-only work.

**Feature Directory**: `specs/003-aircraft-selection`

**Created**: 2026-09-23

**Status**: Ready for planning; product scope confirmed through grill-me.

**Input**: User description: "use grill-me for speckit-specify to change the appearance of the
plane to something more realistic looking. The user should be able to choose from a range of
aircraft including helicopter, light plane, jet and other options."

**Interview outcome**: Six generic Aircraft Types with believable, simplified real-world shapes:
Helicopter, Light Plane, Fighter Jet, Passenger Jet, Biplane, and Glider. Selection changes
appearance only. A combined Flight Chooser offers static aircraft preview cards alongside
Themes. Fly starts fresh; Cancel resumes the original Flight. Every page load selects Nature
and Light Plane. Aircraft retain their own proportions but have similar screen footprints.
The user confirmed this scope, including one fixed paint scheme per type and the exclusions below.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fly a believable aircraft (Priority: P1)

A visitor starts the default Flight and sees a recognizable light propeller plane with a shaped
body, cockpit windows, wings, tail, and moving propeller. The aircraft fits the landscape's
visual style and remains visible while flying, without changing the familiar controls.

**Why this priority**: Improving the aircraft itself is the primary requested outcome and
provides value before adding a choice of types.

**Independent Test**: Start the default Flight, inspect the Light Plane in level flight and
turns, then exercise mouse/touch steering, Throttle, Autopilot, and the Soft Floor.

**Acceptance Scenarios**:

1. **Given** the initial chooser, **When** the visitor presses Fly without changing selections,
   **Then** a Light Plane flies over Nature and meets its visual cues in FR-003.
2. **Given** a Light Plane in flight, **When** it banks or pitches, **Then** its nose follows
   the flight direction, body and glass remain visually distinct, and the aircraft remains
   recognizable and visible from the Chase Camera.
3. **Given** active flight, **When** the visitor watches the propeller, **Then** it visibly
   rotates; **When** the Flight pauses, **Then** its animation also pauses.
4. **Given** the new appearance, **When** the visitor steers, adjusts Throttle, idles, or
   approaches terrain or water, **Then** the existing Flight Model, Autopilot, and Soft Floor
   behavior is preserved.

---

### User Story 2 - Choose from six aircraft before flying (Priority: P1)

A visitor compares aircraft using pictures and names, independently chooses a world, and
starts a Flight with both selections. All six aircraft are available immediately.

**Why this priority**: Selection delivers the requested variety; different silhouettes make
the choice meaningful even though handling stays the same.

**Independent Test**: From a fresh visit, select and launch each Aircraft Type in each Theme.
Compare its card with the aircraft actually flown, including on a phone.

**Acceptance Scenarios**:

1. **Given** a fresh page load, **When** the chooser becomes ready, **Then** Nature and Light
   Plane are selected and all six aircraft have named, static visual cards.
2. **Given** the chooser, **When** the visitor selects a different aircraft or Theme, **Then**
   only that pending choice changes; the other choice remains selected and no Flight starts.
3. **Given** any of the eighteen aircraft/Theme combinations, **When** the visitor presses
   Fly, **Then** one fresh Flight starts with the selected aircraft and world together.
4. **Given** a selected aircraft, **When** it appears in flight, **Then** its shape and fixed
   paint scheme match its card and it meets the type-specific cues in FR-003.
5. **Given** any Aircraft Type, **When** the visitor repeats the same flight inputs from the
   same starting state and world, **Then** the flight path, speed, and camera behavior match.
   The Helicopter continues forward without hovering; the Glider uses the shared Throttle.
6. **Given** a previous visit using another aircraft and Theme, **When** the page reloads,
   **Then** Nature and Light Plane are selected again.
7. **Given** a mouse, touch screen, or keyboard used for menus, **When** the visitor browses
   aircraft and worlds, **Then** every choice and action is reachable, clearly labelled,
   and visibly selected or focused, including in phone portrait and landscape orientations.

---

### User Story 3 - Change a Flight or resume it unchanged (Priority: P2)

During flight, a visitor opens Change flight to browse another aircraft or world. They can
start fresh with either or both changed, or cancel and continue their original Flight.

**Why this priority**: Lets visitors explore the lineup without reloading while retaining the
existing choice between restarting and resuming.

**Independent Test**: Open the chooser during a banked Flight, change either or both selections,
then exercise Cancel and Fly separately, including a cancelled or failed launch.

**Acceptance Scenarios**:

1. **Given** an active Flight, **When** Change flight is opened, **Then** the entire Flight,
   including propeller/rotor animation, pauses and both active choices are selected.
2. **Given** pending changes to aircraft and Theme, **When** Cancel is pressed, **Then** the
   original aircraft, Theme, Seed, pose, speed, Throttle, camera, animation phase, Autopilot,
   and hint progress resume unchanged, without replaying time spent in the chooser.
3. **Given** the chooser over an existing Flight, **When** Fly is pressed with either, both,
   or neither selection changed, **Then** a fresh Flight starts from the normal safe launch
   state with the same page-visit Seed. An aircraft-only change also restarts.
4. **Given** a launch is preparing or has failed, **When** the visitor cancels, **Then** the
   previous Flight remains recoverable and resumes with its original aircraft. An abandoned
   launch cannot subsequently replace it.
5. **Given** a return through Fly or Cancel, **When** the pointer rests on the button or a
   chooser touch ends, **Then** that menu interaction does not steer or change Throttle.
   Fresh steering input is required.
6. **Given** a launch failure, **When** the chooser shows the error, **Then** both pending
   selections remain available for retry or change; Cancel is offered only if a prior Flight
   exists. A failed restoration retains that prior Flight and offers retry or a fresh Flight.

### Edge Cases

- Repeated Fly presses start only one launch; both selection groups are locked while preparing.
- Selection changes never alter the paused Flight, even if its world must be released and
  rebuilt during a later Cancel. Restoration includes the original Aircraft Type.
- A card preview fails: its name, description, selection indicator, and explicit unavailable
  preview message remain usable. It is never replaced by a different aircraft's picture.
- Aircraft preparation fails: show an error and preserve the choices and prior Flight;
  do not silently launch the Light Plane or show a partial combination.
- Long wings, helicopter rotors, and tails remain in view at the supported steering limits,
  including phone portrait views, without changing the aircraft's internal proportions.
- Aircraft remain distinguishable against pale Arctic terrain, the Nature sky, and the
  darker Alien Planet palette, including when facing toward or away from the sun.
- Resizing, rotating the phone, or hiding the tab retains both pending selections and the
  paused Flight. Returning does not catch up movement or animation over the hidden interval.
- Touch drag, pinch, and wheel events used in the chooser cannot leak into flight input.
- Reloading discards aircraft preferences even after a failed or cancelled launch.
- The aircraft choice does not change Seed parsing, terrain generation, or world appearance.

## Requirements *(mandatory)*

### Functional Requirements

**Aircraft appearance**

- **FR-001**: The selectable Aircraft Types MUST be exactly Helicopter, Light Plane, Fighter
  Jet, Passenger Jet, Biplane, and Glider, freely available without unlocking or payment.
  Exactly one Plane is flown at a time.
- **FR-002**: Each type MUST use a generic, believable, simplified real-world design with a
  shaped fuselage, appropriate proportions, a recognizable silhouette, and distinct cockpit
  glass and body surfaces. Each has one fixed paint scheme. Designs MUST be recognizable by
  shape rather than depending on names, paint colours, branding, or photorealistic detail.
- **FR-003**: Each type MUST include these defining cues. The card shows the overall design;
  flight review includes level flight and banking views so visible surfaces can be assessed.

  | Aircraft Type | Required visual cues |
  |---------------|----------------------|
  | Helicopter | Rounded cabin with glazing, tail boom, main rotor, tail rotor, and landing skids; no fixed-wing airplane silhouette. |
  | Light Plane | Compact cabin, high-mounted main wing, conventional tail, nose propeller, and fixed landing wheels. |
  | Fighter Jet | Pointed nose, swept wings, cockpit canopy, tail surfaces, visible intake and exhaust shapes; no propeller. |
  | Passenger Jet | Long fuselage, cockpit and rows of passenger windows, swept wings, two underwing engine nacelles, and conventional tail. |
  | Biplane | Two vertically separated main wings with supporting struts, compact body, open cockpit with a small windscreen, conventional tail, nose propeller, and fixed landing wheels. |
  | Glider | Long slender wings, slim fuselage, cockpit canopy, and tail; no propeller or engine nacelles. |

- **FR-004**: Body shading MUST convey the rounded or tapered shapes and distinguish glass,
  painted surfaces, and appropriate exposed parts. Aircraft MUST remain legible in all three
  Themes without requiring changes to a Theme's terrain, sky, fog, or lighting direction.
- **FR-005**: Aircraft MUST preserve their own proportions while occupying similar amounts
  of the flying view. True relative physical size between types is not required. They MUST
  retain the existing Chase Camera behavior, remain fully framed through normal steering,
  and leave the landscape visible.
- **FR-006**: The Light Plane and Biplane propellers and both Helicopter rotors MUST visibly
  rotate throughout active flight, including Autopilot. Rotation MUST stop while paused and
  resume from the preserved phase on Cancel, without elapsed-time catch-up. Jet engines and
  the Glider require no moving propulsion parts. Cards MUST remain static.
- **FR-007**: Aircraft selection MUST NOT change steering, Throttle mapping, speed limits,
  acceleration, pitch/roll limits, turning, Autopilot, Soft Floor, or Chase Camera behavior.
  Helicopter hovering and separate gliding behavior are excluded.

**Choice and previews**

- **FR-008**: The Flight Chooser MUST combine independent Theme and Aircraft Type selections.
  Every page load MUST select Nature and Light Plane, with no remembered aircraft preference.
  Before the first Fly, the stationary background MUST also use Nature and Light Plane.
- **FR-009**: All six Aircraft Types MUST be available with Nature, Alien Planet, and Arctic.
  Changing one pending selection MUST preserve the other and MUST NOT change the background
  aircraft/world or begin flight.
- **FR-010**: Each aircraft card MUST show its name, a brief description, and a static,
  representative three-quarter view of the actual design and paint scheme used in flight.
  The chooser MUST explain once that all aircraft share the same flying controls and behavior.
  Previews MUST be generated during the visit and require no shipped image or model assets.
- **FR-011**: Selected choices MUST be clear without relying on colour alone. Both selection
  groups and Fly/Cancel MUST support mouse, touch, labelled keyboard menu navigation, and
  visible focus. The complete chooser MUST remain usable in desktop and phone orientations;
  scrolling is allowed. Menu keyboard support does not introduce keyboard flight controls.
- **FR-012**: An unavailable aircraft preview MUST show a labelled fallback without blocking
  selection or launching an otherwise ready aircraft. Selection MUST NOT trigger an animated
  preview or continuously refresh the static cards.

**Pause, launch, and recovery**

- **FR-013**: The in-flight Change theme action MUST become Change flight and open the combined
  chooser. Opening it MUST pause movement, camera motion, aircraft animation, Autopilot
  timers, and hint progress, with both active choices selected.
- **FR-014**: Fly MUST start a fresh Flight with both pending selections, including when
  only the aircraft changes or both selections match the current Flight. Preserve the
  page-visit Seed; reset position, heading, safe altitude, level attitude, Throttle, steering,
  and idle/hint timers using the existing new-Flight behavior.
- **FR-015**: Cancel MUST discard both pending choices and restore the original Flight's
  Aircraft Type, Theme, Seed, pose, speed, Throttle, camera, animation phase, Autopilot,
  and hint state. Time spent paused MUST NOT advance any of them. Cancel-to-flight MUST
  only be available when a previous Flight exists.
- **FR-016**: Preparation MUST accept only one launch, prevent further selection changes,
  and communicate progress. The new aircraft and world MUST become active together only
  when ready; there MUST be no partial scene or frame mixing old and new choices.
- **FR-017**: Failure MUST retain both pending selections, explain the failure, and allow
  retry or another choice. A prior Flight MUST remain recoverable through Cancel during
  preparation or after failure, even if its landscape requires rebuilding. Cancelled
  preparation MUST NOT overwrite a resumed Flight. Restoration failure MUST preserve the
  prior state and offer retry or a fresh Flight without exposing a partial scene.
- **FR-018**: Chooser interactions MUST NOT steer, alter flight Throttle, or count as flight
  activity. Fly and Cancel MUST require fresh steering input; Cancel retains prior Throttle.
  Resize, orientation changes, and tab hiding MUST preserve selection and pause semantics.
- **FR-019**: New Flights MUST retain the existing temporary control hint; Cancel MUST
  preserve its progress. Outside the chooser and temporary preparation/error feedback, the
  flight UI remains Change flight and the temporary hint.
- **FR-020**: All eighteen aircraft/Theme combinations MUST retain the governing startup,
  flight performance, procedural-content, and input constraints. Repeated browsing and
  switching MUST NOT cause accumulating memory use or progressive slowdown.

### Key Entities *(include if feature involves data)*

- **Aircraft Type**: One of six selectable visual designs, identified by its name, silhouette,
  fixed paint scheme, characteristic parts, and static card preview. It does not select a
  different Flight Model.
- **Plane**: The single aircraft flown in a session, displayed using the active Aircraft Type.
  The existing domain name remains applicable to the Helicopter and Glider.
- **Flight Chooser**: The expanded Theme Chooser containing independent pending Theme and
  Aircraft Type choices. Fly commits both to a fresh Flight; Cancel discards both.
- **Flight**: The existing continuous run of one Plane in a Theme and Seed, now also retaining
  its Aircraft Type and visual animation phase across a pause.
- **Flight Snapshot**: The existing preserved Flight state, extended to retain Aircraft Type
  and animation phase so cancellation restores the complete original presentation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner correctly identifies all six types from unlabelled preview cards and
  from unlabelled level-flight/banking captures in each Theme. Visual review confirms every
  FR-003 cue across the card and flight views, shaped surfaces rather than the existing
  box-like appearance, distinct body/glass, and matching card/flight designs.
- **SC-002**: In matched level-flight views at the same viewport and camera state, each type's
  largest visible span is within 20% of the Light Plane's. At neutral and maximum supported
  pitch/roll positions, the complete aircraft, including wings and rotor sweep, remains
  within the viewport in desktop, phone portrait, and phone landscape review.
- **SC-003**: From the ready chooser, the default Flight takes one Fly activation. Any other
  aircraft in the default Theme takes one card selection and one Fly activation. All eighteen
  combinations launch the correct aircraft and Theme, with no locked or incompatible choices.
- **SC-004**: On the reference devices, a first scene and usable initial chooser with the
  three Theme and six aircraft previews appear within two seconds of navigation over
  simulated 4G. A controllable Flight appears within two seconds of Fly; Cancel restores a
  prior Flight within two seconds, including when its world needs rebuilding.
- **SC-005**: Aircraft-only, Theme-only, combined, and unchanged-selection launches all restart
  correctly. Cancellation before and during preparation, after failure, and after sixty
  seconds paused preserves the original Flight, including aircraft and animation phase,
  without movement, accidental steering, or time catch-up.
- **SC-006**: Repeating identical inputs from the same starting state with all six types yields
  matching flight paths, speed changes, camera motion, Autopilot, and Soft Floor outcomes.
  Helicopter rotors and the two propeller aircraft animate during flight and freeze on pause.
- **SC-007**: Each of the eighteen combinations sustains the existing 60 fps laptop and 30 fps
  phone targets during a five-minute representative Flight. Fifty successive changes spanning
  all six aircraft and all three Themes produce no failure, progressive slowdown, or sustained
  memory growth after warm-up.
- **SC-008**: Selection, launch, cancellation, failure/retry, and preview-fallback scenarios
  pass using mouse and touch, with every menu action also accessible using visible keyboard
  focus. All choices and actions remain reachable at 360 by 640 and 640 by 360 phone viewports.
  Reload checks after every Aircraft Type always return to Nature and Light Plane.

## Assumptions

### Confirmed decisions

- Appearance changes only; all six aircraft share existing flight behavior.
- Generic, believable, simplified designs; one fixed paint scheme per type.
- Exactly six launch types, available in every Theme without unlocking.
- A combined chooser with static visual cards and the Change flight entry point.
- Fly always starts fresh; Cancel resumes the original Flight unchanged.
- Nature and Light Plane on every page load; active choices on reopening the chooser.
- Similar screen footprints while preserving each aircraft's proportions.
- No paint customization, sounds, cockpit view, or landing mechanics.

### Bounded defaults for planning

- The FR-003 cues make the agreed generic types concrete; they do not prescribe named makes,
  branded replicas, paint colours, or small surface details. The owner will judge rendered
  appearance during implementation. Confirmed scope is not approval of unseen visuals.
- The 20% span tolerance gives "similar screen footprint" a measurable acceptance boundary.
  It compares the longest visible dimension, not equal width and height for differently
  shaped aircraft. Fine proportions and paint colours remain visual design decisions.
- Propulsion animation communicates active flight; accurate engine speed, visible jet effects,
  animated control surfaces, retracting landing gear, and rotor startup sequences are not
  required. No weapons, combat, aircraft-specific controls, or aircraft-sharing links are added.
- Aircraft previews use a consistent view and readable lighting; they need not change with
  the selected Theme. Preview fallback is a recovery path, not a replacement for delivering
  all six working previews under normal conditions.
- Reference devices retain the earlier definition: a three-year-old integrated-GPU laptop and
  a three-year-old mid-tier Android phone or iPhone. Owner measurements on those devices are
  required for acceptance; software-rendered VM results do not establish those frame rates.

### Dependencies and compatibility

- Depends on [First Flight](../001-first-flight/spec.md) for the Flight Model, Chase Camera,
  controls, Autopilot, and Soft Floor, and [Landscape Themes](../002-landscape-themes/spec.md)
  for Theme selection, Seed retention, previews, pause/restoration, and launch recovery.
- This feature extends Landscape Themes FR-001 through FR-005 and FR-013 through FR-023 with
  aircraft choice and animation state. Its Theme Chooser becomes the Flight Chooser; Change
  theme becomes Change flight. The existing Fly/restart and Cancel/resume meanings remain.
- Landscape Themes FR-012 continues to require shared flight behavior across Themes; this
  feature also requires shared flight behavior across Aircraft Types. It replaces the
  existing single visual design without changing the one-Plane-per-session rule.
- The [constitution](../../.specify/memory/constitution.md) continues to govern, including
  procedural visuals, no shipped binary assets, performance budgets, and input constraints.
  No amendment is proposed. Existing unresolved work is not certified complete by this spec.
- The definitions above extend the current [domain vocabulary](../../CONTEXT.md); subsequent
  implementation must keep that vocabulary consistent with Aircraft Type and Flight Chooser.
