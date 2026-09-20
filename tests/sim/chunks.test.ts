import { describe, expect, it } from "vitest";
import {
  createChunkGrid,
  lodForRing,
  type ChunkKey,
} from "../../src/sim/chunks";
import { CHUNK_SIZE, LOD_RINGS, VIEW_RINGS } from "../../src/constants";

const R = VIEW_RINGS;

/** Independent reference: set of chunk coords whose centre is within R of (0,0). */
function discAt(pcx: number, pcz: number): Map<string, number> {
  const m = new Map<string, number>();
  for (let dx = -R; dx <= R; dx++) {
    for (let dz = -R; dz <= R; dz++) {
      if (dx * dx + dz * dz <= R * R) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        m.set(`${cx},${cz}`, lodForRing(Math.max(Math.abs(dx), Math.abs(dz))));
      }
    }
  }
  return m;
}

const keyOf = (k: ChunkKey) => `${k.cx},${k.cz},${k.lod}`;

describe("lodForRing", () => {
  it("maps rings per LOD_RINGS", () => {
    expect(lodForRing(0)).toBe(0);
    expect(lodForRing(LOD_RINGS[0])).toBe(0); // ring 2 -> lod 0
    expect(lodForRing(LOD_RINGS[0] + 1)).toBe(1); // ring 3 -> lod 1
    expect(lodForRing(LOD_RINGS[1])).toBe(1); // ring 7
    expect(lodForRing(LOD_RINGS[1] + 1)).toBe(2); // ring 8
    expect(lodForRing(LOD_RINGS[2])).toBe(2); // ring 16
  });
});

describe("ChunkGrid.update", () => {
  it("first update at origin fills toLoad with the Euclidean disc, nearest-first, toFree empty", () => {
    const grid = createChunkGrid(VIEW_RINGS);
    const toLoad: ChunkKey[] = [];
    const toFree: ChunkKey[] = [];
    grid.update(0, 0, toLoad, toFree);

    const wanted = discAt(0, 0);
    expect(toLoad.length).toBe(wanted.size);
    expect(toLoad.length).toBeGreaterThan(750);
    expect(toLoad.length).toBeLessThan(830);
    expect(toFree.length).toBe(0);

    const seen = new Set(toLoad.map((k) => `${k.cx},${k.cz}`));
    expect(seen.size).toBe(wanted.size);
    for (const k of toLoad) {
      expect(wanted.get(`${k.cx},${k.cz}`)).toBe(k.lod);
    }

    // nearest-first
    let prevD2 = -1;
    for (const k of toLoad) {
      const d2 = (k.cx * CHUNK_SIZE) ** 2 + (k.cz * CHUNK_SIZE) ** 2;
      expect(d2).toBeGreaterThanOrEqual(prevD2);
      prevD2 = d2;
    }
  });

  it("second update at the same position yields empty lists", () => {
    const grid = createChunkGrid(VIEW_RINGS);
    const toLoad: ChunkKey[] = [];
    const toFree: ChunkKey[] = [];
    grid.update(0, 0, toLoad, toFree);
    for (const k of toLoad) grid.markResident(k);
    expect(grid.residentCount).toBe(toLoad.length);
    grid.update(0, 0, toLoad, toFree);
    expect(toLoad.length).toBe(0);
    expect(toFree.length).toBe(0);
  });

  it("moving one chunk in +x diffs exactly the leading/trailing edges", () => {
    const grid = createChunkGrid(VIEW_RINGS);
    const toLoad: ChunkKey[] = [];
    const toFree: ChunkKey[] = [];
    grid.update(0, 0, toLoad, toFree);
    for (const k of toLoad) grid.markResident(k);

    grid.update(CHUNK_SIZE, 0, toLoad, toFree);
    const oldDisc = discAt(0, 0);
    const newDisc = discAt(1, 0);

    const loadSet = new Set(toLoad.map((k) => `${k.cx},${k.cz}`));
    const freeSet = new Set(toFree.map((k) => `${k.cx},${k.cz}`));

    // expected: cells new to the disc, plus cells still in the disc whose LOD changed
    const expectLoad = new Set<string>();
    const expectFree = new Set<string>();
    for (const [k, lod] of newDisc) {
      if (!oldDisc.has(k) || oldDisc.get(k) !== lod) expectLoad.add(k);
    }
    for (const [k, lod] of oldDisc) {
      if (!newDisc.has(k) || newDisc.get(k) !== lod) expectFree.add(k);
    }

    expect(loadSet).toEqual(expectLoad);
    expect(freeSet).toEqual(expectFree);
    expect(toLoad.length).toBe(toFree.length); // equal sizes, both disc edges + LOD re-fills
    expect(toLoad.length).toBeGreaterThan(0);
  });

  it("re-fills chunks whose Chebyshev ring crosses an LOD boundary", () => {
    const grid = createChunkGrid(VIEW_RINGS);
    const toLoad: ChunkKey[] = [];
    const toFree: ChunkKey[] = [];
    // plane at chunk (10,0); chunk (7,0) is ring 3 (lod 1). Move to (9,0): ring 2 (lod 0).
    grid.update(10 * CHUNK_SIZE, 0, toLoad, toFree);
    for (const k of toLoad) grid.markResident(k);
    grid.update(9 * CHUNK_SIZE, 0, toLoad, toFree);

    const freed = toFree.find((k) => k.cx === 7 && k.cz === 0);
    const loading = toLoad.find((k) => k.cx === 7 && k.cz === 0);
    expect(freed?.lod).toBe(1);
    expect(loading?.lod).toBe(0);
  });

  it("reuses caller-supplied lists (reset length, no new arrays)", () => {
    const grid = createChunkGrid(VIEW_RINGS);
    const toLoad: ChunkKey[] = [];
    const toFree: ChunkKey[] = [];
    grid.update(0, 0, toLoad, toFree);
    for (const k of toLoad) grid.markResident(k);
    grid.update(CHUNK_SIZE, 0, toLoad, toFree);
    const loadRef = toLoad;
    const freeRef = toFree;
    grid.update(2 * CHUNK_SIZE, 0, toLoad, toFree);
    expect(toLoad).toBe(loadRef);
    expect(toFree).toBe(freeRef);
  });
});
