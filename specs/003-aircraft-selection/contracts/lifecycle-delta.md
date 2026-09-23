# Lifecycle Contract Delta: Aircraft Selection

Extends [002 lifecycle contract](../../002-landscape-themes/contracts/lifecycle.md). Phases,
generation tokens, cancellation and error rules are unchanged; this file lists only what the
aircraft axis adds. `Θ` = Theme selection, `Α` = aircraft selection, `S` = FlightSnapshot.

| Event | Guard | Effect (delta only) |
|---|---|---|
| `createSession` | — | `aircraftSelection = "light"`, `activeAircraft = null` |
| `bootReady` | all **nine** preview cards ready or failed | unchanged |
| `selectTheme(id)` | `choosing` | unchanged; never touches `Α` |
| `selectAircraft(id)` | `choosing` | `aircraftSelection = id`; no preview, background, or lights change |
| `pressFly` | `choosing` | request gains `aircraftType = Α`; generation bumps even when `Θ = active` and `Α = activeAircraft` (FR-014 fresh Flight) |
| `preparationReady(g)` | live generation | `activeAircraft = Α`; `main.ts` shows `aircraft[Α].group`, hides others, resets `spinPhase = 0`, applies Theme lights |
| `preparationFailed(g)` | live generation | unchanged; `Α` stays as chosen for retry |
| `openChooser` | `flying` | caller freezes `spinPhase` into `S.spinPhase` and copies `S.aircraftType = activeAircraft`; `Α = activeAircraft` |
| `pressCancel` → `resume` | prior terrain resident | `Α = activeAircraft`; `spinPhase = S.spinPhase`; no visible aircraft change |
| `pressCancel` → `restoring` | prior released | as above once `restoreReady`; the visible aircraft is `S.aircraftType` during the overlay |
| `restoreReady(g)` | live generation | `Α = activeAircraft` (= `S.aircraftType`); `spinPhase = S.spinPhase` |
| `restoreFailed(g)` | live generation | unchanged; chooser shows `Α = activeAircraft` |

Rules:

1. Spinners advance only inside the fixed-step update while `phase === "flying"`;
   `spinPhase += dt` per step (rates applied at render). Paused time is never replayed.
2. Aircraft visibility changes happen only at `preparationReady`/`restoreReady`, under the opaque
   overlay, so no frame shows a mixed Theme/aircraft state (FR-016/017).
3. Chooser radios for aircraft follow the same busy/disable behaviour as Theme radios; Escape,
   Fly, Cancel and retry semantics are shared.
4. Pointer/wheel/touch inside either radiogroup never reach the flight mappers; the fresh-input
   gate after Fly/Cancel is unchanged (FR-018).
