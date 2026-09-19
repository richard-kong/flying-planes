# Flying Planes Constitution

Flying Planes is a browser web app: a single plane, flown by pointer and touch gestures, over
procedurally generated, visually stunning landscapes. This constitution governs every spec, plan,
task, and PR in the repository.

## Core Principles

### I. Minimum Code (YAGNI)

- The codebase MUST contain only code that serves a shipped, user-visible behaviour.
- A new module, abstraction, or configuration option MUST NOT be introduced until there is a
  concrete second use for it in the same PR or an already merged one.
- Three.js is the ONLY permitted runtime dependency. Adding any other runtime dependency
  REQUIRES an ADR in `docs/adr/` and an amendment to this constitution.
- Dev dependencies are limited to the toolchain named in Technology Constraints; additions
  MUST be justified in the PR description.
- Prefer deleting code to adding it. Every PR MUST state what it removed, or "nothing removed".

Rationale: less code is less to download, parse, test, and break. The app is small on purpose.

### II. Browser Performance is a Feature (NON-NEGOTIABLE)

Measurable budgets, checked on every PR that touches rendering, terrain, or the frame loop:

- Frame rate: MUST sustain 60 fps on a mid-range laptop integrated GPU and 30 fps on a
  mid-range phone at the default quality setting.
- Payload: total JavaScript shipped to the browser MUST be <= 600 KB gzipped, including Three.js.
- Startup: first rendered frame MUST appear <= 2 s on a simulated 4G connection.
- Hot loop: the per-frame update and render path MUST perform zero heap allocations in steady
  state (no `new`, array/object literals, closures, or string building inside the frame loop).
  Reuse preallocated vectors, matrices, and buffers.
- Terrain MUST be streamed in chunks around the plane and culled; the whole world is never
  resident.
- A PR that regresses any budget MUST NOT merge unless it amends the budget here with rationale.

Rationale: "stunning" is meaningless at 20 fps; smoothness is the visual quality.

### III. Test-First for Core Mechanics (NON-NEGOTIABLE)

Strict TDD applies to all core mechanics: tests are written first, are seen to fail, then the
implementation is written to make them pass, then refactored (red-green-refactor).

Core mechanics, each of which MUST have tests:

- Flight Model: Steer Vector + Throttle + elapsed time -> plane state (position, orientation,
  speed). Includes idle detection, level-out, and Autopilot banking.
- Input mapping: pointer offset, touch drag, pinch, and wheel -> Steer Vector and Throttle.
- Chase Camera: plane state -> camera pose.
- Terrain generation: deterministic given a Seed; same Seed and coordinates MUST always yield
  identical heights.
- Terrain Chunk streaming and culling around the plane.
- Biome selection and Biome transitions.

Rules:

- Core-mechanic logic MUST be pure and headless: no DOM, WebGL, or Three.js scene objects in
  its inputs or outputs, so it runs under Vitest in Node without a browser.
- Rendering (shaders, materials, draw calls) is NOT unit-tested; it is covered by a single
  smoke test asserting the scene mounts and renders one frame without throwing.
- A PR adding or changing a core mechanic without corresponding tests MUST NOT merge.

Rationale: the visuals will be judged by eye; the mechanics cannot be, so they are judged by
tests.

### IV. Procedural Everything

- Landscapes MUST be generated procedurally from a Seed and a Biome parameter set (terrain
  noise parameters, palette, sky, fog, lighting).
- The repository MUST NOT contain binary assets (heightmaps, textures, models, audio). Visual
  variety comes from parameters, not files.
- Generation MUST be deterministic and side-effect free so it is testable and reproducible.

Rationale: keeps the payload within budget, the repo diff-reviewable, and the world infinite.

### V. One Input Abstraction

- All steering input (mouse hover offset from screen centre, single-finger touch drag) MUST be
  normalised into a single Steer Vector before it reaches the Flight Model.
- Throttle input (wheel on desktop, pinch on touch) MUST be normalised into a single Throttle
  value.
- The Flight Model MUST NOT know which device produced its input.
- No keyboard controls in v1. Adding an input device means adding a mapper to Steer Vector /
  Throttle, never a new path into the Flight Model.

Rationale: the Flight Model is tested against one input type; devices are thin adapters.

## Technology Constraints

- Language: TypeScript with `strict: true`. No `any`, no non-null assertions in core mechanics.
- Build: Vite, producing a single static bundle deployable to any static host.
- Tests: Vitest. Core-mechanic tests run in Node; the render smoke test may use a browser
  environment.
- Runtime dependency: `three` only (Principle I).
- Target: evergreen browsers with WebGL2; no polyfills for legacy browsers.
- Interaction model (v1): hover-to-steer mouse (pointer position relative to centre = pitch/roll
  target, no clicks), single-finger drag to steer and pinch for throttle on touch, wheel for
  throttle on desktop. After ~5 s without input the plane levels out and Autopilot applies gentle
  banking.

## Development Workflow

- Every feature follows the Spec Kit flow: `/speckit-specify` -> `/speckit-plan` ->
  `/speckit-tasks` -> `/speckit-implement`, with tasks ordered tests-before-implementation.
- Every PR MUST include a Constitution Check in its description covering: performance budgets
  (Principle II) with measured numbers where the frame loop, terrain, or bundle changed; tests
  present and written first for any core mechanic touched (Principle III); dependencies added
  (Principle I); what was removed.
- CI MUST run typecheck, Vitest, and a bundle-size check against the 600 KB gzipped budget;
  a red check blocks merge.
- Domain vocabulary lives in `CONTEXT.md`; a PR that introduces a new domain term MUST add it
  there. Decisions that are hard to reverse and surprising without context get an ADR in
  `docs/adr/`.

## Governance

- This constitution supersedes all other practices, templates, and conventions in the repo.
- Amendments are made by PR to `.specify/memory/constitution.md`, approved by the repository
  owner, and MUST update the version and Last Amended date below.
- Versioning: MAJOR for removing or redefining a principle; MINOR for adding a principle or
  section or materially expanding guidance; PATCH for clarifications and wording.
- Every PR review MUST verify compliance with the Core Principles; any deviation MUST be
  justified in the PR description or the PR MUST NOT merge.
- Complexity MUST be justified: the reviewer may request removal of any code, abstraction, or
  dependency that lacks a concrete current use.

**Version**: 1.0.0 | **Ratified**: 2026-09-19 | **Last Amended**: 2026-09-19
