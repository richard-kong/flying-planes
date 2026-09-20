# Contract: Chooser and Flight Lifecycle

User-facing and internal contracts: `src/sim/session.ts` owns pure transition and snapshot rules;
`src/ui/chooser.ts` adapts DOM events; `src/render/world.ts` owns preparation. `src/main.ts`
connects those interfaces. There is no network API or persistent Theme preference.

## States and transitions

| State/event | Result and guard |
|---|---|
| Page load | `booting`; Nature selected, one page Seed, no snapshot or Cancel. |
| Boot ready | `choosing`; Nature scene stationary, three decoded cards, Fly enabled. |
| Boot failed | `choosing(error: startup)` with retry; no partial background. Failed previews keep text accessible, but do not count as SC-001 success. |
| Choose card | In `choosing` only: change pending selection, never background or previews. |
| Fly | `preparing`, new generation, selection locked, reset candidate Flight. A startup error retries any still-required startup work before launch. |
| Prepared | If generation current and readiness met: atomically commit, discard old snapshot, `flying`. |
| Launch failed | `choosing(error: launch)`; selection and any prior snapshot retained; retry Fly, choose another Theme, or Cancel. |
| Change theme | From `flying`: snapshot Flight, freeze simulation and terrain presentation, `choosing` with active Theme selected. |
| Cancel with resident prior terrain | From `choosing`: discard pending selection, resume snapshot directly. |
| Cancel after terrain released | From `choosing` or `preparing`: invalidate candidate, acknowledge cancellation, `restoring` under a new generation. |
| Cancel without prior Flight | Not offered. A ready initial Nature background is not a prior Flight. |
| Restored | Current generation only: first render matches saved presentation, then `flying`. |
| Restore failed | `choosing(error: restore)`; retain snapshot, offer Retry restoration or select a Theme and Fly fresh. |
| Retry | Startup error restarts only unfinished startup work; launch error prepares selection; restore error restores snapshot. |
| Duplicate action while busy | Fly, selection changes, and repeated Cancel/Retry during restoration have no effect. |
| Resize/orientation/visibility | Preserve state and selection; update projection/layout, never add menu time to simulation. |

## Rules

1. **Single operation.** At most one `PreparationJob` exists. While `preparing` or `restoring`,
   Fly presses and selection changes are ignored, and the controls report as busy.
2. **Generation token.** Every launch (including selecting the already-active Theme) increments a
   monotonic counter, as do startup and restoration. Every slice and commit checks that token;
   a stale job may release only resources it still owns, never a pool lease used by a newer job.
   Await outstanding writes/readbacks and acknowledge cancellation before buffers are reused.
3. **Atomic commit.** Terrain, surfaces, sky, fog, lighting, and the camera pose are swapped in one
   step. No frame may present two Themes. An opaque overlay covers every incomplete world.
   Preparation does not tick the fixed-step simulation or hint fade.
4. **Readiness.** A world is ready when visible coverage is complete through the Theme's intended
   fog envelope, the plane and camera are safely framed, and surface and sky match the Theme.
   Peripheral rings keep streaming after readiness; readiness is never obtained by widening fog or
   revealing holes.
5. **Fresh flight.** Fly always starts from the Theme's starting state: position, heading, safe
   altitude, level attitude, default throttle, neutral steering, disengaged Autopilot, reset hint
   timers — even when the selected Theme is already active.
6. **Pause and snapshot.** Opening the chooser from flight freezes the simulation and captures one
   `FlightSnapshot`. No simulation time passes while paused, and none is replayed on resume.
7. **Memory.** Preparing another Theme returns the old residency to one bounded reusable geometry
   pool and clears coordinate ownership. It overwrites that pool after cancellation acknowledgement;
   it never allocates a second world pool. Keep one flight material set and the page renderer.
   Dispose preview/obsolete resources when no longer used; dispose all retained resources at
   teardown. Do not dispose a geometry and then leave it available in the pool.
8. **Cancel.** Invalidates the candidate generation, releases candidate residency, rebuilds the
   snapshot's world starting from its camera region, restores the snapshot, resets the wall-clock
   baseline, and resumes. Present the saved interpolation phase before stepping again.
   Budget: two seconds from Cancel activation on reference devices, including cancellation
   acknowledgement, rebuild, upload, and the first restored frame, with visible feedback.
9. **Failure.** A preparation failure returns to `choosing` with the selection and an explanation,
   offering retry or another selection. Any prior flight stays recoverable. A restoration failure
   keeps the snapshot and offers retry or a fresh flight. Neither exposes a partial world.
10. **Input isolation.** Menu pointer, touch, and keyboard events never reach steering, throttle,
    simulation time, or Autopilot. On entering flight, gestures are ended, steering is neutralised,
    and queued throttle is cleared; control requires a fresh event. Idle history is preserved so
    Autopilot does not spuriously re-engage. Keyboard operates the chooser only; flight steering
    stays pointer- and touch-only. Suppress synthetic events from menu gestures until released;
    a stationary pointer above the old button cannot steer. Resize remaps only an already-active
    flight pointer and never satisfies the fresh-input gate.

## Chooser DOM contract

Use a modal dialog with a labelled native radio group for the three Theme cards, descriptions,
static images, a non-colour checked indicator, Fly, and conditional Cancel. Tab/Shift+Tab,
radio arrow keys, Space, and Enter work with visible focus. Escape behaves as Cancel only when
a prior Flight exists and restoration is not already running. Move focus into the dialog on
opening and back to Change theme on return. Announce preparation/restoration via a polite status
region and errors via an alert; do not trap the user on a disabled control.

Use a scrolling single-column layout on narrow phones and three columns when space allows.
Maintain readable text, reachable controls, safe-area padding, and touch targets at least 44 CSS
pixels high. Restrict flight listeners to the canvas and the `flying` phase; scrolling or pinching
the chooser must not affect Throttle. Outside it, show only Change theme and the temporary hint.
Hint opacity/fade progress follows active simulation time and freezes while the chooser is open.

## Render module interface

- `fillChunk(geometry: BufferGeometry, key: ChunkKey, world: WorldContext)` uses one shared
  generator; its row-sliced variant uses the same samples and topology rules during preparation.
- `applyTheme` updates existing terrain/sky/fog/light/surface uniforms together under the overlay.
- Preparation accepts a world, launch pose or saved presentation, and generation. It reports
  progress/readiness/failure; it never advances a Flight or selects a Theme.
- An allocation-bounded update owns slot metadata, meshes, load/replacement queues, and pool
  leases. The caller supplies the current plane/camera state. Keep outgoing LODs until replacements
  are ready and morphed; a missed budget defers work rather than exposing a hole.
- Cancellation acknowledges that no old work can touch shared buffers. Teardown disposes all
  resident and free pool geometry, material/texture ownership, and CPU references.
- After camera interpolation, update the camera world matrix before sky inverse-view-projection
  uniforms; then render the terrain and sky with the same camera state.

## Preview contract

- Three cards, generated once per page visit, sequentially during startup; successful cards are
  cached. Use actual shared terrain, surface, sky, and material functions at one fixed Seed.
- One reusable 256×144 RGBA8 render target: depth on; stencil, MSAA, and mipmaps off.
- `readRenderTargetPixelsAsync()`, row flip, opaque alpha, 2D canvas, `toBlob()`,
  `URL.createObjectURL()`. Preserve the existing custom shaders' output without an extra CPU
  colour conversion; `NoToneMapping`. Check on-screen/offscreen parity at the same view.
- Renderer state is saved and restored in `try/finally`: render target, viewport, scissor and
  scissor test, clear state, output colour space, tone mapping and exposure, and any swapped
  camera or uniform references. Restore state before yielding, and retain the target until
  asynchronous readback completes. Reject stale completions before attaching images.
- Preview geometry, materials, buffers, and the target are released after the third card. Object
  URLs are revoked only when their image is permanently discarded; reopening the chooser reuses the
  cached images. Null Blob, failed decode, and failed readback revoke any unusable URL and show
  a retry. A text-only error fallback remains accessible but is not a successful preview.
- Selecting a card changes the pending selection only: no regeneration, no live preview, no change
  to the paused world.
- Navigation to the first rendered Nature frame and to the ready chooser with all three decoded
  previews are measured separately; both must finish within two seconds under simulated 4G.
