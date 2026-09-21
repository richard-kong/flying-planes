---
name: testing-flying-planes
description: How to run and end-to-end test the Flying Planes Three.js app locally — preview server, deterministic seeds, timing quirks under software rendering, and how to precompute terrain/lake/biome layout for navigation.
---

# Testing Flying Planes

## Run it

- Build: `npm run build`; serve: `npm run preview -- --port 4173` (from repo root). App URL: `http://localhost:4173/?seed=42`.
- `?seed=N` (non-negative integer <= 4294967295) gives a deterministic world; invalid/missing seeds are replaced in the URL bar with a random one.
- The app has no UI besides the canvas and the one-line `#hint` overlay; no keyboard controls.

## Timing on this VM (SwiftShader, ~6 fps)

- The sim is fixed-step (1/120 s) capped at 8 steps/frame, so **sim time runs ~0.4x real time** under software rendering. Multiply all spec timings by ~2.5: the 5 s autopilot delay needs ~12+ real seconds of idle, and the autopilot bank period (10 sim-s) spans ~25 real-s.
- Verify engagement by waiting generously, then screenshotting; do not expect exact real-time delays.

## No position/heading readout

Sim state is module-scoped (not reachable from the console). To verify location-dependent features, precompute the world from code instead:

```bash
cat > /tmp/probe.ts <<'EOF'
import { heightAt } from "/home/ubuntu/repos/flying-planes/src/sim/terrain";
import { bandWeight } from "/home/ubuntu/repos/flying-planes/src/sim/biome";
// heightAt(x,z,seed): terrain height (terrain only, NOT clamped to WATER_LEVEL=120)
// bandWeight(x,seed): 0=Alpine, 1=Foothills; bands run along X, spawn is (0, ~h+200, 0) heading +z
EOF
npx vite-node /tmp/probe.ts
```

- The plane spawns at (0, h(0,0)+200, 0) heading +z. Biome bands alternate along the **x axis** (~3600 m wide, ~600 m transitions) — flying straight from spawn stays in one biome; turning ~90 deg crosses bands.
- The sun sits at ~30 deg azimuth from +z, elevation ~12 deg — its glow position in frame is a rough heading reference.
- To find lakes: scan `heightAt < 120` (WATER_LEVEL in src/constants.ts). In Foothills they are frequent; a straight unsteered flight over a precomputed below-water corridor is the most reliable way to get lake screenshots.

## Useful checks

- Determinism: screenshot at spawn, reload same `?seed=`, compare — only animation drift differs (a few % pixel RMSE).
- Resize: `wmctrl -r "flying planes" -b remove,maximized_vert,maximized_horz && wmctrl -r "flying planes" -e 0,50,60,700,480` then re-add maximized flags.
- Sim-level verification (e.g. floor behavior, autopilot amplitude): drive `createPlaneState`/`stepFlight`/`stepAutopilot` from a vite-node script — same code path as the app, fully deterministic.
