// Regenerates tests/fixtures/alien.ts from the CURRENT generator output (002 T001).
// Run only against a known-good baseline revision before any Theme refactor — committing the
// output locks that behaviour as the Alien Planet baseline. Usage:
//   npx vite-node scripts/capture-alien-baseline.ts <baseline-revision>
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { Vector3 } from "three";
import { bandWeight } from "../src/sim/biome";
import { heightAt, normalAt } from "../src/sim/terrain";
import { themeById, type WorldContext } from "../src/sim/themes";
import { BAND_WIDTH, TRANSITION_WIDTH, WATER_LEVEL } from "../src/constants";

const revision = process.argv[2]
  ?? execSync("git rev-parse HEAD").toString().trim();

const PERIOD = 2 * BAND_WIDTH;
const SEEDS = [42, 7, 4294967295];

// Same crossing search as tests/sim/terrain.test.ts: returns the A->F and F->A band
// transition centreline x positions plus both band centres for the seed.
function bandInfo(seed: number): {
  aToF: number;
  fToA: number;
  alpineCentre: number;
  foothillsCentre: number;
} {
  function findCrossing(lo: number, hi: number, upward: boolean): number {
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if ((bandWeight(mid, seed) < 0.5) === upward) lo = mid;
      else hi = mid;
    }
    return hi;
  }
  let aToF = -1;
  let fToA = -1;
  for (let x = -PERIOD; x < 2 * PERIOD && (aToF < 0 || fToA < 0); x += 10) {
    const w0 = bandWeight(x, seed);
    const w1 = bandWeight(x + 10, seed);
    if (aToF < 0 && w0 < 0.5 && w1 >= 0.5) aToF = findCrossing(x, x + 10, true);
    if (fToA < 0 && w0 >= 0.5 && w1 < 0.5) fToA = findCrossing(x, x + 10, false);
  }
  if (aToF < 0 || fToA < 0) throw new Error(`no band crossings found for seed ${seed}`);
  const alpineCentre = fToA + (((aToF - fToA) % PERIOD) + PERIOD) % PERIOD / 2;
  const foothillsCentre = aToF + (((fToA - aToF) % PERIOD) + PERIOD) % PERIOD / 2;
  return { aToF, fToA, alpineCentre, foothillsCentre };
}

const GRID = { x0: -10000, z0: -10000, step: 1000, count: 21 };
const SCAN = { x0: -8000, z: 0, step: 250, count: 65 };
// shoreline mask region: centred on the seed-42 Foothills band centre, where lakes occur
const SHORE = { x0: 0, z0: -2000, step: 100, count: 41 };
const DISTANT_POINTS = [
  [250000, 12345], [-250000, -12345], [1000000, -250000], [-1000000, 250000],
  [4321, 987654], [-777777, 555555],
];

interface FixtureBands { aToF: number; fToA: number; alpineCentre: number; foothillsCentre: number }

const bands: Record<number, FixtureBands> = {};
const gridHeights: Record<number, number[]> = {};
const scanHeights: number[] = [];
const normalTriples: number[] = [];
const shoreMask: number[] = [];
const distantHeights: number[] = [];

const worlds: Record<number, WorldContext> = {};
for (const seed of SEEDS) {
  worlds[seed] = { theme: themeById("alien"), seed };
  bands[seed] = bandInfo(seed);
  const heights: number[] = [];
  for (let j = 0; j < GRID.count; j++) {
    for (let i = 0; i < GRID.count; i++) {
      heights.push(heightAt(GRID.x0 + i * GRID.step, GRID.z0 + j * GRID.step, worlds[seed]));
    }
  }
  gridHeights[seed] = heights;
}

for (let i = 0; i < SCAN.count; i++) {
  scanHeights.push(heightAt(SCAN.x0 + i * SCAN.step, SCAN.z, worlds[42]));
}

{
  const n = new Vector3();
  for (let j = 0; j < GRID.count; j += 2) {
    for (let i = 0; i < GRID.count; i += 2) {
      normalAt(GRID.x0 + i * GRID.step, GRID.z0 + j * GRID.step, worlds[42], n);
      normalTriples.push(n.x, n.y, n.z);
    }
  }
}

{
  SHORE.x0 = bands[42].foothillsCentre - ((SHORE.count - 1) / 2) * SHORE.step;
  for (let j = 0; j < SHORE.count; j++) {
    for (let i = 0; i < SHORE.count; i++) {
      const h = heightAt(SHORE.x0 + i * SHORE.step, SHORE.z0 + j * SHORE.step, worlds[42]);
      shoreMask.push(h < WATER_LEVEL ? 1 : 0);
    }
  }
}

for (const [x, z] of DISTANT_POINTS) {
  distantHeights.push(heightAt(x, z, worlds[42]));
}

const below = shoreMask.reduce((a, b) => a + b, 0);
if (below === 0 || below === shoreMask.length) {
  throw new Error("shoreline mask region has no land/water mix; pick another region");
}

const out = `// GENERATED FILE — do not edit by hand. Regenerate with
//   npx vite-node scripts/capture-alien-baseline.ts <revision>
// 002 T001: golden Alien Planet baseline. Every value was produced by the pre-Theme generator;
// tests/sim/alien-baseline.test.ts asserts the refactored generator reproduces them exactly.

export const BASELINE_REVISION = ${JSON.stringify(revision)};
export const BASELINE_SEEDS = ${JSON.stringify(SEEDS)} as const;
export const GRID = ${JSON.stringify(GRID)} as const;
export const SCAN = ${JSON.stringify(SCAN)} as const;
export const SHORE = ${JSON.stringify(SHORE)} as const;
export const DISTANT_POINTS = ${JSON.stringify(DISTANT_POINTS)} as const;
export const BANDS: Record<number, { aToF: number; fToA: number; alpineCentre: number; foothillsCentre: number }> =
  ${JSON.stringify(bands)};
export const GRID_HEIGHTS: Record<number, number[]> = ${JSON.stringify(gridHeights)};
export const SCAN_HEIGHTS: number[] = ${JSON.stringify(scanHeights)};
export const NORMAL_TRIPLES: number[] = ${JSON.stringify(normalTriples)};
export const SHORE_MASK: number[] = ${JSON.stringify(shoreMask)};
export const DISTANT_HEIGHTS: number[] = ${JSON.stringify(distantHeights)};
`;

writeFileSync(new URL("../tests/fixtures/alien.ts", import.meta.url), out);
console.log(
  `fixtures written @ ${revision}: ${SEEDS.length} seeds x ${GRID.count}x${GRID.count} grid, ` +
    `${SCAN.count} scan heights, ${normalTriples.length / 3} normals, ` +
    `shore mask ${below}/${shoreMask.length} below WATER_LEVEL, ${DISTANT_POINTS.length} distant`,
);
