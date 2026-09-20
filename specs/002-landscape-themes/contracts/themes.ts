// Planning declarations only; not imported by the application.
// Sampling and stepping reuse caller-owned state. Creation may allocate outside flight.
import type { Vector3 } from "three/src/math/Vector3.js";
import type { BiomeParams } from "../../../src/sim/biome";
import type { PlaneState } from "../../../src/sim/flight";
import type { CameraPose } from "../../../src/sim/camera";
import type { FlightInput } from "../../../src/sim/input";

export type ThemeId = "nature" | "alien" | "arctic";

export interface ThemeShaping {
  readonly warpStrength: number;
  readonly detailAmplitude: number;
  readonly valleyWidth: number;
  readonly valleyFlatness: number;
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
  readonly forestStrength: number;
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
  readonly densityScale: number;
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

export declare const PREVIEW_SEED: number;
export declare const THEMES: readonly [Theme, Theme, Theme];
export declare function themeById(id: ThemeId): Theme;

export interface WorldContext {
  readonly theme: Theme;
  readonly seed: number;
}

export declare function biomeParamsAt(x: number, world: WorldContext, out: BiomeParams): BiomeParams;
export declare function heightAt(x: number, z: number, world: WorldContext): number;
export declare function normalAt(x: number, z: number, world: WorldContext, out: Vector3): Vector3;

export declare function surfaceHeightAt(x: number, z: number, world: WorldContext): number;

export declare function createPlaneState(world: WorldContext): PlaneState;
export declare function stepFlight(
  state: PlaneState, input: FlightInput, dt: number, world: WorldContext,
): void;
export declare function stepCamera(pose: CameraPose, plane: PlaneState, dt: number, world: WorldContext): void;
