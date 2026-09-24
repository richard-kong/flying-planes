# Flying Planes

A browser app in which a single plane, flown by pointer and touch gestures, flies over
procedurally generated landscapes. This is the only context in the repo.

## Language

### Flight

**Flight**:
A continuous run of the Plane in one Theme, Seed and Aircraft Type. A pause preserves the
run; a restart begins a new one.
_Avoid_: game, level, round

**Plane**:
The single aircraft the user flies. There is exactly one per session. Its appearance is set
by its Aircraft Type; the term Plane covers every type including helicopter and glider.
_Avoid_: aircraft, player, ship

**Aircraft Type**:
The Plane's selected visual design: one of helicopter, light plane, fighter jet, passenger
jet, biplane or glider. Aircraft Type changes appearance only; every type flies the same
Flight Model.
_Avoid_: model, skin, livery

**Spinner**:
A propeller or rotor pivot on an Aircraft Type's mesh, driven by a shared spin phase that
advances only during active flight and freezes on pause.
_Avoid_: animation, motor

**Flight Model**:
The pure function that turns a Steer Vector, Throttle, and elapsed time into the Plane's next
state (position, orientation, speed).
_Avoid_: physics, controller, simulation

**Steer Vector**:
A normalised 2D value in [-1, 1] x [-1, 1] expressing the desired pitch and roll, produced from
mouse offset or touch drag. The Flight Model's only steering input.
_Avoid_: controls, input, joystick

**Throttle**:
A normalised value in [0, 1] expressing desired speed, produced from the mouse wheel or pinch.
_Avoid_: speed, power, gas

**Soft Floor**:
The minimum height above the terrain below which the Plane cannot descend; reaching it eases
the Plane upward. There is no crash.
_Avoid_: collision, ground clamp, crash

**Autopilot**:
The idle behaviour that levels the Plane and applies gentle banking after a period with no input.
_Avoid_: idle mode, demo mode, screensaver

**Chase Camera**:
The camera that follows behind and slightly above the Plane, derived from Plane state.
_Avoid_: follow camera, third-person camera

### World

**Seed**:
The integer from which a Theme's world is deterministically generated. Same Theme and Seed,
same world.
_Avoid_: random seed, world id

**Theme**:
A complete world preset combining terrain character, regional variation, surface colours,
sky, fog, and lighting; feature 002 specifies Nature, Alien Planet, and Arctic.
_Avoid_: biome, skin, filter

**Flight Chooser**:
The view for selecting Theme and Aircraft Type before starting or restarting a Flight, in
two labelled sections (World and Aircraft) with one Fly/Cancel bar. Each pending choice is
separate from the active Flight's selections.
_Avoid_: settings, theme chooser, aircraft picker

**Terrain Chunk**:
A fixed-size square tile of terrain, generated on demand around the Plane and discarded when
out of range.
_Avoid_: tile, patch, cell

**Biome**:
A named parameter set (terrain noise, altitude thresholds, fog density, lake frequency) that
gives a Biome Region its shape. Current Biomes: Alpine, Foothills. Sky, sun, fog colour, water
level, and palette are shared by all Biomes in feature 001 (Pastel Dawn mood).
_Avoid_: landscape, level, theme

**Biome Region**:
A band of the world, spanning it along one fixed axis, assigned exactly one Biome. Bands
alternate across that axis; flying parallel to the bands stays in one Biome.
_Avoid_: zone, area, sector

**Biome Transition**:
The fixed-width zone between two adjacent Biome Regions where their parameters blend as a
function of position across the band axis.
_Avoid_: boundary, border, blend zone

**Band Weight**:
The blend factor in [0, 1] produced by `bandWeight(x, seed)`: 0 deep inside an Alpine Biome
Region, 1 deep inside a Foothills one, 0.5 at each Biome Transition centreline. Drives both
terrain shaping and the per-vertex shading parameters.
_Avoid_: mix factor, lerp weight

**Chunk Grid**:
The live set of Terrain Chunks kept resident around the Plane: a Euclidean disc of chunk
cells in `VIEW_RINGS` rings, each at a level of detail chosen by its Chebyshev ring.
`ChunkGrid.update` diffs wanted vs resident into caller-supplied load/free lists.
_Avoid_: tile cache, streaming map

### Session

**Flight Snapshot**:
The small flat record captured once when a Flight pauses for the Flight Chooser: plane,
previous plane, camera pose pair, sim clock, accumulator, saved Throttle/activity, Autopilot,
hint progress and the bounded chunk manifest. It is owned by the session runtime, holds no
GPU resources, and is discarded only when a later Fly or restore commits.
_Avoid_: save file, checkpoint, undo state

**Preparation Job**:
The single live world build for a Fly or rebuilt Cancel, deadline-sliced across frames
under a monotonic generation token. Candidates fill private tables and land atomically at
commit; a stale token can never write to or free a later generation's resources.
_Avoid_: loading task, world switch, async load

**Chooser Phase**:
The session's phase (booting, choosing, preparing, flying, restoring), mirrored to
`body.dataset.phase`. Cancel is offered while choosing or preparing when a Flight Snapshot
exists; it resumes directly if the paused terrain is still resident and otherwise rebuilds.
_Avoid_: app state, screen, mode
