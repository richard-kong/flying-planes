import { describe, expect, it } from "vitest";
import type { BufferGeometry } from "three";
import { LOD_RESOLUTIONS } from "../../src/constants";
import {
  beginChunkFill,
  makeSurfaceGeometry,
  makeTerrainGeometry,
  stepChunkFill,
} from "../../src/render/terrainMesh";
import type { ChunkKey } from "../../src/sim/chunks";
import type { WorldContext } from "../../src/sim/themes";
import { worldOf } from "../sim/theme-test-helpers";

function fill(
  geometry: BufferGeometry,
  key: ChunkKey,
  world: WorldContext,
  rowBudget = 1024,
): void {
  const job = beginChunkFill(geometry, key, world);
  while (!job.done) {
    stepChunkFill(job, rowBudget);
    if (job.surfaceCounts > 0 && !job.surface) {
      job.surface = makeSurfaceGeometry(key.lod);
    }
  }
  job.surface?.dispose();
}

describe("terrain mesh determinism", () => {
  for (const theme of ["nature", "alien", "arctic"] as const) {
    for (const lod of [0, 1, 2] as const) {
      it.each([1, 1024])(
        `${theme} LOD ${lod} keeps heights independent of streaming history (row budget %i)`,
        (rowBudget) => {
          const world = worldOf(theme, 42);
          const geometry = makeTerrainGeometry(lod);
          const key = { cx: 0, cz: 0, lod };
          try {
            fill(geometry, { cx: 1, cz: 1, lod }, world);
            fill(geometry, key, world, rowBudget);
            const positions = geometry.getAttribute("position").array.slice();
            const heights = geometry.getAttribute("aMorph").array.slice();

            fill(geometry, { cx: 20, cz: -10, lod }, worldOf("alien", 773));
            fill(geometry, key, world, rowBudget);
            expect(geometry.getAttribute("position").array).toEqual(positions);
            const actual = geometry.getAttribute("aMorph").array;
            let maxDrift = 0;
            for (let v = 0; v < actual.length; v++) {
              maxDrift = Math.max(maxDrift, Math.abs(actual[v] - heights[v]));
            }
            expect(maxDrift, "same chunk grows/shrinks after unrelated terrain is streamed").toBe(0);

            const side = LOD_RESOLUTIONS[lod] + 3;
            const position = geometry.getAttribute("position");
            const morph = geometry.getAttribute("aMorph");
            for (let j = 2; j < side - 1; j += 2) {
              for (let i = 2; i < side - 1; i += 2) {
                const v = j * side + i;
                const expected = (position.getY(v - side + 1) + position.getY(v + side - 1)) / 2;
                expect(morph.getX(v)).toBeCloseTo(expected, 3);
              }
            }
          } finally {
            geometry.dispose();
          }
        },
      );
    }
  }
});
