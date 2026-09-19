# Flying Planes

A browser app in which a single plane, flown by pointer and touch gestures, flies over
procedurally generated landscapes. This is the only context in the repo.

## Language

### Flight

**Plane**:
The single aircraft the user flies. There is exactly one per session.
_Avoid_: aircraft, player, ship

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

**Autopilot**:
The idle behaviour that levels the Plane and applies gentle banking after a period with no input.
_Avoid_: idle mode, demo mode, screensaver

**Chase Camera**:
The camera that follows behind and slightly above the Plane, derived from Plane state.
_Avoid_: follow camera, third-person camera

### World

**Seed**:
The integer from which the entire world is deterministically generated. Same Seed, same world.
_Avoid_: random seed, world id

**Terrain Chunk**:
A fixed-size square tile of terrain, generated on demand around the Plane and discarded when
out of range.
_Avoid_: tile, patch, cell

**Biome**:
A named parameter set (terrain noise, palette, sky, fog, lighting) that gives a region of the
world its look. The world is a sequence of Biomes with transitions between them.
_Avoid_: landscape, level, theme, region
