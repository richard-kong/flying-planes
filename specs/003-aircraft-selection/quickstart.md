# Quickstart and Acceptance Guide: Aircraft Selection

**Status**: Design complete; runtime implementation pending. The prototype commands below exist
today; the production commands are added by the implementation tasks.

## Design review record (already done)

Thirty procedural candidates (five per type) were rendered by the app's Three.js pipeline and
reviewed in a Lavish comparison page. Owner picks: **H3 Executive, L1 Classic trainer,
F5 Interceptor, P1 Narrow-body, B4 Sport, G2 Vintage**; keep current in-flight size; Phong shading.

To regenerate the study locally (temporary files, removed by the implementation PR):

```sh
npm ci
npm run dev                                   # then open /aircraft-prototype.html?variant=H3&view=card
npx vite-node scripts/capture-aircraft-prototypes.ts   # writes .lavish/aircraft-prototypes/{img,designs.json}
npx vite-node scripts/build-aircraft-review.ts         # writes .lavish/aircraft-prototypes/index.html
```

`?view=` accepts `card`, `level`, `bank`, `detail`; `?variant=` accepts `H1..H5, L1..L5, F1..F5,
P1..P5, B1..B5, G1..G5`. `.lavish/` is git-ignored; the reference captures of the six picks are
attached to the planning PR.

## Existing checks (must stay green)

```sh
npm run typecheck
npm test                 # headless Vitest
npm run test:browser     # Playwright-driven Vitest (Chromium, SwiftShader)
npm run build && npm run size   # JS <= 600 KB gzipped
```

## Acceptance walk-through (after implementation)

Open `npm run preview -- --host 0.0.0.0 --port 4173 --strictPort` and load `/?seed=42`.

1. **Defaults (US1/SC-001).** Chooser opens with World = Nature and Aircraft = Light Plane
   selected, nine cards all showing images (three worlds, six aircraft). No card is a
   placeholder once the chooser is interactive. Reload: same defaults regardless of the prior visit.
2. **Card recognisability (SC-001).** Each aircraft card shows the picked design in three-quarter
   view: helicopter (cabin, boom, two rotors, skids), light plane (high wing, prop, wheels),
   fighter (pointed nose, swept wings, fin, intakes, exhaust), passenger jet (window row, two
   nacelles, winglets), biplane (two wings, struts, open cockpit), glider (long wings, no engine).
3. **Fly with each aircraft (US2).** For every aircraft × every world (18 runs): press Fly, wait
   for the overlay to lift, and confirm the aircraft matches the card, sits fully in view during
   ordinary steering, and that the terrain, sky and flight feel are identical to the Light Plane run.
4. **Spinners (FR-006).** Light Plane and Biplane props, Helicopter main and tail rotors visibly
   rotate in flight and during Autopilot. Press Change flight: rotation stops. Cancel: rotation
   resumes from the same blade angle with no jump.
5. **Change flight → Fly (FR-014).** From a flight, open the chooser, change only the aircraft,
   press Fly: a fresh Flight starts (spawn pose, hint visible) with the new aircraft. Repeat
   changing only the world; repeat changing nothing: still a fresh Flight.
6. **Cancel (FR-015).** Open the chooser, change both world and aircraft, press Cancel: the
   original aircraft, world, pose, speed, throttle and hint state return unchanged.
7. **Error path (FR-016/017).** With `__verifyPreview` forcing an aircraft card failure (browser
   test hook), the chooser opens with the retry affordance and no partial card set; retry completes
   the set. A forced launch failure keeps the prior Flight recoverable via Cancel.
8. **Input isolation (FR-018).** Wheel over the aircraft cards and drag on them: Throttle and
   steering are unchanged after Fly/Cancel until fresh input arrives.
9. **Resize / hidden tab.** Rotate the phone with the chooser open: both sections remain
   reachable by scrolling; the Fly/Cancel bar stays visible. Background the tab mid-flight and
   return: spinners resume without catch-up.

## Budgets to record in the PR Constitution Check

- `npm run size` gzipped total before/after (expected delta < 20 KB).
- Chooser interactive time at `/?seed=42` under the browser test's simulated 4G, with nine cards.
- Frame-loop allocation check (`npm run soak:rendered`) unchanged from baseline.
- Owner device fps (laptop integrated GPU / phone) for the Passenger Jet over Nature, the
  heaviest aircraft; software-rendered VM numbers do not substitute.

## Removal statement for the implementation PR

Removed: `src/render/plane.ts`, `src/render/aircraft-prototype.ts`, `aircraft-prototype.html`,
`scripts/capture-aircraft-prototypes.ts`, `scripts/build-aircraft-review.ts`.
