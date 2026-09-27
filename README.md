# Flying Planes

A browser app where you fly a single plane over endless, procedurally generated landscapes
using pointer and touch gestures. Play it at https://richard-kong.github.io/flying-planes/.

- **Themes:** Nature, Alien Planet and Arctic, each with its own terrain, palette, sky, fog and lighting.
- **Aircraft:** light plane, biplane, glider, fighter jet, passenger jet and helicopter. They look different but all fly the same way.
- **Procedural everything:** terrain streams in chunks around the plane from a seed. There are no binary assets, and Three.js is the only runtime dependency.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Steer | Move the pointer away from screen centre (hover, no clicks) | Drag with one finger |
| Throttle | Mouse wheel | Pinch |

After about 5 s without input the plane levels out and Autopilot banks gently.

Add `?seed=<n>` to the URL (a whole number from 0 to 4294967295) to get the same landscape
every time. Any other value falls back to a random seed.

## Requirements

- Node.js 24 (the version CI uses) and npm
- A browser with WebGL2
- Playwright Chromium for the browser test suite: `npx playwright install --with-deps chromium`

## Build and run

```sh
npm ci            # install dependencies
npm run dev       # Vite dev server with hot reload (http://localhost:5173)
npm run build     # production bundle in dist/
npm run preview   # serve dist/ locally
```

Every push to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Development

| Command | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` (strict TypeScript) |
| `npm test` | Vitest unit tests in Node (`tests/sim`, headless `tests/render`) |
| `npm run test:browser` | Builds an isolated verification bundle and runs the PR-gate `*.browser.test.ts` suites in Playwright Chromium. Pass filename filters, e.g. `npm run test:browser -- chooser switching-theme`. `--soak` runs only the minutes-long `*.soak.browser.test.ts` soaks, `--all` runs both |
| `npm run size` | Checks the gzipped JS in `dist/` against the 600 KB budget (run `npm run build` first) |
| `npm run soak:rendered -- --minutes 60 --seed 42 --theme alien --aircraft fighter --headed` | Long rendered soak run that checks for errors, leaks and pool growth |
| `npm run prototype` | Dev server on `0.0.0.0:5173`, including the landscape studies page at `/landscape-prototype.html` |

CI (`.github/workflows/ci.yml`) runs typecheck, `npm test`, `npm run build` and `npm run size` on
every PR, plus one runner per gate browser suite so the browser step is bounded by the slowest
file. The soak suites (`*.soak.browser.test.ts`) run on pushes to `main` and nightly. Any red
check blocks merge.

### Project layout

```
src/
  sim/      pure, headless core mechanics: flight model, input mapping, chase camera,
            terrain, chunks, biomes, themes, aircraft (unit-tested in Node)
  render/   Three.js scene: terrain meshes and materials, sky, aircraft meshes, previews
  ui/       theme and aircraft chooser
  main.ts   app entry and frame loop
tests/      Vitest suites (sim/, render/; *.browser.test.ts run in Chromium)
scripts/    browser test harness, bundle-size check, soak and capture tools
specs/      Spec Kit feature specs, plans and tasks (001 to 003)
docs/adr/   architecture decision records
```

### Workflow and rules

- The rules for every spec, plan, task and PR are in the constitution at
  `.specify/memory/constitution.md`. In short: minimal code, performance budgets (60 fps on a
  laptop, 30 fps on a phone, 600 KB gzipped, first frame in 2 s or less, no per-frame
  allocations), test-first for core mechanics, procedural assets only, and one input abstraction.
- New features follow the Spec Kit flow: `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`,
  `/speckit-implement` (skills live in `.devin/skills/`).
- Every PR description includes a Constitution Check (budgets, tests, dependencies added, what
  was removed).
- Domain vocabulary is in `CONTEXT.md`. Add new terms there.
