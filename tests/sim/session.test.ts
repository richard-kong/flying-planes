// T019 [US1]: startup/session lifecycle state machine. Pure transitions only — no DOM,
// renderer or preparation internals (those live in ui/chooser.ts and render/world.ts).
import { describe, expect, it } from "vitest";
import {
  bootFailed,
  bootReady,
  canCancel,
  createSession,
  isBusy,
  openChooser,
  preparationFailed,
  preparationReady,
  pressCancel,
  pressFly,
  restoreFailed,
  restoreReady,
  selectTheme,
  type ChooserState,
} from "../../src/sim/session";

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
