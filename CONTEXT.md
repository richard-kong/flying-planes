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
The integer from which the entire world is deterministically generated. Same Seed, same world.
_Avoid_: random seed, world id

**Terrain Chunk**:
A fixed-size square tile of terrain, generated on demand around the Plane and discarded when
out of range.
_Avoid_: tile, patch, cell

**Biome**:
A named parameter set (terrain noise, palette, sky, fog, lighting, buildings) that gives a Biome
Region its look. Current Biomes: Mountain, City.
_Avoid_: landscape, level, theme

**Biome Region**:
A contiguous stretch of the world assigned exactly one Biome. Regions alternate along the world.
_Avoid_: zone, area, sector

**Biome Transition**:
The fixed-length zone between two adjacent Biome Regions where their parameters blend.
_Avoid_: boundary, border, blend zone
