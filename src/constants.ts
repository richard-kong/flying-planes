// Every tunable number in one place (research.md "Starting constants").
// Units: metres, seconds, radians. Plain consts only — nothing allocated per access.

// World scale
export const CRUISE_SPEED = 60;
export const MIN_SPEED = 35;
export const MAX_SPEED = 110;
export const BAND_WIDTH = 3600;
export const TRANSITION_WIDTH = 600;
export const CHUNK_SIZE = 256;
export const VIEW_RINGS = 16;
export const LOD_RINGS: readonly number[] = [2, 7, 16];
export const LOD_RESOLUTIONS: readonly number[] = [64, 32, 16];
export const CHUNKS_PER_FRAME = 2;
/** Fill budget behind the first-load chooser (002 contract: chooser fill). */
export const CHOOSER_CHUNKS_PER_FRAME = 6;
export const POOL_PER_LOD: readonly number[] = [32, 240, 680];
// Water/ice geometry is lazy and only needs to cover the resident view plus replacements.
// Per-LOD limits match each band's maximum occupancy in the 16-ring view, with headroom for
// LOD swaps; their sum is bounded by the resident mesh cap rather than all terrain pool slots.
export const SURF_POOL_PER_LOD: readonly number[] = [32, 208, 592];
// chunk units: how far inside a lod band's outer edge vertices morph toward the
// next-coarser sampling (hides the lod swap, T056)
export const LOD_MORPH_BAND = 1.5;
export const SKIRT_DEPTH = 30;
export const SPECKLE_SIZE = 24;
export const WATER_LEVEL = 120;
export const MIN_ALTITUDE_ABOVE_TERRAIN = 40;

// Flight envelope
export const MAX_ROLL = (45 * Math.PI) / 180;
export const MAX_PITCH = (30 * Math.PI) / 180;
export const LEVEL_OUT_TIME = 2;
export const TURN_RATE_PER_ROLL = 0.9;
export const MAX_ACCEL = 20;

// Autopilot
export const IDLE_TO_AUTOPILOT = 5;
export const AUTOPILOT_BANK_AMPL = (12 * Math.PI) / 180;
export const AUTOPILOT_BANK_HZ = 0.1;

// Chase camera
export const CAMERA_OFFSET_X = 0;
export const CAMERA_OFFSET_Y = 18;
export const CAMERA_OFFSET_Z = -55;
export const CAMERA_SPRING = 4;
export const CAMERA_ROLL_FOLLOW = 0.3;
export const CAMERA_MIN_CLEARANCE = 15;
export const CAMERA_LOOK_AHEAD = 60;

// Sun (world-fixed direction)
export const SUN_ELEVATION = (12 * Math.PI) / 180;
export const SUN_AZIMUTH = (60 * Math.PI) / 180;
export const SUN_DIR_X = Math.cos(SUN_ELEVATION) * Math.cos(SUN_AZIMUTH);
export const SUN_DIR_Y = Math.sin(SUN_ELEVATION);
export const SUN_DIR_Z = Math.cos(SUN_ELEVATION) * Math.sin(SUN_AZIMUTH);

// Simulation loop
export const SIM_DT = 1 / 120;
export const MAX_SIM_STEPS_PER_FRAME = 8;
export const MAX_DPR = 1.5;

// Input
export const TOUCH_FULL_DEFLECTION_PX = 160;
export const THROTTLE_STEP = 0.1;

// Hint
export const HINT_TIMEOUT = 6;

// Palette — Color-ready numbers (0xRRGGBB). Reference hues per FR-022a/c/e/g.
export const COLOR_SNOW = 0xf0d8e8; // pale pink-white
export const COLOR_ROCK = 0x4e4460; // cool violet-grey
export const COLOR_FOREST = 0x1f2e3a; // deep blue-green
export const COLOR_VEGETATION = 0x4e6a55; // muted sage
export const COLOR_SHORELINE = 0x6a6070; // soft grey-mauve
export const COLOR_LAKE_NEAR = 0xffd9c8; // warm gold, near shore
export const COLOR_LAKE_DEEP = 0xffc98a; // warm gold, sun-dominated
export const COLOR_SUN_DISC = 0xfff0b0; // pale gold disc
export const COLOR_SUN_HALO = 0xffd27a; // soft warm halo
export const COLOR_SKY_HORIZON = 0xffe3c8; // peach
export const COLOR_SKY_MID = 0xf2b8c6; // soft pink
export const COLOR_SKY_ZENITH = 0x8fb3e6; // pale blue
export const COLOR_FOG_NEAR = 0xcbbde6; // lavender
export const COLOR_FOG_FAR = 0xd8cdef; // lighter lavender
