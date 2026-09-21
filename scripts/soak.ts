// One-hour-equivalent max-speed sim soak (T048, SC-005): 432000 fixed steps at SIM_DT.
// Checks floor clearance, speed bounds, and finite state across the whole flight.
import { MAX_ACCEL, MAX_SPEED, MIN_ALTITUDE_ABOVE_TERRAIN, MIN_SPEED, SIM_DT } from "../src/constants";
import { createPlaneState, stepFlight } from "../src/sim/flight";
import { surfaceHeightAt } from "../src/sim/terrain";
import { themeById, type WorldContext } from "../src/sim/themes";
import type { FlightInput } from "../src/sim/input";

const SEED = 42;
const input: FlightInput = { steerX: 0, steerY: 0, throttle: 1, active: true, lastInputTime: 0, gateArmed: true };
const WORLD: WorldContext = { theme: themeById("alien"), seed: SEED };
const s = createPlaneState(WORLD);
s.heading = Math.PI / 2; // fly +x to cross every biome band (~120 transitions)
const t0 = performance.now();
let minClear = Infinity;
let prevSpeed = s.speed;
const steps = Math.round(3600 / SIM_DT);
for (let i = 0; i < steps; i++) {
  stepFlight(s, input, SIM_DT, WORLD);
  if (i % 240 === 0) {
    const clear = s.position.y - surfaceHeightAt(s.position.x, s.position.z, WORLD) - MIN_ALTITUDE_ABOVE_TERRAIN;
    if (clear < minClear) minClear = clear;
  }
  if (!Number.isFinite(s.position.x + s.position.y + s.position.z + s.heading + s.speed)) {
    console.error(`NaN at step ${i}`);
    process.exit(1);
  }
  if (Math.abs(s.speed - prevSpeed) > MAX_ACCEL * SIM_DT + 1e-9) {
    console.error(`speed jump at step ${i}: ${prevSpeed} -> ${s.speed}`);
    process.exit(1);
  }
  prevSpeed = s.speed;
}
const wall = (performance.now() - t0) / 1000;
const dist = Math.hypot(s.position.x, s.position.z);
console.log(
  `sim 3600 s in ${wall.toFixed(1)} s wall | distance ${(dist / 1000).toFixed(0)} km | ` +
    `speed ${s.speed.toFixed(1)} | min clearance above floor ${minClear.toFixed(2)} m`,
);
if (minClear < -1e-6 || s.speed < MIN_SPEED || s.speed > MAX_SPEED) process.exit(1);
