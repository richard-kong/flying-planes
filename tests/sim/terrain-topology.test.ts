// 002 T009: headless topology regressions for the clipped surface layer.
// The helpers are pure array writers — no scene objects, no allocation in the fill path.
import { describe, expect, it } from "vitest";
import {
  createClipScratch,
  emitSurfaceQuads,
  gridIndexCount,
  gridVertexCount,
  maxSurfaceIndices,
  maxSurfaceVertices,
  resetClipScratch,
  VERT_KIND_SURFACE,
} from "../../src/sim/terrain-topology";
import { LOD_RESOLUTIONS } from "../../src/constants";

const RES = 8;

/** heights[(j*(res+1))+i], res+1 per side. */
function makeHeights(res: number, fn: (gi: number, gj: number) => number): Float32Array {
  const h = new Float32Array((res + 1) * (res + 1));
  for (let j = 0; j <= res; j++) {
    for (let i = 0; i <= res; i++) h[j * (res + 1) + i] = fn(i, j);
  }
  return h;
}

interface EmitOut {
  pos: Float32Array;
  kinds: Uint8Array;
  idx: Uint32Array;
}

function makeOut(res: number): EmitOut {
  return {
    pos: new Float32Array(maxSurfaceVertices(res) * 3),
    kinds: new Uint8Array(maxSurfaceVertices(res)),
    idx: new Uint32Array(maxSurfaceIndices(res)),
  };
}

const LEVEL = 10;

function emitAll(heights: Float32Array, res: number, out: EmitOut, step = 4) {
  const scratch = createClipScratch(res);
  return emitSurfaceQuads(
    heights, res, 0, res, step, LEVEL,
    out.pos, out.kinds, out.idx, 0, 0, scratch,
  );
}

describe("surface capacities", () => {
  it("covers worst-case all-crossing topology without overflow at every LOD", () => {
    for (const res of LOD_RESOLUTIONS) {
      // alternating heights around the level = every interior edge crosses
      const heights = makeHeights(res, (i, j) => ((i + j) % 2 === 0 ? LEVEL - 5 : LEVEL + 5));
      const out = makeOut(res);
      const scratch = createClipScratch(res);
      const counts = emitSurfaceQuads(
        heights, res, 0, res, 4, LEVEL,
        out.pos, out.kinds, out.idx, 0, 0, scratch,
      );
      expect(counts.vertexCount).toBeLessThanOrEqual(maxSurfaceVertices(res));
      expect(counts.indexCount).toBeLessThanOrEqual(maxSurfaceIndices(res));
      // every emitted index references an emitted vertex
      for (let i = 0; i < counts.indexCount; i++) {
        expect(out.idx[i]).toBeLessThan(counts.vertexCount);
      }
    }
  });

  it("grid + surface capacities bound the whole geometry buffer", () => {
    for (const res of LOD_RESOLUTIONS) {
      // the combined allocation stays finite and matches the closed forms
      expect(gridVertexCount(res)).toBe((res + 3) * (res + 3));
      expect(gridIndexCount(res)).toBe((res + 2) * (res + 2) * 6);
      expect(maxSurfaceVertices(res)).toBe(
        (res + 1) * (res + 1) + 2 * res * (res + 1) + res * res,
      );
      expect(maxSurfaceIndices(res)).toBe(res * res * 2 * 6);
    }
  });
});

describe("emitSurfaceQuads", () => {
  it("emits nothing when the whole chunk is above the level", () => {
    const heights = makeHeights(RES, () => LEVEL + 1);
    const out = makeOut(RES);
    const counts = emitAll(heights, RES, out);
    expect(counts.vertexCount).toBe(0);
    expect(counts.indexCount).toBe(0);
  });

  it("emits a flat indexed sheet when the whole chunk is below the level", () => {
    const heights = makeHeights(RES, () => LEVEL - 5);
    const out = makeOut(RES);
    const counts = emitAll(heights, RES, out);
    // res*res quads -> res*res*2 triangles of surface
    expect(counts.indexCount).toBe(RES * RES * 2 * 3);
    for (let i = 0; i < counts.indexCount; i++) {
      const v = out.idx[i];
      expect(out.pos[v * 3 + 1]).toBe(LEVEL);
      expect(out.kinds[v]).toBe(VERT_KIND_SURFACE);
    }
    // dedup: only the (res+1)^2 grid verts are emitted
    expect(counts.vertexCount).toBe((RES + 1) * (RES + 1));
  });

  it("clipped crossing triangles emit verts lying exactly on the surface plane", () => {
    // one column below, rest above -> only the crossing band emits
    const heights = makeHeights(RES, (i) => (i === 0 ? LEVEL - 4 : LEVEL + 4));
    const out = makeOut(RES);
    const counts = emitAll(heights, RES, out);
    expect(counts.vertexCount).toBeGreaterThan(0);
    for (let v = 0; v < counts.vertexCount; v++) {
      expect(out.pos[v * 3 + 1]).toBe(LEVEL);
      expect(out.kinds[v]).toBe(VERT_KIND_SURFACE);
    }
    // the emitted surface must cover the below-level region: for each below grid vert a
    // surface vert exists at its exact (x,z), at the level
    for (let j = 0; j <= RES; j++) {
      const h = heights[j * (RES + 1) + 0];
      if (h < LEVEL) {
        let found = false;
        for (let v = 0; v < counts.vertexCount; v++) {
          if (out.pos[v * 3] === 0 && out.pos[v * 3 + 2] === j * 4) found = true;
        }
        expect(found, `surface vert under grid (0,${j})`).toBe(true);
      }
    }
  });

  it("an intersection vert lands at the linear t along the crossing edge", () => {
    // left vert at level-4 (x=0), right vert at level+4 (x=step) -> crossing at mid-edge
    const heights = makeHeights(RES, (i) => (i === 0 ? LEVEL - 4 : LEVEL + 4));
    const out = makeOut(RES);
    const counts = emitAll(heights, RES, out);
    const step = 4;
    let foundMid = false;
    for (let v = 0; v < counts.vertexCount; v++) {
      if (Math.abs(out.pos[v * 3] - step / 2) < 1e-6) foundMid = true;
    }
    expect(foundMid).toBe(true);
  });

  it("adjacent chunks produce identical shared-edge intersections", () => {
    // chunk A owns columns 0..RES, chunk B owns RES..2RES of the same profile
    const full = (i: number) => LEVEL + Math.sin(i * 0.7) * 30;
    const hA = makeHeights(RES, (i) => full(i));
    const hB = makeHeights(RES, (i) => full(i + RES));
    const outA = makeOut(RES);
    const outB = makeOut(RES);
    const cA = emitAll(hA, RES, outA);
    const cB = emitAll(hB, RES, outB);
    // every A surface vert sitting on the shared edge x = RES*step must appear in B at x = 0
    const edge = RES * 4;
    let shared = 0;
    for (let v = 0; v < cA.vertexCount; v++) {
      if (outA.pos[v * 3] !== edge) continue;
      const zA = outA.pos[v * 3 + 2];
      let match = false;
      for (let w = 0; w < cB.vertexCount; w++) {
        if (outB.pos[w * 3] === 0 && outB.pos[w * 3 + 2] === zA) match = true;
      }
      expect(match, `B missing shared vert at z=${zA}`).toBe(true);
      shared++;
    }
    expect(shared).toBeGreaterThan(0);
  });

  it("row-sliced emits equal the full emit (partition invariant)", () => {
    const heights = makeHeights(RES, (i, j) => LEVEL + Math.sin(i * 0.9 + j * 0.4) * 20 - 5);
    const whole = makeOut(RES);
    const sliced = makeOut(RES);
    const cw = emitAll(heights, RES, whole);
    const scratch = createClipScratch(RES);
    let vCursor = 0;
    let iCursor = 0;
    for (const [j0, j1] of [[0, 3], [3, RES]] as const) {
      const c = emitSurfaceQuads(
        heights, RES, j0, j1, 4, LEVEL,
        sliced.pos, sliced.kinds, sliced.idx, vCursor, iCursor, scratch,
      );
      vCursor += c.vertexCount;
      iCursor += c.indexCount;
    }
    expect(vCursor).toBe(cw.vertexCount);
    expect(iCursor).toBe(cw.indexCount);
    for (let i = 0; i < cw.indexCount; i++) {
      expect(sliced.idx[i]).toBe(whole.idx[i]);
    }
    for (let v = 0; v < cw.vertexCount * 3; v++) {
      expect(sliced.pos[v]).toBe(whole.pos[v]);
    }
  });

  it("scratch reuse across emits leaves no stale vert mappings", () => {
    const below = makeHeights(RES, () => LEVEL - 5);
    const above = makeHeights(RES, () => LEVEL + 5);
    const out = makeOut(RES);
    const scratch = createClipScratch(RES);
    emitSurfaceQuads(below, RES, 0, RES, 4, LEVEL, out.pos, out.kinds, out.idx, 0, 0, scratch);
    resetClipScratch(scratch);
    const c = emitSurfaceQuads(above, RES, 0, RES, 4, LEVEL, out.pos, out.kinds, out.idx, 0, 0, scratch);
    expect(c.vertexCount).toBe(0);
    expect(c.indexCount).toBe(0);
  });
});
