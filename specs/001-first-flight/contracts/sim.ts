// Contract: public surface of src/sim (pure, DOM-free). Signatures only; bodies live in src/sim.
// Every function writes into caller-supplied `out`/state objects; none allocates per call.

import type { Quaternion, Vector3 } from "three";

// seed.ts
export declare function parseSeed(query: string): number | undefined; // "?seed=42" -> 42
export declare function randomSeed(): number; // uint32

// noise.ts
export declare function hash2(ix: number, iz: number, seed: number): number; // [0, 1)
export declare function valueNoise(x: number, z: number, seed: number): number; // [0, 1]
export declare function fbm(
  x: number, z: number, seed: number, octaves: number, lacunarity: number, gain: number,
): number; // [0, 1]

// biome.ts
export interface BiomeParams {
  amplitude: number;
  baseFrequency: number;
  ridgeSharpness: number;
  heightOffset: number;
  snowHeight: number;
  forestTop: number;
  forestBottom: number;
  rockSlope: number;
  fogDensity: number;
}
export declare const ALPINE: Readonly<BiomeParams>;
export declare const FOOTHILLS: Readonly<BiomeParams>;
export declare function bandWeight(x: number, seed: number): number; // 0 = Alpine, 1 = Foothills
export declare function biomeParamsAt(x: number, seed: number, out: BiomeParams): BiomeParams;

// terrain.ts
export declare function heightAt(x: number, z: number, seed: number): number; // metres
export declare function normalAt(x: number, z: number, seed: number, out: Vector3): Vector3;

// chunks.ts
export interface ChunkKey { cx: number; cz: number; lod: 0 | 1 | 2 }
export declare function lodForRing(ring: number): 0 | 1 | 2;
export interface ChunkGrid {
  /** Recompute wanted set around the Plane; fills `toLoad` (nearest-first) and `toFree`. */
  update(planeX: number, planeZ: number, toLoad: ChunkKey[], toFree: ChunkKey[]): void;
  markResident(key: ChunkKey): void;
  readonly residentCount: number;
}
export declare function createChunkGrid(viewRings: number): ChunkGrid;

// input.ts
export interface FlightInput {
  steerX: number; // [-1, 1]
  steerY: number; // [-1, 1]
  throttle: number; // [0, 1]
  active: boolean;
  lastInputTime: number;
}
export declare function pointerToSteer(
  clientX: number, clientY: number, width: number, height: number, out: FlightInput,
): void;
export declare function touchDragToSteer(dx: number, dy: number, out: FlightInput): void;
export declare function wheelToThrottle(deltaY: number, out: FlightInput): void;
export declare function pinchToThrottle(scaleDelta: number, out: FlightInput): void;
export declare function inputInactive(out: FlightInput): void; // steer -> 0, active -> false

// flight.ts
export interface PlaneState {
  position: Vector3;
  orientation: Quaternion;
  heading: number;
  pitch: number;
  roll: number;
  speed: number;
}
export declare function createPlaneState(seed: number): PlaneState; // start pose above terrain
export declare function stepFlight(
  state: PlaneState, input: FlightInput, dt: number, seed: number,
): void;

// autopilot.ts
export interface AutopilotState { engaged: boolean; phase: number }
export declare function stepAutopilot(
  ap: AutopilotState, input: FlightInput, simTime: number, dt: number, steerOut: FlightInput,
): void;

// camera.ts
export interface CameraPose { position: Vector3; target: Vector3; up: Vector3 }
export declare function stepCamera(
  pose: CameraPose, plane: PlaneState, dt: number, seed: number,
): void;
