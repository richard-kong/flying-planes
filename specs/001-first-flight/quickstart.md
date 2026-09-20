# Quickstart: First Flight

## Prerequisites

Node 20+, npm, a WebGL2 browser (Chrome for the perf checks).

## Run

```bash
npm ci
npm run dev            # Vite dev server, open the printed URL
npm run dev -- --host  # to open on a phone on the same network
```

Open `http://localhost:5173/?seed=42` for a fixed world.

## Test

```bash
npm run typecheck      # tsc --noEmit
npm test               # vitest run (tests/sim/** in Node + tests/render/smoke.test.ts)
npm run build          # vite build -> dist/
npm run size           # gzips dist/assets/*.js, fails above 600 KB (same step as CI)
```

CI (`.github/workflows/ci.yml`) runs the four commands above on every PR.

## Validation scenarios (map to spec acceptance scenarios)

| # | Scenario | How to check | Expected |
|---|----------|--------------|----------|
| 1 | Airborne on load (US1-1, FR-001) | Load page, touch nothing | Plane moving over terrain within 2 s; hint line visible then fades on first pointer move |
| 2 | Hover to steer (US1-2..4) | Move pointer to right edge, then centre, then top | Banks right and turns; levels within 2 s of centring; screen-top means nose down |
| 3 | Soft floor (US1-5, SC-007) | Hold pointer at top edge (nose down) 30 s | Plane eases up, never intersects terrain or lakes |
| 4 | Throttle (FR-011) | Wheel up/down; pinch on phone | Speed changes within min/max, never stops |
| 5 | Endless bands (US2-2) | Fly perpendicular to the bands for 3 min | Alpine → Foothills → Alpine, ~60 s each, ~10 s gradual blend |
| 6 | Look (US2-4, US2-5) | Fly in each Biome, turn toward and away from the sun | Pastel sky, lavender fog, pink snow / violet rock / blue-green forest, gold lakes with highlight facing the sun; no cast shadows |
| 7 | Determinism (US2-6, SC-006) | Load `?seed=42` twice | Identical start view; no `?seed=` twice → different worlds |
| 8 | Autopilot (US3, SC-008) | Leave untouched 10 s, then move pointer | Level, gentle banking; first movement changes attitude next frame |
| 9 | Resize (FR-029) | Resize window / rotate phone | Canvas refits, no stretch |

## Manual performance check (constitution II, recorded in the implementing PR)

1. `npm run build && npm run preview`, open in Chrome.
2. **fps**: DevTools → Performance → record 30 s of flight across a Biome Transition. Expect
   >= 60 fps on the laptop iGPU reference; repeat on the phone reference via remote debugging,
   expect >= 30 fps.
3. **Zero allocations**: DevTools → Memory → "Allocation sampling", record 30 s of steady flight
   with no chunk loads (fly parallel to a band after the ring has filled). Expect no allocations
   attributed to `src/sim/**`, `render/terrainMesh.ts` fill path, or the frame callback in
   `main.ts`. Chunk pool warm-up allocations at startup are allowed.
4. **Startup**: DevTools → Network → throttle "Fast 4G", hard reload. Expect first frame <= 2 s.
5. **Bundle**: `npm run size` output <= 600 KB.

## Artifacts

- Data model: [data-model.md](./data-model.md)
- Contracts: [contracts/sim.ts](./contracts/sim.ts)
- Decisions: [research.md](./research.md)
- Reviewed look: [mockups/scenery-moods.html](./mockups/scenery-moods.html)
