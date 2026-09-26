// Planning declarations only; not imported by the application.
// Pure records live in src/sim/aircraft.ts; builders and lights in src/render/aircraft.ts.
import type { Group, Object3D, HemisphereLight, DirectionalLight } from "three";
import type { ThemeId, Theme } from "../../../src/sim/themes";
import type { PlaneState } from "../../../src/sim/flight";
import type { CameraPose } from "../../../src/sim/camera";
import type { AutopilotState } from "../../../src/sim/autopilot";
import type { ChunkKey } from "../../../src/sim/chunks";

// --- pure (headless-testable) -------------------------------------------------------------

export type AircraftTypeId = "helicopter" | "light" | "fighter" | "airliner" | "biplane" | "glider";

export interface SpinnerSpec {
  readonly name: "propeller" | "mainRotor" | "tailRotor";
  /** local rotation axis of the pivot group */
  readonly axis: "x" | "y" | "z";
  /** radians per simulated second; constant, independent of Throttle */
  readonly rate: number;
}

export interface AircraftType {
  readonly id: AircraftTypeId;
  readonly name: string;
  readonly description: string;
  readonly spinners: readonly SpinnerSpec[];
  /** natural airframe metres, excluding rotor/prop discs; drives the SC-002 headless check */
  readonly footprint: { readonly length: number; readonly span: number };
}

export declare const AIRCRAFT: readonly [AircraftType, AircraftType, AircraftType, AircraftType, AircraftType, AircraftType];
export declare const DEFAULT_AIRCRAFT: AircraftTypeId; // "light"
/** shared on-screen footprint (metres): the original 8 m box plane at scale 0.64, enlarged 1.5x */
export declare const PLANE_FOOTPRINT: number; // 7.68
export declare function aircraftById(id: AircraftTypeId): AircraftType;
/** scale factor that maps max(length, span) onto PLANE_FOOTPRINT */
export declare function footprintScale(type: AircraftType): number;

// session.ts deltas
export interface ChooserStateDelta {
  aircraftSelection: AircraftTypeId; // pending card; "light" at boot
  activeAircraft: AircraftTypeId | null; // committed with the Theme at preparationReady
}
export interface PreparationRequestDelta {
  aircraftType: AircraftTypeId;
}
export interface FlightSnapshotDelta {
  aircraftType: AircraftTypeId;
  /** master spinner phase (radians) frozen at pause and resumed without catch-up */
  spinPhase: number;
}
export declare function selectAircraft(s: ChooserStateDelta & { phase: string }, id: AircraftTypeId): boolean;

/** advance the shared phase by one fixed step; pure, allocation-free */
export declare function stepSpin(phase: number, dt: number): number;

// --- render (browser smoke only) ----------------------------------------------------------

export interface Aircraft {
  readonly type: AircraftTypeId;
  /** normalised, centred, forward +Z / up +Y; added to the scene once, toggled via visible */
  readonly group: Group;
  /** pivots in AircraftType.spinners order; main.ts writes rotation[axis] = phase * rate */
  readonly spinners: readonly Object3D[];
}

export interface AircraftLights {
  readonly hemi: HemisphereLight;
  readonly sun: DirectionalLight;
}

export declare function buildAircraft(type: AircraftType): Aircraft; // boot only, allocates
export declare function disposeAircraft(a: Aircraft): void;
export declare function createAircraftLights(): AircraftLights;
/** copy Theme sky/sun into the two lights; called at commit/restore, never per frame */
export declare function applyThemeToLights(lights: AircraftLights, theme: Theme): void;

// previews.ts deltas
export type PreviewCardKey = { kind: "theme"; id: ThemeId } | { kind: "aircraft"; id: AircraftTypeId };
export interface AircraftCard {
  kind: "aircraft";
  aircraftType: AircraftTypeId;
  status: "pending" | "ready" | "failed";
  url: string | null;
}

// ui/chooser.ts deltas
export interface ChooserCallbacksDelta {
  onSelectAircraft(id: AircraftTypeId): void;
}
export interface ChooserHandleDelta {
  setCardImage(key: PreviewCardKey, url: string | null, failed?: boolean): void;
}

// unchanged types referenced so this contract typechecks against the live modules
export type Unchanged = PlaneState | CameraPose | AutopilotState | ChunkKey;
