// T019 [US1]: startup/session lifecycle state machine. Pure transitions only — no DOM,
// renderer or preparation internals (those live in ui/chooser.ts and render/world.ts).
import { describe, expect, it } from "vitest";
import {
  bootFailed,
  bootReady,
  canCancel,
  copyAutopilot,
  copyCameraPose,
  copyPlaneState,
  createSession,
  isBusy,
  openChooser,
  preparationFailed,
  preparationReady,
  pressCancel,
  pressFly,
  restoreFailed,
  restoreReady,
  selectAircraft,
  selectTheme,
  type ChooserState,
  type FlightSnapshot,
} from "../../src/sim/session";
import { createPlaneState } from "../../src/sim/flight";
import type { AircraftTypeId } from "../../src/sim/aircraft";
import { themeById, type WorldContext } from "../../src/sim/themes";
import { Vector3 } from "three";

function fresh(seed = 42): ChooserState {
  return createSession(seed);
}

function readyChooser(s: ChooserState): ChooserState {
  bootReady(s);
  return s;
}

function flying(s: ChooserState, theme: "nature" | "alien" | "arctic" = "nature"): ChooserState {
  readyChooser(s);
  selectTheme(s, theme);
  const req = pressFly(s);
  expect(req).not.toBeNull();
  preparationReady(s, req!.generation);
  return s;
}

describe("createSession", () => {
  it("boots with Nature selected, one page seed, no snapshot, no Cancel", () => {
    const s = fresh(7);
    expect(s.phase).toBe("booting");
    expect(s.selection).toBe("nature");
    expect(s.seed).toBe(7);
    expect(s.active).toBeNull();
    expect(s.generation).toBe(0);
    expect(s.hasPriorFlight).toBe(false);
    expect(s.error).toBeNull();
    expect(canCancel(s)).toBe(false);
    expect(pressCancel(s)).toBeNull();
  });

  it("keeps the parsed page seed verbatim, including 0 and uint32 max", () => {
    expect(fresh(0).seed).toBe(0);
    expect(fresh(4294967295).seed).toBe(4294967295);
  });
});

describe("boot transitions", () => {
  it("bootReady moves to choosing and enables Fly", () => {
    const s = readyChooser(fresh());
    expect(s.phase).toBe("choosing");
    expect(pressFly(s)).not.toBeNull();
  });

  it("bootFailed lands in choosing with a startup error and retained selection", () => {
    const s = fresh();
    selectTheme(s, "arctic"); // selection allowed? booting ignores — check below
    bootFailed(s, "preview decode failed");
    expect(s.phase).toBe("choosing");
    expect(s.error?.kind).toBe("startup");
    expect(s.selection).toBe("nature"); // booting ignores selection events
    expect(pressFly(s)).not.toBeNull(); // Fly still works to retry launch
  });
});

describe("selection events", () => {
  it("selectTheme only applies in choosing", () => {
    const s = readyChooser(fresh());
    expect(selectTheme(s, "arctic")).toBe(true);
    expect(s.selection).toBe("arctic");
    const req = pressFly(s)!;
    expect(selectTheme(s, "alien")).toBe(false); // preparing locks selection
    expect(s.selection).toBe("arctic");
    preparationReady(s, req.generation);
    openChooser(s); // flying -> choosing
    expect(selectTheme(s, "alien")).toBe(true);
  });

  it("selecting the already-selected theme is accepted but changes nothing", () => {
    const s = readyChooser(fresh());
    selectTheme(s, "alien");
    expect(selectTheme(s, "alien")).toBe(true);
    expect(s.selection).toBe("alien");
  });
});

describe("pressFly and generations", () => {
  it("each Fly (even the same theme) bumps the monotonic generation", () => {
    const s = flying(fresh(), "nature");
    openChooser(s);
    const r1 = pressFly(s)!;
    preparationReady(s, r1.generation);
    openChooser(s);
    const r2 = pressFly(s)!;
    expect(r2.generation).toBeGreaterThan(r1.generation);
    expect(r2.themeId).toBe("nature");
    expect(r2.seed).toBe(42);
    expect(r2.kind).toBe("launch");
  });

  it("only the current generation may commit", () => {
    const s = readyChooser(fresh());
    selectTheme(s, "arctic");
    const r1 = pressFly(s)!;
    // abandon r1 via a launch failure, then a second Fly sequence takes over
    preparationFailed(s, r1.generation, "boom");
    const r2 = pressFly(s)!;
    // stale commit rejected
    expect(preparationReady(s, r1.generation)).toBe(false);
    expect(preparationReady(s, r2.generation)).toBe(true);
    expect(s.phase).toBe("flying");
    expect(s.active).toBe("arctic");
  });

  it("duplicate Fly while preparing is ignored", () => {
    const s = readyChooser(fresh());
    const r1 = pressFly(s)!;
    expect(pressFly(s)).toBeNull();
    expect(s.generation).toBe(r1.generation);
  });

  it("startup failure retries unfinished startup work on next Fly", () => {
    const s = fresh();
    bootFailed(s, "previews failed");
    const req = pressFly(s)!;
    expect(req.kind).toBe("startup"); // Fly re-enters startup preparation
  });
});

describe("cancel and snapshot", () => {
  it("Change theme snapshots flight and reopens the chooser with active selected", () => {
    const s = flying(fresh(), "alien");
    expect(openChooser(s)).toBe(true);
    expect(s.phase).toBe("choosing");
    expect(s.hasPriorFlight).toBe(true);
    expect(s.selection).toBe("alien");
    expect(canCancel(s)).toBe(true);
  });

  it("Cancel with resident prior terrain resumes directly", () => {
    const s = flying(fresh(), "nature");
    openChooser(s);
    expect(pressCancel(s)).toBe("resume");
    // caller then performs the restore transition
    expect(restoreReady(s, s.generation)).toBe(true);
    expect(s.phase).toBe("flying");
    expect(s.active).toBe("nature");
  });

  it("Cancel during preparing enters restoring under a new generation", () => {
    const s = flying(fresh(), "nature");
    openChooser(s);
    selectTheme(s, "arctic");
    const req = pressFly(s)!;
    expect(pressCancel(s)).toBe("restoring");
    expect(s.phase).toBe("restoring");
    expect(s.generation).toBeGreaterThan(req.generation);
    // the abandoned generation can no longer commit
    expect(preparationReady(s, req.generation)).toBe(false);
    // and a stale generation cannot complete the restore either
    expect(restoreReady(s, req.generation)).toBe(false);
    expect(restoreReady(s, s.generation)).toBe(true);
    expect(s.phase).toBe("flying");
    expect(s.active).toBe("nature"); // snapshot's theme, not the pending arctic
  });

  it("repeated Cancel/Retry during restoration are ignored", () => {
    const s = flying(fresh(), "nature");
    openChooser(s);
    selectTheme(s, "arctic");
    pressFly(s);
    pressCancel(s);
    const gen = s.generation;
    expect(pressCancel(s)).toBeNull();
    expect(pressFly(s)).toBeNull();
    expect(selectTheme(s, "alien")).toBe(false);
    expect(s.generation).toBe(gen);
  });
});

describe("failure paths", () => {
  it("launch failure returns to choosing with selection and snapshot retained", () => {
    const s = flying(fresh(), "nature");
    openChooser(s);
    selectTheme(s, "arctic");
    const req = pressFly(s)!;
    expect(preparationFailed(s, req.generation, "surface pool exhausted")).toBe(true);
    expect(s.phase).toBe("choosing");
    expect(s.error?.kind).toBe("launch");
    expect(s.error?.themeId).toBe("arctic");
    expect(s.selection).toBe("arctic"); // retained for retry
    expect(s.hasPriorFlight).toBe(true); // prior flight still recoverable
  });

  it("restore failure stays choosing with a restore error and the snapshot kept", () => {
    const s = flying(fresh(), "nature");
    openChooser(s);
    selectTheme(s, "arctic");
    const req = pressFly(s)!;
    pressCancel(s); // -> restoring
    expect(restoreFailed(s, s.generation, "rebuild blew up")).toBe(true);
    expect(s.phase).toBe("choosing");
    expect(s.error?.kind).toBe("restore");
    expect(s.hasPriorFlight).toBe(true);
    // retry restoration
    expect(pressCancel(s)).toBe("restoring");
    expect(restoreReady(s, s.generation)).toBe(true);
    expect(s.phase).toBe("flying");
  });

  it("a stale generation cannot fail or complete anything", () => {
    const s = readyChooser(fresh());
    const r1 = pressFly(s)!;
    preparationFailed(s, r1.generation, "x");
    const r2 = pressFly(s)!;
    expect(preparationFailed(s, r1.generation, "late")).toBe(false);
    expect(isBusy(s)).toBe(true);
    preparationReady(s, r2.generation);
  });

  it("fresh launch resets flight state marker (caller rebuilds PlaneState)", () => {
    // the session itself only proves Fly always goes through a launch preparation
    const s = readyChooser(fresh());
    const req = pressFly(s)!;
    expect(req.kind).toBe("launch");
    expect(req.themeId).toBe("nature");
  });
});

describe("transition table (T041)", () => {
  // every illegal mutation is rejected from every phase — the table below walks each
  // phase and pokes the full verb set at it
  function inPhase(p: ChooserState["phase"]): ChooserState {
    const s = fresh(42);
    if (p === "booting") return s;
    bootReady(s);
    if (p === "choosing") return s;
    if (p === "preparing") {
      pressFly(s);
      return s;
    }
    if (p === "flying") return flying(s);
    // restoring: fly, open chooser, launch a different theme, cancel mid-prep
    flying(s);
    openChooser(s);
    selectTheme(s, "arctic");
    pressFly(s);
    expect(pressCancel(s)).toBe("restoring");
    return s;
  }

  it("booting: only boot transitions succeed", () => {
    const s = inPhase("booting");
    expect(selectTheme(s, "alien")).toBe(false);
    expect(pressFly(s)).toBeNull();
    expect(pressCancel(s)).toBeNull();
    expect(openChooser(s)).toBe(false);
    expect(preparationReady(s, 0)).toBe(false);
    expect(restoreReady(s, 0)).toBe(false);
    expect(s.phase).toBe("booting");
  });

  it("choosing: select and Fly succeed; Cancel depends on a prior flight", () => {
    const s = inPhase("choosing");
    expect(openChooser(s)).toBe(false);
    expect(preparationReady(s, 1)).toBe(false);
    expect(pressCancel(s)).toBeNull(); // no snapshot yet
    expect(selectTheme(s, "arctic")).toBe(true);
    expect(s.selection).toBe("arctic");
  });

  it("preparing: selection locks; stale commits and Fly are rejected", () => {
    const s = inPhase("preparing");
    expect(selectTheme(s, "alien")).toBe(false);
    expect(pressFly(s)).toBeNull(); // busy actions can't queue a second launch
    expect(openChooser(s)).toBe(false);
    expect(preparationReady(s, s.generation + 1)).toBe(false); // stale token
    expect(restoreReady(s, s.generation)).toBe(false); // wrong transition
    expect(s.phase).toBe("preparing");
  });

  it("flying: every menu verb is rejected until Change theme opens", () => {
    const s = inPhase("flying");
    expect(selectTheme(s, "alien")).toBe(false);
    expect(pressFly(s)).toBeNull();
    expect(pressCancel(s)).toBeNull();
    expect(preparationReady(s, s.generation)).toBe(false);
    expect(s.phase).toBe("flying");
  });

  it("restoring: a second Cancel, Fly, or select is rejected", () => {
    const s = inPhase("restoring");
    expect(pressCancel(s)).toBeNull();
    expect(pressFly(s)).toBeNull();
    expect(selectTheme(s, "alien")).toBe(false);
    expect(preparationReady(s, s.generation)).toBe(false);
    expect(s.phase).toBe("restoring");
  });

  it("every launch bumps the generation; stale tokens never commit", () => {
    const s = readyChooser(fresh(42));
    const g0 = s.generation;
    const r1 = pressFly(s)!;
    expect(r1.generation).toBe(g0 + 1);
    preparationFailed(s, r1.generation, "boom");
    const r2 = pressFly(s)!;
    expect(r2.generation).toBe(g0 + 2);
    expect(preparationReady(s, g0 + 1)).toBe(false); // dead generation
    expect(preparationReady(s, g0 + 2)).toBe(true);
  });

  it("same-theme restart still bumps the generation and flies fresh", () => {
    const s = flying(fresh(42), "nature");
    openChooser(s);
    const req = pressFly(s)!; // selection was re-selected to active
    expect(req.themeId).toBe("nature");
    expect(preparationReady(s, req.generation)).toBe(true);
    expect(s.phase).toBe("flying");
  });

  it("errors preserve the selection and snapshot for retry", () => {
    const s = flying(fresh(42), "nature");
    openChooser(s);
    selectTheme(s, "alien");
    const req = pressFly(s)!;
    expect(preparationFailed(s, req.generation, "boom")).toBe(true);
    expect(s.error?.kind).toBe("launch");
    expect(s.error?.themeId).toBe("alien");
    expect(s.selection).toBe("alien"); // retained for Fly-again retry
    expect(s.hasPriorFlight).toBe(true); // snapshot (caller-owned) still exists
    expect(pressCancel(s)).toBe("restoring"); // prior residency was released at Fly
  });
});

describe("FlightSnapshot helpers (T041/T045)", () => {
  const w: WorldContext = { theme: themeById("nature"), seed: 42 };

  function makeSnapshot(): FlightSnapshot {
    return {
      themeId: "nature",
      seed: 42,
      plane: createPlaneState(w),
      prev: createPlaneState(w),
      pose: { position: new Vector3(), target: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0) },
      posePrev: { position: new Vector3(), target: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0) },
      simTime: 0,
      accumulator: 0,
      throttle: 0.5,
      lastInputTime: 0,
      inputActive: false,
      autopilot: { engaged: false, engagedAt: 0, lastSeenInputTime: -Infinity },
      inputSeen: false,
      hintHidden: false,
      hintOpacity: 1,
      chunkManifest: [],
      aircraftType: "light",
      spinPhase: 0,
    };
  }

  it("snapshot writes are value copies: the live objects can be rewired without aliasing", () => {
    const snap = makeSnapshot();
    const live = createPlaneState(w);
    live.position.set(1, 2, 3);
    live.speed = 90;
    copyPlaneState(snap.plane, live);
    live.position.set(-9, -9, -9);
    live.speed = 10;
    expect(snap.plane.position.x).toBe(1);
    expect(snap.plane.speed).toBe(90);
    expect(snap.plane.position).not.toBe(live.position);
  });

  it("restoring writes back into live objects in place (allocated once)", () => {
    const snap = makeSnapshot();
    snap.plane.position.set(4, 5, 6);
    snap.pose.position.set(7, 8, 9);
    snap.autopilot.engaged = true;
    snap.autopilot.engagedAt = 12;
    const live = createPlaneState(w);
    const livePose = { position: new Vector3(), target: new Vector3(), up: new Vector3() };
    const liveAp = { engaged: false, engagedAt: 0, lastSeenInputTime: -Infinity };
    copyPlaneState(live, snap.plane);
    copyCameraPose(livePose, snap.pose);
    copyAutopilot(liveAp, snap.autopilot);
    expect(live.position.x).toBe(4);
    expect(livePose.position.z).toBe(9);
    expect(liveAp.engaged).toBe(true);
    expect(liveAp.engagedAt).toBe(12);
    // no aliasing the other direction either
    snap.plane.position.x = -100;
    expect(live.position.x).toBe(4);
  });

  it("accepts aircraftType and spinPhase (003 T004)", () => {
    const snap: FlightSnapshot = {
      ...makeSnapshot(),
      aircraftType: "biplane",
      spinPhase: 2.5,
    };
    expect(snap.aircraftType).toBe("biplane");
    expect(snap.spinPhase).toBe(2.5);
  });
});

describe("isBusy", () => {
  it("is busy during preparing and restoring only", () => {
    const s = fresh();
    expect(isBusy(s)).toBe(false); // booting: previews don't count as busy for Fly guard? booting rejects Fly
    expect(pressFly(s)).toBeNull(); // no Fly while booting
    bootReady(s);
    expect(isBusy(s)).toBe(false);
    pressFly(s);
    expect(isBusy(s)).toBe(true);
  });
});

describe("aircraft selection (003 T004)", () => {
  function flyingAircraft(
    s: ChooserState,
    theme: "nature" | "alien" | "arctic",
    aircraft: AircraftTypeId,
  ): ChooserState {
    readyChooser(s);
    selectTheme(s, theme);
    selectAircraft(s, aircraft);
    const req = pressFly(s);
    expect(req).not.toBeNull();
    preparationReady(s, req!.generation);
    return s;
  }

  it("createSession defaults to a pending light aircraft with none committed", () => {
    const s = fresh();
    expect(s.aircraftSelection).toBe("light");
    expect(s.activeAircraft).toBeNull();
  });

  it("selectAircraft only applies in choosing and never touches the theme selection", () => {
    const s = fresh();
    expect(selectAircraft(s, "fighter")).toBe(false); // booting
    bootReady(s);
    expect(selectAircraft(s, "fighter")).toBe(true);
    expect(s.aircraftSelection).toBe("fighter");
    expect(s.selection).toBe("nature");
    const req = pressFly(s)!;
    expect(selectAircraft(s, "glider")).toBe(false); // preparing locks
    preparationReady(s, req.generation);
    expect(selectAircraft(s, "glider")).toBe(false); // flying
    openChooser(s);
    selectAircraft(s, "glider");
    pressFly(s);
    expect(pressCancel(s)).toBe("restoring");
    expect(selectAircraft(s, "biplane")).toBe(false); // restoring locks
    expect(s.aircraftSelection).toBe("fighter"); // Cancel reset it to active
  });

  it("selectTheme never changes the aircraft selection", () => {
    const s = readyChooser(fresh());
    selectAircraft(s, "airliner");
    expect(selectTheme(s, "arctic")).toBe(true);
    expect(s.aircraftSelection).toBe("airliner");
  });

  it("pressFly carries aircraftType and bumps generation even when both selections equal the active pair", () => {
    const s = flyingAircraft(fresh(), "nature", "light");
    openChooser(s); // pending pair now equals the active pair
    const gen = s.generation;
    const req = pressFly(s)!;
    expect(req.themeId).toBe("nature");
    expect(req.aircraftType).toBe("light");
    expect(req.generation).toBe(gen + 1); // FR-014: every Fly is a fresh Flight
    expect(s.phase).toBe("preparing");
  });

  it("pressFly reads the pending aircraftSelection into the request", () => {
    const s = readyChooser(fresh());
    selectAircraft(s, "helicopter");
    const req = pressFly(s)!;
    expect(req.aircraftType).toBe("helicopter");
  });

  it("preparationReady commits the pending selection as the active aircraft", () => {
    const s = readyChooser(fresh());
    selectAircraft(s, "airliner");
    const req = pressFly(s)!;
    expect(preparationReady(s, req.generation)).toBe(true);
    expect(s.activeAircraft).toBe("airliner");
    expect(s.aircraftSelection).toBe("airliner");
  });

  it("preparationFailed keeps the pending aircraftSelection for retry", () => {
    const s = readyChooser(fresh());
    selectAircraft(s, "glider");
    const req = pressFly(s)!;
    expect(preparationFailed(s, req.generation, "boom")).toBe(true);
    expect(s.aircraftSelection).toBe("glider");
    expect(s.activeAircraft).toBeNull();
  });

  it("openChooser resets the pending aircraft selection to the active aircraft", () => {
    const s = flyingAircraft(fresh(), "alien", "biplane");
    expect(openChooser(s)).toBe(true);
    expect(s.aircraftSelection).toBe("biplane");
    expect(s.activeAircraft).toBe("biplane");
  });

  it("pressCancel to resume resets aircraftSelection to the active aircraft", () => {
    const s = flyingAircraft(fresh(), "nature", "airliner");
    openChooser(s);
    selectAircraft(s, "glider");
    expect(pressCancel(s)).toBe("resume");
    expect(s.aircraftSelection).toBe("airliner");
    expect(restoreReady(s, s.generation)).toBe(true);
    expect(s.phase).toBe("flying");
  });

  it("pressCancel to restoring resets aircraftSelection to the active aircraft", () => {
    const s = flyingAircraft(fresh(), "nature", "light");
    openChooser(s);
    selectAircraft(s, "helicopter");
    pressFly(s); // Fly releases the paused residency
    expect(pressCancel(s)).toBe("restoring");
    expect(s.aircraftSelection).toBe("light");
    expect(restoreReady(s, s.generation)).toBe(true);
    expect(s.aircraftSelection).toBe("light");
    expect(s.phase).toBe("flying");
  });

  it("restoreFailed leaves the chooser showing the active aircraft", () => {
    const s = flyingAircraft(fresh(), "arctic", "biplane");
    openChooser(s);
    selectAircraft(s, "fighter");
    pressFly(s);
    pressCancel(s); // -> restoring
    expect(restoreFailed(s, s.generation, "rebuild blew up")).toBe(true);
    expect(s.phase).toBe("choosing");
    expect(s.aircraftSelection).toBe("biplane");
    expect(s.activeAircraft).toBe("biplane");
  });
});
