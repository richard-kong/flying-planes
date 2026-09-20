# Feature Specification: Landscape Themes

**Feature Branch**: `devin/1789902861-landscape-themes-spec`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "Add a feature that allows users to change the landscape based on
a theme. It should allow users to set the theme at start up."

**Interview outcome**: Launch Nature, Alien Planet, and Arctic as complete world presets. The
existing landscape becomes Alien Planet. Nature gains Earth-like terrain, colours, and daylight;
Arctic has glacial valleys, snow, blue ice, and frozen lakes. Every page load opens a chooser with
Nature selected. Fly starts the flight. Change theme pauses it; Cancel resumes it; Fly starts
a fresh flight in the selected Theme. Preview cards are a documented default after the user
skipped that question and directed work to continue.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose a world before flying (Priority: P1)

A visitor opens the app and sees three Theme choices with Nature selected. Each choice has a
representative visual preview, a name, and a short description. They choose a Theme and press
Fly when ready. The Plane begins flying in that world.

**Why this priority**: Choosing the starting landscape is the central capability of this feature.

**Independent Test**: On desktop and phone, load the app, select a Theme, and press Fly.
Verify the selected world appears and the usual flight controls work.

**Acceptance Scenarios**:

1. **Given** a fresh page load, **When** the app opens, **Then** the chooser lists exactly
   Nature, Alien Planet, and Arctic, Nature is selected, and no flight advances before Fly.
2. **Given** the chooser, **When** the visitor selects Arctic, **Then** Arctic is visibly
   selected, its preview and description identify it, and the flight has not started.
3. **Given** any selected Theme, **When** the visitor presses Fly, **Then** the chooser closes
   once that world is ready and the Plane starts airborne above its surface with the Chase Camera
   in place and the control hint visible.
4. **Given** the chooser, **When** the visitor moves the pointer, scrolls, or touches its
   controls, **Then** those interactions neither steer the Plane nor alter its starting Throttle.
5. **Given** a previous Alien Planet or Arctic flight, **When** the page is reloaded, **Then**
   the chooser opens with Nature selected, including when a valid Seed is present in the address.
6. **Given** a small phone viewport or a rotated device, **When** the chooser is displayed,
   **Then** all three choices and Fly remain reachable with readable labels and a visible
   selection indicator.

---

### User Story 2 - Explore three distinct landscapes (Priority: P1)

The visitor can fly over an Earth-like Nature world, the existing surreal landscape under the
Alien Planet name, or a frozen Arctic world. Each Theme combines terrain shapes, surface
colours, lakes or ice, sky, fog, and lighting into a consistent visual identity.

**Why this priority**: The chooser only delivers value if its choices produce distinct worlds.

**Independent Test**: Launch each Theme using the same Seed and compare the opening view, a
mountain region, a valley, and a lake or frozen lake. Fly through regional transitions in each.

**Acceptance Scenarios**:

1. **Given** Nature, **When** the visitor flies through mountains and valleys, **Then** they see
   green foothills and forest bands, natural-coloured rock, snow-capped mountains, blue lakes,
   and a clear daylight sky. Terrain shapes are less exaggerated than Alien Planet, rather
   than merely recoloured copies.
2. **Given** Alien Planet, **When** the visitor uses a Seed from First Flight, **Then** the
   familiar Alpine/Foothills landscape, cool dusky terrain, warm gold lakes, Pastel Dawn sky,
   and lavender fog retain their existing visual identity.
3. **Given** Arctic, **When** the visitor flies across the world, **Then** broad glacial valleys,
   snowy ridges, blue ice, and flat frozen lakes appear under cold daylight. Its landforms and
   ground cover distinguish it from both Nature and Alien Planet.
4. **Given** the same Theme and Seed, **When** the visitor restarts or reloads and selects that
   Theme again, **Then** terrain shapes and lake or frozen-lake locations repeat.
5. **Given** any Theme, **When** the visitor flies across regional boundaries or toward the
   ground, **Then** the landscape remains continuous, the Plane stays above terrain and
   water or ice, and the existing steering, speed, and Autopilot behaviours remain available.

---

### User Story 3 - Try another theme without reloading (Priority: P2)

During flight, the visitor opens Change theme. The flight pauses and the chooser opens with the
current Theme selected. They can choose another Theme and start a new flight, or cancel and
continue the existing flight exactly where they left it.

**Why this priority**: Visitors can compare worlds without losing the option to continue a flight.

**Independent Test**: Start a flight, open Change theme, select another Theme, and cancel.
Repeat and press Fly instead. Verify resume and restart are different actions.

**Acceptance Scenarios**:

1. **Given** an active flight, **When** the visitor opens Change theme, **Then** the Plane,
   Chase Camera, and flight timers pause, and the current Theme is selected in the chooser.
2. **Given** a paused flight, **When** the visitor selects another Theme and presses Cancel,
   **Then** the original Theme, Seed, position, orientation, speed, and Autopilot state resume
   without a jump or elapsed-time catch-up.
3. **Given** a paused flight, **When** the visitor selects another Theme and presses Fly,
   **Then** a new flight starts in that Theme at its normal starting position and safe height,
   with default Throttle, neutral steering, and fresh Autopilot and hint timers.
4. **Given** the current Theme remains selected, **When** the visitor presses Fly, **Then**
   it still restarts the flight; only Cancel resumes.
5. **Given** a paused flight, **When** the visitor spends more than five seconds browsing or
   hides and restores the tab, **Then** the paused flight does not move or acquire idle time.
   Menu interactions do not become steering or Throttle events on resume.
6. **Given** a new world cannot be prepared, **When** an attempted launch fails, **Then** the
   chooser remains usable with a clear error and retry path; Cancel can still resume any prior
   flight. The app does not expose a partly changed world.

### Edge Cases

- Rapidly selecting several Themes: only the last selected card is launched.
- Repeated presses of Fly during preparation: one new flight starts, with no overlapping
  launches; selection and Fly are unavailable until preparation succeeds or fails.
- Cancel during preparation from an existing flight: the original flight resumes and any
  later completion of the abandoned launch cannot replace it.
- A touch drag or pinch is in progress when opening the chooser: it is ended at that boundary;
  starting or resuming flight requires fresh steering input.
- The pointer remains over Fly or Cancel after closing the chooser: that resting position
  does not immediately bank the Plane; a new pointer movement is required.
- Invalid or missing Seed: retain First Flight's validation and choose one random Seed for
  the page visit. Switching Themes does not silently change that Seed.
- Menu open during resize, orientation change, or tab hiding: preserve selection and paused
  flight; returning does not advance the paused world.
- A theme's ice or water surface is above the terrain: use that visible surface for Soft Floor
  clearance and safe launch height.
- A launch fails on first use: return to the chooser with the selected Theme retained and allow
  retry or another selection; no Cancel-to-flight action exists without a prior flight.

## Requirements *(mandatory)*

### Functional Requirements

**Selection and startup**

- **FR-001**: Every page load MUST show the Theme Chooser with Nature selected, regardless of
  previous flights. The app MUST NOT remember a preferred Theme between page loads.
- **FR-002**: The selectable Themes MUST be exactly Nature, Alien Planet, and Arctic.
- **FR-003**: Each Theme choice MUST show its name, a representative visual preview, and a
  short description. The selected choice MUST be distinguishable without relying on colour alone.
- **FR-004**: Choosing a card MUST only change the pending selection. Flight MUST start only
  after Fly is activated; startup MUST still meet the existing first-rendered-frame budget.
- **FR-005**: The chooser MUST work with mouse and touch, remain usable across desktop and
  phone orientations, and expose labelled, keyboard-operable menu controls with visible focus.
  This adds menu navigation, not keyboard steering or Throttle.

**Complete world presets**

- **FR-006**: A Theme MUST define the world's terrain character, surface palette, lake or ice
  appearance, sky, fog, and fixed lighting together. There MUST be no independent time-of-day
  selection in this release.
- **FR-007**: Nature MUST use Earth-like landforms and colours: green foothills and forest
  bands, natural rock and white snow, blue lakes, and a clear daylight sky. At the same Seed
  and viewpoints, its terrain shapes MUST differ from Alien Planet with gentler relief.
- **FR-008**: Alien Planet MUST preserve First Flight's intended terrain and Pastel Dawn
  appearance, including its Alpine/Foothills variation, cool dusky palette, warm gold lakes,
  low pale-gold sun, and lavender fog. Renaming the existing experience MUST NOT introduce
  additional alien objects, spires, craters, or a different sky. Known defects may still be fixed.
- **FR-009**: Arctic MUST have broad glacial valleys, snowy ridges, blue ice, flat frozen lake
  surfaces, and cold daylight. Snow and ice MUST replace the temperate forest/vegetation look;
  its valley and ridge shapes MUST differ from the other Themes.
- **FR-010**: All Themes MUST remain procedural, endless, and deterministic. The same Theme
  and Seed MUST reproduce terrain, regional layout, and water or ice locations. Regional
  transitions MUST remain gradual and free of visible gaps or seams.
- **FR-011**: Seed parsing and the existing `?seed=` behaviour MUST remain compatible with
  First Flight. One Seed MUST be retained across Theme changes and restarts within the page
  visit. Reproducibility across Themes is defined by the pair of Theme and Seed.
- **FR-012**: Flight controls, speed limits, Autopilot, the Plane, and the Chase Camera MUST
  behave consistently across Themes. The Soft Floor and launch clearance MUST account for
  terrain, water, and frozen lake surfaces in the selected Theme.

**Pause, cancel, and restart**

- **FR-013**: Flight MUST expose a labelled Change theme control that does not obstruct the
  central flying view. Opening it MUST pause the current flight and select its active Theme.
- **FR-014**: While the chooser is open, position, orientation, speed, Chase Camera, Autopilot
  timers, and the control-hint timer MUST NOT advance. Chooser input MUST NOT reach flight
  controls or count as flight activity.
- **FR-015**: Cancel MUST discard pending selection and resume the preserved flight with
  its Theme, Seed, pose, speed, and Autopilot state unchanged. Menu time MUST NOT be replayed.
  Cancel-to-flight MUST only be offered when a prior flight exists.
- **FR-016**: Fly MUST start a fresh flight even when the selected Theme matches the current
  one. Reset to the normal starting horizontal position and heading, safe altitude for that
  world's surface, level attitude, default Throttle, neutral steering, and fresh idle/hint
  timers. Ended gestures and queued menu input MUST NOT carry into it.
- **FR-017**: Returning to flight through Fly or Cancel MUST require fresh steering input;
  a stationary pointer or a finger already used by the chooser MUST NOT steer automatically.
  Cancel retains the previous Throttle, speed, attitude, and Autopilot state.
- **FR-018**: Fly MUST initiate only one launch at a time. During preparation, the app MUST
  communicate that it is preparing the selected world and prevent duplicate launches or
  selection changes.
- **FR-019**: A new flight MUST become active only when its terrain, surfaces, sky, and safe
  starting view are ready together. There MUST be no visible mix of old and new Themes.
- **FR-020**: A failed launch MUST retain the chooser selection, explain failure, and permit
  retry or another selection. A prior flight MUST remain recoverable through Cancel during
  preparation or after failure; an abandoned launch MUST NOT replace a resumed flight.

**Presentation and compatibility**

- **FR-021**: On each new flight, the existing one-line control hint MUST appear, then fade
  on first steering input or after six seconds of active flight. Cancel MUST resume its prior
  hint state instead of showing a new hint.
- **FR-022**: Outside the chooser and temporary launch/error feedback, the only flight UI
  MUST be Change theme and the temporary control hint.
- **FR-023**: Theme previews MUST represent the specified landforms and colour relationships,
  including the existing look for Alien Planet. They need not reproduce the current Seed.
  Selecting a preview MUST NOT replace the paused world or start a live Theme preview.
- **FR-024**: The feature MUST retain the constitution's performance, procedural-content,
  and flight-input constraints. Pausing for selection MUST NOT relax the initial rendering
  budget or the per-Theme flight performance budgets.

### Key Entities *(include if feature involves data)*

- **Theme**: A named complete world preset combining terrain character, regional parameters,
  palette, surfaces, sky, fog, and lighting. The initial set is Nature, Alien Planet, Arctic.
- **Theme Chooser**: The pre-flight or paused-flight view that presents the available Themes
  and a pending selection. Fly commits that selection; Cancel preserves an existing flight.
- **Flight**: One continuous run of the Plane in a Theme and Seed, with its current pose,
  speed, Throttle, camera view, idle state, and hint state. Restart creates a new run.
- **Seed**: The existing reproducibility value. It identifies a particular landscape within
  a Theme; the same number need not produce the same heights across different Themes.
- **Biome**: Regional variation within a Theme, distinct from the world-wide Theme choice.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Within two seconds of navigation over simulated 4G, the initial Nature scene
  and usable chooser are visible on the reference devices. The scene remains stationary until
  Fly. Initial rendering is measured separately from the visitor's decision time.
- **SC-002**: From the initial ready chooser, Nature needs one activation of Fly; either other Theme
  needs one selection and one activation. For all three Themes, a ready, controllable flight
  appears within two seconds of Fly on the reference devices.
- **SC-003**: Across all three Themes at the same Seed and reference viewpoints, visual review
  confirms every cue in FR-007 through FR-009, distinct terrain shapes, and previews consistent
  with their worlds. Alien Planet retains the First Flight reference appearance.
- **SC-004**: In every directed Theme change and same-Theme restart on desktop and touch,
  Fly launches the selected world from its starting state. Cancel, including after 60 seconds
  paused or a hidden tab, preserves the prior flight without movement during the pause,
  accidental steering, or catch-up.
- **SC-005**: Repeating a flight with the same Theme and Seed produces matching terrain and
  lake or frozen-lake positions; reloading after any Theme always selects Nature.
- **SC-006**: Each Theme sustains the existing 60 fps laptop and 30 fps phone targets during
  a five-minute representative flight. Fifty consecutive Theme changes do not cause failure,
  sustained growth in browser memory usage after warm-up, mixed-theme frames, or a breach of
  those targets.
- **SC-007**: The chooser passes its selection, launch, cancel, failure/retry, resize, and
  orientation scenarios on mouse and touch; every menu action is also usable by keyboard with
  a visible focus indicator. Flight steering remains pointer/touch-only.

## Assumptions

### Defaults adopted after the interview

- The preview-style question was skipped with an instruction to continue. Use representative
  visual cards with names and descriptions; live preview is excluded. Previews follow the
  constitution's procedural-content rule and do not require external image assets.
- On reopening the chooser, select the currently flown Theme. Pause the entire flight while
  browsing. Retain one Seed for the page visit so restarting is distinct from generating a
  new random world. These are defaults consistent with the agreed resume/restart behaviour.
- New Themes retain the existing mountain/valley regional band structure with their own
  terrain character and presentation. New named Biomes or a different regional layout are not
  required. Themes keep fixed lighting, still surfaces, and colour-based ground cover.
- The initial scene is paused Nature behind the chooser. Card selection changes only the
  pending choice; it does not rebuild that background. This reconciles explicit Fly with
  the existing first-rendered-frame budget.
- Reference devices retain First Flight's definition: a three-year-old integrated-GPU laptop
  and a three-year-old mid-tier Android phone or iPhone. The two-second launch target and
  repeated-switch checks are acceptance targets to verify during implementation.

### Scope and dependencies

- Depends on First Flight's Plane, flight controls, terrain streaming, regional transitions,
  Seed handling, and safe camera/floor behaviour. Its remaining
  [convergence tasks](../001-first-flight/tasks.md#phase-9-convergence) remain open work;
  this specification does not certify that those issues are resolved. Planning must account
  for overlap, especially rendering, startup, input lifecycle, and terrain continuity.
- Night, Desert, Ocean, user-authored Themes, separate time-of-day controls, remembered
  preferences, Theme-sharing links, seamless in-flight world changes, different gravity,
  weather, new objects, animated water, audio, and new flight mechanics are outside this release.
- This feature supersedes First Flight's immediate no-click flight start (FR-001 and User
  Story 1/AC1) and hint-only UI (FR-030 and User Story 5). Flight begins after Fly; the hint
  lifecycle is per new flight and Change theme is available during flight.
- First Flight's world appearance requirements (FR-019 and FR-022 variants) become the
  Alien Planet baseline rather than global requirements for every Theme. Its deterministic
  world requirement (FR-017) is qualified by Theme plus Seed. Its no-keyboard-controls rule
  continues to apply to flying; standard keyboard menu navigation is allowed.
- The [constitution](../../.specify/memory/constitution.md) remains governing. This
  specification proposes no amendment to its performance budgets or dependency rules.
