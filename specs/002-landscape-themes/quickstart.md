# Quickstart and Acceptance Guide: Landscape Themes

**Status**: Planned validation for feature 002. Themes and the new browser commands are not
implemented by this documentation PR. Existing commands below check the current First Flight
baseline only. No device result is implied by this guide.

## Prerequisites and existing checks

- Node 20.19+ or 22.12+, npm, an evergreen WebGL2 browser, and the revision being evaluated.
- For release acceptance: the owner's integrated-GPU laptop and mid-tier Android phone or
  iPhone, approximately three years old as defined in the specification.
- No account, API key, backend, database, or secret is required.

From the repository root:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run size
npm run preview -- --host 0.0.0.0 --port 4173 --strictPort
```

Open the preview at `http://localhost:4173/?seed=42` from that machine, or its LAN address on the
phone. In a remote Devin session use its browser preview. A deployed GitHub Pages build uses
`https://richard-kong.github.io/flying-planes/?seed=42`; verify the deployed commit before recording
results. Record HTTPS hosting for cold-load benchmarks, rather than treating LAN speed as 4G.
Stop the preview with Ctrl+C.

Expected current checks: typecheck, tests, and build exit zero; `size` reports JS ≤600 KB gzipped.
There is no configured standalone lint command; use typecheck and `git diff --check`.

## Commands to add during implementation

The implementation adds `playwright@1.63.0` as an exact-pinned development dependency and locks
it in `package-lock.json`. Thereafter:

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:browser
npm run soak:rendered -- --minutes 60 --seed 42 --theme alien --headed
```

`test:browser` must own an isolated verification build, free preview port, serial Vitest suite,
browser, and cleanup. It must not overwrite the production `dist/`. The default `npm test`
continues to run Node mechanics without launching a browser. CI installs Chromium and runs the
browser suite after the existing checks; unavailable WebGL2 is a failed environment check, not
a skipped green smoke test.

`soak:rendered` must run a real-time rendered Flight (no accelerated simulation substitution).
Its Theme option operates the chooser, not a new public Theme URL parameter. It uses normal
steering/throttle mappers along a deterministic route, reaches maximum speed, crosses both
regional bands and at least two transitions, and records the route, seed, elapsed time, errors,
resource counts, and frame data. It exits nonzero on detected failures and tears down its processes.
The driver and verification hooks are development-only and absent from the production bundle.

## Automated acceptance matrix

Write and observe failing tests before changing core mechanics. Use the public pure interfaces in
[contracts/themes.ts](./contracts/themes.ts) and the states in
[contracts/lifecycle.md](./contracts/lifecycle.md), rather than testing private implementation details.

| Suite | Required assertions |
|---|---|
| Theme/terrain | Exactly three valid read-only presets; band endpoints/interpolation; Theme + Seed + coordinates deterministic across rebuild/reload; unchanged Alien fixtures recorded before refactoring; negative and distant coordinates. |
| Shaping | Nature has gentler measured relief at fixed fixture regions; Arctic valley transform is continuous/monotonic and creates broader floors; each Theme includes land and water/ice; no region seams. |
| Clearance/pose | Plane and camera use the selected surface maximum, including lakes/ice above terrain; fresh position/heading/attitude/default Throttle; initial previous/current camera pose valid even with first callback < `SIM_DT`. |
| Streaming/topology | Bounded residency and queues during repeated axial/diagonal/far-coordinate movement; replacement retains coverage through budget-limited frames; pool exhaustion does not allocate; morph edges meet; clipped shoreline vertices lie on the plane for every LOD. |
| Snapshot | Both plane/camera interpolation states, accumulator, clocks, Throttle, Autopilot, hint/fade, and visible LOD/morph manifest survive capture/rebuild/restore. First restored presentation precedes the next simulation step. |
| Lifecycle | Initial boot, selection-only, fresh restart, direct Cancel, rebuild Cancel, failure/retry, hidden-tab pause; one active job; duplicate Fly/Cancel ignored; delayed stale success/failure cannot commit or dispose a later generation's resources. |
| Input | Menu events leave Flight unchanged; fresh-input gate after Fly/Cancel; clamped wheel/pinch and touch activation disengage Autopilot; time-zero steering hides hint; touch/pointer cancellation, blur and two-to-one handoff clear stale input; resize remaps only active flight input. |
| WebGL smoke | One real WebGL2 smoke, parameterised over all Themes, renders plane, sky, terrain and visible water/ice to a frame. Fail on shader compile/link errors, GL/page errors or blank output; verify nonblank readback and the expected drawable scene, not shader-string length. |
| Browser flows | Mouse/touch/keyboard menu flows below; no keyboard flying; atomic switching; all three decoded actual-terrain previews, offscreen/main-view colour parity, cached reuse, renderer-state restoration, and resource disposal. |

Inject preparation/readback/Blob/decode failures and delayed completions through the verification
build's controlled adapter, not production debug controls. Cover launch failure before and after
old residency release, Cancel racing completion, restoration failure followed by retry, and a
fresh Flight after failed restoration. Retain the prior snapshot until success and revoke stale
image URLs. A text-only preview fallback is an error state, not SC-001/FR-003 acceptance.

## Browser scenarios after implementation

### Startup and selection

1. Load `?seed=42`: stationary Nature behind the chooser; Nature selected; three named cards with
   descriptions and decoded images; Fly enabled after readiness; no Cancel without a prior Flight.
2. Select Alien Planet then Arctic. Only the checked indicator changes. The Nature background,
   Seed, and preview images remain unchanged. Move/scroll/pinch over menu controls; no flight
   state advances and default Throttle remains unchanged.
3. Fly each Theme in a fresh visit. Nature takes one activation; another Theme takes selection
   plus Fly. Record readiness at the first correctly rendered controllable frame, not button click
   or CPU completion. Reload always selects Nature, even after Arctic or Alien.
4. Try missing, malformed, and valid Seed values. Existing parsing is unchanged; the chosen Seed
   stays fixed across changes/restarts for that page visit.

### Pause, Cancel, errors, and fresh Flight

1. During manual flight with non-default Throttle and during engaged Autopilot, open Change theme.
   Record the snapshot. Select another Theme, wait 60 seconds, hide/restore the tab, then Cancel.
   No pose, speed, idle-time, hint, interpolation, or Seed change occurs while paused.
2. Repeat but press Fly, then Cancel while preparation has released the old terrain. Verify visible
   restoration feedback, saved first-frame presentation, and ≤2 s restoration on reference devices.
   Leave the pointer resting over the old Cancel position; it must not immediately bank the plane.
3. Rapidly activate Fly twice, try selection while busy, and repeat Cancel during restoration.
   Only the current operation completes; no mixed world or duplicate launch appears.
4. Force launch and restoration failures through the verification harness. Selection and snapshot
   remain recoverable, Retry targets the right operation, and fresh Flight is also available.
5. Fly with the currently active Theme selected. Position, heading, level attitude, safe height,
   speed/Throttle defaults, neutral steering, Autopilot and hint timers reset. Cancel alone resumes.

### Controls, accessibility, and layout

Use the existing flight directions: screen-top/up-drag commands nose-down; screen-bottom/down-drag
commands nose-up; left/right commands banking; wheel up increases Throttle. Keep the existing pinch
and idle Autopilot semantics. The separate First Flight T053 quaternion defect may affect apparent
nose orientation until resolved; do not invert the specified mapping to compensate.

Exercise single-finger drag, pinch, two-finger-to-one handoff, lift, touchcancel, pointercancel, blur,
and returning from the menu with a finger already touching the screen. None may leave a stale
Steer Vector or queued Throttle. Fresh input at a throttle limit must still take over from Autopilot.
Steering at simulation time zero dismisses the new hint; six active seconds is its fallback.

Operate every chooser action using Tab, Shift+Tab, radio arrow keys, Space, Enter, and conditional
Escape. Verify labels, checked state, focus restoration, error/status announcements, and
selection distinguishable without colour. Arrow keys must not steer in flight. Test narrow
portrait, landscape, resizing with menu open, rotation during restoration, text zoom, and
stationary pointer remapping while flying. All menu controls remain reachable.

### Visual comparison

Use fixed Seed 42 and matching reference viewpoints for the opening scene, mountain region,
valley, regional transition, and shore. Retain baseline captures for Alien before shader changes.

| Theme | Required visible cues |
|---|---|
| Nature | Gentler Earth-like relief, green foothills/forest bands, natural rock, white snow, blue lakes, clear daylight. |
| Alien Planet | Existing Alpine/Foothills shape, cool dusky terrain, warm gold lakes, Pastel Dawn sky, low pale-gold sun, lavender fog. No new spires/craters/objects. |
| Arctic | Broad glacial valleys, snowy ridges, blue ice and flat frozen lakes, cold daylight; no temperate forest look. |

Compare each card to its actual Theme at its fixed preview Seed/camera. Check up/down orientation,
colour response, and representation of landforms. Cross chunk/LOD/region transitions, including
high peaks; look for holes, seams, detail jumps, sloped water/ice and sun/fog drift during turns.

## Owner benchmark: laptop and phone

### Record conditions once per device

Record commit/build URL, device model/age, OS, GPU, browser/version, hardware renderer, display
refresh rate, viewport/orientation, device DPR and effective rendering DPR, quality constants,
power/battery mode, thermal state, Seed, and tool/version. Use the default DPR cap (currently 1.5).
Disable battery saver and background workloads; record any unavoidable restriction. A high-end
machine or software renderer does not substitute for the specified reference devices.

Run functional browser scenarios separately from clean frame-rate measurements so recording,
DevTools and screenshots do not distort them. Keep diagnostics and failure-injection controls
out of the production bundle; benchmark that same release build for the final result.

### A. Cold startup and preparation times

1. Set a reproducible simulated 4G profile: 4 Mbps down, 1 Mbps up, 150 ms latency, no CPU throttle.
   Use browser network shaping on the laptop and remote debugging or a shaped Wi-Fi/router path
   for the phone. Record how it was applied; do not claim unthrottled cellular/LAN results are 4G.
2. Clear cache and storage, then load the release URL. Run five cold navigations per device.
   Save the navigation trace/filmstrip and record navigation-to-first-Nature-frame separately
   from navigation-to-usable-chooser-with-three-decoded-previews. Every sample must be ≤2 s;
   time spent deciding which Theme to fly is excluded.
3. After readiness, time Fly for each Theme and same-Theme restart. Time Cancel both before
   release and after the candidate has reused the old terrain buffers. Use input activation to
   first correct, controllable frame. Record five samples for each path; each must be ≤2 s.
   Cancelling before terrain release does not test the restoration budget.
4. Keep visible progress, selection, focus, and retry controls responsive. A fast DOM overlay
   without the correct scene is not a passing rendered frame.

### B. Frame rate, allocations, and continuity

For each Theme, fly five foreground minutes at Seed 42 through both regional bands and two
transitions. Include valleys, lakes/ice, maximum-speed turns, and LOD crossings. Save route inputs
or the deterministic harness route so comparisons use the same path. The target is sustained
60 fps on laptop and 30 fps on phone.

Record total rendered frames and elapsed time, frame intervals (median, p95, p99), and one-second
frame-rate windows. Report every below-target window/stall and its cause; a passing whole-run
average must not hide sustained slow sections. Warm-up is reported separately, not used to hide
startup or launch overruns. Flag unresolved shortfalls instead of inventing a looser pass threshold.

Separately sample allocations after warming the pool and shader cache, while repeatedly crossing
chunks. Inspect application frame/streaming stacks: zero steady-state allocations, no new maps,
meshes, arrays, closures, or queue growth. A flat overall heap graph alone is not proof. Record
tool limitations; retain an unverified result where a phone browser cannot expose the evidence.

### C. Fifty changes and recovery

Run 50 completed changes on each device. Alternate a traversal of all six directed pairs
(`Nature → Alien → Arctic → Nature → Arctic → Alien → Nature`) with the three same-Theme restarts
until 50 launches are complete. Between launches add Cancel before release, Cancel during
preparation, and retry scenarios; those do not count as completed launches.

Warm all Themes first. At warm-up, every tenth change, and completion, record settled JS heap
(where available), page/process memory, renderer geometry/texture/program counts, pool occupancy,
and live preview URL count. Wait for pending jobs/GC to settle consistently; do not force GC inside
timed runs. Counts must return to their bounded warmed plateau, with one pool/renderer and three
cached cards, not grow with switch count. Resource counts supplement, not replace, memory traces.
No mixed frames, leaks, failed launches, or degraded flight frame rates are acceptable.

Hide the tab for 60 seconds while flying and while choosing/restoring, then return. A paused
Flight must remain unchanged. Active-flight recovery must not replay the full hidden interval.
Repeat resizing and phone rotation in each state; preserve selection, camera/terrain alignment,
input isolation, and access to Cancel/Retry.

### D. Outstanding rendered soak

Run one continuous 60-minute rendered Alien Planet Flight at Seed 42 and maximum speed, exercising
regional/LOD transitions and large coordinates (First Flight T061). Keep the app foreground and
record terrain continuity, errors, resource plateau and precision, then hidden-tab/resize recovery.
The five-minute Nature/Arctic runs and the switch sequence cover their added paths; extend the
soak if they reveal unresolved concerns. A fast Node simulation or VM software-renderer FPS does
not close this rendered/device obligation.

## Evidence and release decision

Attach browser report, key recordings/screenshots, numeric fixtures, traces, and device measurements
to the implementing PR. Record red/green test evidence for changed mechanics and a Constitution
Check. Leave unknown measurements explicitly unverified and retain T060/T061 until evidence exists.

Suggested results table (fill per device, not in this planning PR):

| Metric | Target | Measured result / evidence |
|---|---|---|
| Release JS gzip | ≤600 KB | Pending |
| First Nature frame / complete chooser | Both ≤2 s, cold simulated 4G | Pending |
| Fly / rebuilt Cancel | Each ≤2 s | Pending |
| Five-minute frame rate, three Themes | 60 fps laptop / 30 fps phone | Pending |
| Warm frame/streaming allocations | Zero | Pending |
| Fifty changes | Stable memory/resources; no mixed frames or failures | Pending |
| Visual and accessibility scenarios | All required cues/flows | Pending |
| 60-minute rendered soak and recovery | No terrain/precision/recovery failure | Pending |
