// Theme presets (002, contract themes.ts): three complete worlds — Nature, Alien, Arctic.
// A Theme carries the two Biome endpoints the band blend interpolates, post-ridge shaping,
// the water/ice surface, and the full palette/sky/fog/lighting set the renderer applies.
// Alien's bands and palette reproduce First Flight's values verbatim; shaping is bypassed.
// All records are deeply frozen at module load — WorldContext carries them by reference.
import {
  SUN_DIR_X,
  SUN_DIR_Y,
  SUN_DIR_Z,
  WATER_LEVEL,
} from "../constants";
import { ALPINE, FOOTHILLS, type BiomeParams } from "./biome";

export type ThemeId = "nature" | "alien" | "arctic";

export interface ThemeShaping {
  readonly warpStrength: number;
  readonly detailAmplitude: number;
  readonly valleyWidth: number; // [0, 1)
  readonly valleyFlatness: number; // [0, 1]; 0 = bypass transform
}

export interface ThemeSurface {
  readonly level: number;
  readonly kind: "water" | "ice";
}

export interface ThemePalette {
  readonly vegetation: number;
  readonly forest: number;
  readonly rock: number;
  readonly snow: number;
  readonly shoreline: number;
  readonly lakeNear: number;
  readonly lakeDeep: number;
  readonly forestStrength: number; // 0 disables the forest blend entirely (Arctic)
}

export interface ThemeSky {
  readonly zenith: number;
  readonly mid: number;
  readonly horizon: number;
  readonly sunDisc: number;
  readonly sunHalo: number;
  readonly sunDirection: readonly [number, number, number];
  readonly haloStrength: number;
}

export interface ThemeFog {
  readonly near: number;
  readonly far: number;
  readonly densityScale: number; // multiplies the per-band fogDensity
}

export interface ThemeLighting {
  readonly ambientStrength: number;
  readonly keyStrength: number;
  readonly coolTint: readonly [number, number, number];
  readonly warmTint: readonly [number, number, number];
  readonly surfaceSpecularStrength: number;
  readonly surfaceShininess: number;
}

export interface ThemePreview {
  readonly cameraPosition: readonly [number, number, number];
  readonly cameraTarget: readonly [number, number, number];
}

export interface Theme {
  readonly id: ThemeId;
  readonly name: string;
  readonly description: string;
  readonly bands: readonly [Readonly<BiomeParams>, Readonly<BiomeParams>];
  readonly shaping: ThemeShaping;
  readonly surface: ThemeSurface;
  readonly palette: ThemePalette;
  readonly sky: ThemeSky;
  readonly fog: ThemeFog;
  readonly lighting: ThemeLighting;
  readonly preview: ThemePreview;
}

export interface WorldContext {
  readonly theme: Theme;
  readonly seed: number;
}

// Fixed card seed (contract): previews never consume the page Seed.
export const PREVIEW_SEED = 31337;

function sunDir(x: number, y: number, z: number): readonly [number, number, number] {
  const l = Math.hypot(x, y, z);
  return Object.freeze([x / l, y / l, z / l] as [number, number, number]);
}

function freezeTheme<T extends Theme>(theme: T): T {
  Object.freeze(theme.bands);
  Object.freeze(theme.shaping);
  Object.freeze(theme.surface);
  Object.freeze(theme.palette);
  Object.freeze(theme.sky.sunDirection);
  Object.freeze(theme.sky);
  Object.freeze(theme.fog);
  Object.freeze(theme.lighting.coolTint);
  Object.freeze(theme.lighting.warmTint);
  Object.freeze(theme.lighting);
  Object.freeze(theme.preview.cameraPosition);
  Object.freeze(theme.preview.cameraTarget);
  Object.freeze(theme.preview);
  return Object.freeze(theme);
}

function biome(p: BiomeParams): Readonly<BiomeParams> {
  return Object.freeze({ ...p });
}

// --- Nature: approved N4 "Limestone Lakes" cues — green foothills and forest bands, pale
// limestone faces, white snow, turquoise lakes, clear daylight. Gentler than Alien and
// bypasses valley shaping like the baseline generator.
const NATURE = freezeTheme({
  id: "nature",
  name: "Nature",
  description: "Earth-like valleys: green forests, pale limestone, turquoise lakes",
  bands: [
    biome({
      amplitude: 1350,
      baseFrequency: 1 / 1500,
      ridgeSharpness: 0.45,
      heightOffset: 30,
      snowHeight: 840,
      forestTop: 460,
      forestBottom: 150,
      rockSlope: 0.72,
      fogDensity: 0.9,
    }),
    biome({
      amplitude: 500,
      baseFrequency: 1 / 950,
      ridgeSharpness: 0.12,
      heightOffset: -40,
      snowHeight: 500,
      forestTop: 330,
      forestBottom: 120,
      rockSlope: 0.82,
      fogDensity: 0.75,
    }),
  ],
  shaping: Object.freeze({ warpStrength: 260, detailAmplitude: 0.05, valleyWidth: 0, valleyFlatness: 0 }),
  surface: Object.freeze({ level: 110, kind: "water" as const }),
  palette: Object.freeze({
    vegetation: 0x74894f,
    forest: 0x295340,
    rock: 0xc5beb0,
    snow: 0xf3f4ec,
    shoreline: 0x9aa08c,
    lakeNear: 0x67b3b6,
    lakeDeep: 0x267f99,
    forestStrength: 1,
  }),
  sky: Object.freeze({
    zenith: 0x78b5dc,
    mid: 0xaed4e4,
    horizon: 0xdfece9,
    sunDisc: 0xfff8e8,
    sunHalo: 0xf5eede,
    sunDirection: sunDir(-0.65, 0.75, 0.32),
    haloStrength: 0.35,
  }),
  fog: Object.freeze({ near: 0xcfe4e4, far: 0xe0edea, densityScale: 0.55 }),
  lighting: Object.freeze({
    ambientStrength: 0.62,
    keyStrength: 0.5,
    coolTint: Object.freeze([0.55, 0.68, 0.85] as [number, number, number]),
    warmTint: Object.freeze([1.06, 1.04, 0.98] as [number, number, number]),
    surfaceSpecularStrength: 0.5,
    surfaceShininess: 64,
  }),
  preview: Object.freeze({
    cameraPosition: Object.freeze([0, 1400, 3400] as [number, number, number]),
    cameraTarget: Object.freeze([0, 350, -600] as [number, number, number]),
  }),
});

// --- Alien: the First Flight world, reproduced verbatim. ALPINE/FOOTHILLS are the original
// biome constants; the palette mirrors src/constants.ts colours; shaping bypasses the
// valley transform so every height/normal is bit-identical to the baseline fixtures.
const ALIEN = freezeTheme({
  id: "alien",
  name: "Alien Planet",
  description: "The original world: violet ridges under a pastel dawn, gold lakes",
  bands: [ALPINE, FOOTHILLS],
  shaping: Object.freeze({ warpStrength: 300, detailAmplitude: 0.06, valleyWidth: 0, valleyFlatness: 0 }),
  surface: Object.freeze({ level: WATER_LEVEL, kind: "water" as const }),
  palette: Object.freeze({
    vegetation: 0x4e6a55,
    forest: 0x1f2e3a,
    rock: 0x4e4460,
    snow: 0xf0d8e8,
    shoreline: 0x6a6070,
    lakeNear: 0xffd9c8,
    lakeDeep: 0xffc98a,
    forestStrength: 1,
  }),
  sky: Object.freeze({
    zenith: 0x8fb3e6,
    mid: 0xf2b8c6,
    horizon: 0xffe3c8,
    sunDisc: 0xfff0b0,
    sunHalo: 0xffd27a,
    sunDirection: sunDir(SUN_DIR_X, SUN_DIR_Y, SUN_DIR_Z),
    haloStrength: 0.45,
  }),
  fog: Object.freeze({ near: 0xcbbde6, far: 0xd8cdef, densityScale: 1 }),
  lighting: Object.freeze({
    ambientStrength: 0.72,
    keyStrength: 0.3,
    coolTint: Object.freeze([0.92, 0.95, 1.08] as [number, number, number]),
    warmTint: Object.freeze([1.06, 1.0, 0.94] as [number, number, number]),
    surfaceSpecularStrength: 0.6,
    surfaceShininess: 48,
  }),
  preview: Object.freeze({
    cameraPosition: Object.freeze([0, 1400, 3400] as [number, number, number]),
    cameraTarget: Object.freeze([0, 350, -600] as [number, number, number]),
  }),
});

// --- Arctic: approved A4 "Blue Glacier Basin" cues — broad glacial valleys, sculpted snow
// ridges, saturated blue ice, flat frozen lakes. valleyFlatness drives the shared shaping
// transform toward smoothstep(valleyWidth, 1, s), crushing mid-range terrain into floors.
const ARCTIC = freezeTheme({
  id: "arctic",
  name: "Arctic",
  description: "Blue glacier basins, frozen lakes and sculpted snow ridges",
  bands: [
    biome({
      amplitude: 1500,
      baseFrequency: 1 / 1250,
      ridgeSharpness: 0.6,
      heightOffset: 60,
      snowHeight: 240,
      forestTop: 160,
      forestBottom: 60,
      rockSlope: 0.62,
      fogDensity: 1.0,
    }),
    biome({
      amplitude: 750,
      baseFrequency: 1 / 900,
      ridgeSharpness: 0.3,
      heightOffset: -90,
      snowHeight: 200,
      forestTop: 140,
      forestBottom: 40,
      rockSlope: 0.7,
      fogDensity: 0.9,
    }),
  ],
  shaping: Object.freeze({ warpStrength: 340, detailAmplitude: 0.05, valleyWidth: 0.5, valleyFlatness: 0.8 }),
  surface: Object.freeze({ level: 80, kind: "ice" as const }),
  palette: Object.freeze({
    vegetation: 0xc8dfe9,
    forest: 0xabcddd,
    rock: 0x62798b,
    snow: 0xf2f7fa,
    shoreline: 0x9fc0cf,
    lakeNear: 0xa4dce7,
    lakeDeep: 0x539fbc,
    forestStrength: 0,
  }),
  sky: Object.freeze({
    zenith: 0x82acd2,
    mid: 0xb3cee0,
    horizon: 0xd9e9ef,
    sunDisc: 0xf4fbff,
    sunHalo: 0xdfeaf2,
    sunDirection: sunDir(-0.7, 0.5, 0.275),
    haloStrength: 0.3,
  }),
  fog: Object.freeze({ near: 0xc3dbe7, far: 0xdceaF0, densityScale: 0.6 }),
  lighting: Object.freeze({
    ambientStrength: 0.6,
    keyStrength: 0.45,
    coolTint: Object.freeze([0.5, 0.62, 0.85] as [number, number, number]),
    warmTint: Object.freeze([1.02, 1.03, 1.05] as [number, number, number]),
    surfaceSpecularStrength: 0.35,
    surfaceShininess: 24,
  }),
  preview: Object.freeze({
    cameraPosition: Object.freeze([0, 1400, 3400] as [number, number, number]),
    cameraTarget: Object.freeze([0, 350, -600] as [number, number, number]),
  }),
});

export const THEMES: readonly [Theme, Theme, Theme] = [NATURE, ALIEN, ARCTIC];

export function themeById(id: ThemeId): Theme {
  switch (id) {
    case "nature":
      return NATURE;
    case "alien":
      return ALIEN;
    case "arctic":
      return ARCTIC;
  }
}
