// Startup/flight session state machine (002 T023): pure transitions only — no DOM, renderer
// or preparation internals. src/ui/chooser.ts adapts DOM events; src/main.ts performs the
// world/prep work the returned requests describe. Contracts: contracts/lifecycle.md.
import type { ThemeId } from "./themes";
import { DEFAULT_AIRCRAFT, type AircraftTypeId } from "./aircraft";
import type { PlaneState } from "./flight";
import type { CameraPose } from "./camera";
import type { AutopilotState } from "./autopilot";
import type { ChunkKey } from "./chunks";
import { CHOOSER_CHUNKS_PER_FRAME, CHUNKS_PER_FRAME } from "../constants";

export type ChooserPhase = "booting" | "choosing" | "preparing" | "flying" | "restoring";
export type SessionErrorKind = "startup" | "launch" | "restore";
export type PreparationRequestKind = "startup" | "launch" | "restore";

export interface SessionError {
  kind: SessionErrorKind;
  themeId: ThemeId | null;
  message: string;
}

export interface ChooserState {
  phase: ChooserPhase;
  /** Pending card selection — locked while preparing/restoring. */
  selection: ThemeId;
  /** Pending aircraft card — locked while preparing/restoring. */
  aircraftSelection: AircraftTypeId;
  /** The committed world's theme; null until the first Fly lands. */
  active: ThemeId | null;
  /** The committed Flight's aircraft; null until the first Fly lands. */
  activeAircraft: AircraftTypeId | null;
  /** The single page Seed chosen at boot. */
  seed: number;
  /** Monotonic operation token: startup, launches (incl. same-theme) and restores bump it. */
  generation: number;
  /** A FlightSnapshot exists (caller-owned) — enables Change-theme Cancel. */
  hasPriorFlight: boolean;
  /** The snapshot's terrain is still resident — Cancel may resume directly. Cleared when
   * Fly releases it (preparing begins) or after a failed restore. */
  priorTerrainResident: boolean;
  error: SessionError | null;
}

export interface PreparationRequest {
  generation: number;
  themeId: ThemeId;
  aircraftType: AircraftTypeId;
  seed: number;
  kind: PreparationRequestKind;
}

// --- FlightSnapshot (T045, data-model): "small, flat, and allocated once". The caller
// creates it once and rewires it in place at every pause — nothing here holds GPU
// resources. chunkManifest records which resident keys the paused world held so a rebuilt
// Cancel can restore the same coverage (LOD and morph state derive from key + position).
export interface FlightSnapshot {
  themeId: ThemeId;
  aircraftType: AircraftTypeId;
  seed: number;
  plane: PlaneState; // value copies — never the live objects
  prev: PlaneState;
  pose: CameraPose;
  posePrev: CameraPose;
  simTime: number;
  /** Master spinner phase frozen at pause — resumed without catch-up. */
  spinPhase: number;
  accumulator: number;
  throttle: number;
  lastInputTime: number;
  inputActive: boolean;
  autopilot: AutopilotState;
  inputSeen: boolean;
  hintHidden: boolean;
  /** CSS opacity at pause time — the hint fade resumes from exactly this point. */
  hintOpacity: number;
  chunkManifest: ChunkKey[];
}

/** Bounded manifest: the resident disc can hold ~800 chunks; a snapshot caps it. */
export const SNAPSHOT_MANIFEST_CAP = 1024;

export function copyPlaneState(out: PlaneState, src: PlaneState): void {
  out.position.copy(src.position);
  out.orientation.copy(src.orientation);
  out.heading = src.heading;
  out.pitch = src.pitch;
  out.roll = src.roll;
  out.speed = src.speed;
}

export function copyCameraPose(out: CameraPose, src: CameraPose): void {
  out.position.copy(src.position);
  out.target.copy(src.target);
  out.up.copy(src.up);
}

export function copyAutopilot(out: AutopilotState, src: AutopilotState): void {
  out.engaged = src.engaged;
  out.engagedAt = src.engagedAt;
  out.lastSeenInputTime = src.lastSeenInputTime;
}

export function createSession(seed: number): ChooserState {
  return {
    phase: "booting",
    selection: "nature",
    aircraftSelection: DEFAULT_AIRCRAFT,
    active: null,
    activeAircraft: null,
    seed,
    generation: 0,
    hasPriorFlight: false,
    priorTerrainResident: false,
    error: null,
  };
}

/** Chunks the world may fill this frame: faster behind the first-load chooser, before any
 * Flight exists. Change-theme browsing keeps the flight rate so the snapshot stays exact. */
export function chunkFillBudget(s: ChooserState): number {
  const firstLoad = s.active === null && (s.phase === "booting" || s.phase === "choosing");
  return firstLoad ? CHOOSER_CHUNKS_PER_FRAME : CHUNKS_PER_FRAME;
}

export function isBusy(s: ChooserState): boolean {
  return s.phase === "preparing" || s.phase === "restoring";
}

/** Cancel is offered only when a prior Flight exists and no operation is running. */
export function canCancel(s: ChooserState): boolean {
  return s.hasPriorFlight && s.phase === "choosing";
}

/**
 * The UI affordance is broader than the direct path: while a preparation is live, Cancel
 * abandons the candidate and rebuilds the paused world (T050). Booting, flying and
 * restoring still never offer it.
 */
export function cancelOffered(s: ChooserState): boolean {
  return s.hasPriorFlight && (s.phase === "choosing" || s.phase === "preparing");
}

/** All three previews decoded and the stationary background is live. */
export function bootReady(s: ChooserState): void {
  if (s.phase === "booting") {
    s.phase = "choosing";
    s.error = null;
  }
}

/** Startup partially failed: chooser opens degraded with a startup error and retry. */
export function bootFailed(s: ChooserState, message: string): void {
  if (s.phase !== "booting") return;
  s.phase = "choosing";
  s.error = { kind: "startup", themeId: null, message };
}

/** Card selection: choosing only — never touches background or previews. */
export function selectTheme(s: ChooserState, id: ThemeId): boolean {
  if (s.phase !== "choosing") return false;
  s.selection = id;
  return true;
}

/** Aircraft card selection: choosing only — committed by the next successful Fly. */
export function selectAircraft(s: ChooserState, id: AircraftTypeId): boolean {
  if (s.phase !== "choosing") return false;
  s.aircraftSelection = id;
  return true;
}

/**
 * Fly pressed: choosing -> preparing under a new generation. A startup error retries the
 * unfinished startup work first, so that launch reports kind "startup". Selection locks.
 */
export function pressFly(s: ChooserState): PreparationRequest | null {
  if (s.phase !== "choosing") return null;
  s.generation += 1;
  s.phase = "preparing";
  s.priorTerrainResident = false; // Fly releases the paused residency to the shared pool
  const kind: PreparationRequestKind = s.error?.kind === "startup" ? "startup" : "launch";
  s.error = null;
  return {
    generation: s.generation,
    themeId: s.selection,
    aircraftType: s.aircraftSelection,
    seed: s.seed,
    kind,
  };
}

/** Generation-checked commit: only the live token lands the world. */
export function preparationReady(s: ChooserState, generation: number): boolean {
  if (s.phase !== "preparing" || generation !== s.generation) return false;
  s.active = s.selection;
  s.activeAircraft = s.aircraftSelection;
  s.hasPriorFlight = true;
  s.phase = "flying";
  s.error = null;
  return true;
}

export function preparationFailed(
  s: ChooserState,
  generation: number,
  message: string,
): boolean {
  if (s.phase !== "preparing" || generation !== s.generation) return false;
  const kind: SessionErrorKind =
    s.active === null ? "startup" : "launch";
  s.phase = "choosing";
  s.error = { kind, themeId: s.selection, message };
  return true;
}

/** Change theme from flight: freeze + snapshot (caller), reopen with the active selected. */
export function openChooser(s: ChooserState): boolean {
  if (s.phase !== "flying") return false;
  s.phase = "choosing";
  s.selection = s.active ?? s.selection;
  s.aircraftSelection = s.activeAircraft ?? s.aircraftSelection;
  s.priorTerrainResident = true; // the paused world stays resident while browsing
  s.error = null;
  return true;
}

/**
 * Cancel from the chooser. "resume" — prior terrain still resident, restore the snapshot
 * directly under a new generation. "restoring" — the candidate generation was invalidated
 * and the caller must rebuild the snapshot world before restoreReady.
 */
export function pressCancel(s: ChooserState): "resume" | "restoring" | null {
  if (!s.hasPriorFlight) return null;
  if (s.phase === "choosing") {
    s.generation += 1;
    s.error = null;
    s.selection = s.active ?? s.selection;
    s.aircraftSelection = s.activeAircraft ?? s.aircraftSelection;
    if (s.priorTerrainResident) return "resume";
    s.phase = "restoring";
    return "restoring";
  }
  if (s.phase === "preparing") {
    s.generation += 1;
    s.phase = "restoring";
    s.error = null;
    s.aircraftSelection = s.activeAircraft ?? s.aircraftSelection;
    return "restoring";
  }
  return null; // flying / restoring / booting
}

/** Generation-checked restore completion: land back on the snapshot's world. */
export function restoreReady(s: ChooserState, generation: number): boolean {
  if (generation !== s.generation) return false;
  if (s.phase !== "restoring" && s.phase !== "choosing") return false;
  s.phase = "flying";
  s.selection = s.active ?? s.selection;
  s.aircraftSelection = s.activeAircraft ?? s.aircraftSelection;
  s.error = null;
  return true;
}

export function restoreFailed(
  s: ChooserState,
  generation: number,
  message: string,
): boolean {
  if (s.phase !== "restoring" || generation !== s.generation) return false;
  s.phase = "choosing";
  s.priorTerrainResident = false;
  s.error = { kind: "restore", themeId: s.active, message };
  return true;
}
