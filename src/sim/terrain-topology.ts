// Clipped surface topology (002 T009/T014): the water/ice sheet is real geometry emitted
// beside the terrain grid in the same chunk buffers. For every interior grid triangle the
// below-level region is projected onto the plane y = level — crossing edges contribute
// shared intersection verts, so adjacent chunks compute identical positions from identical
// heights and the shoreline is exact rather than a one-cell ramp.
//
// Everything is a pure typed-array writer: no scene objects, no allocation in the fill
// path beyond createClipScratch (once per fill context, reused across row slices and
// chunks via resetClipScratch). Callers size buffers from the worst-case bounds below; on
// overflow emitSurfaceQuads reports it and the caller grows once to the worst case and
// re-emits the rows — emission is deterministic, so re-emission reproduces the same verts.

export const VERT_KIND_TERRAIN = 0;
export const VERT_KIND_SURFACE = 1;

// Vertex/index capacities for one chunk at interior resolution `res`.
// Grid block: the existing (res+3)^2 verts incl. skirt ring, (res+2)^2 quads of indices.
export function gridVertexCount(res: number): number {
  const s = res + 3;
  return s * s;
}
export function gridIndexCount(res: number): number {
  return (res + 2) * (res + 2) * 6;
}
// Surface block: every interior grid vert can sit below the level, and every interior
// edge (horizontal, vertical, and the per-quad diagonal) can carry one intersection vert.
export function maxSurfaceVertices(res: number): number {
  return (res + 1) * (res + 1) + 2 * res * (res + 1) + res * res;
}
// Each grid triangle emits at most a quad of surface (two below-verts) = 2 tris = 6 indices.
export function maxSurfaceIndices(res: number): number {
  return res * res * 2 * 6;
}

export interface ClipScratch {
  readonly gridVert: Int32Array; // (res+1)^2, surface-vert index per below-level grid vert
  readonly edgeVert: Int32Array; // 2*res*(res+1) + res*res, per crossing edge
}

export function createClipScratch(res: number): ClipScratch {
  const s: ClipScratch = {
    gridVert: new Int32Array((res + 1) * (res + 1)),
    edgeVert: new Int32Array(2 * res * (res + 1) + res * res),
  };
  resetClipScratch(s);
  return s;
}

export function resetClipScratch(s: ClipScratch): void {
  s.gridVert.fill(-1);
  s.edgeVert.fill(-1);
}

export interface EmitResult {
  readonly vertexCount: number; // surface verts appended
  readonly indexCount: number; // indices appended
  readonly overflowed: boolean; // capacity exhausted — caller grows and re-emits the rows
}

// --- emission internals (module-level, zero per-vert allocation) ---

let cHeights: Float32Array;
let cRes = 0;
let cStride = 0;
let cStep = 0;
let cLevel = 0;
let cPos!: Float32Array;
let cKinds!: Uint8Array;
let cIdx!: Uint32Array;
let cVBase = 0;
let cVLocal = 0;
let cILocal = 0;
let cCapV = 0;
let cCapI = 0;
let cScratch!: ClipScratch;
let cOverflow = false;

function newVert(x: number, z: number): number {
  if (cVLocal >= cCapV) {
    cOverflow = true;
    return -1;
  }
  const v = cVBase + cVLocal;
  cPos[v * 3] = x;
  cPos[v * 3 + 1] = cLevel;
  cPos[v * 3 + 2] = z;
  cKinds[v] = VERT_KIND_SURFACE;
  cVLocal++;
  return v;
}

function vertForGrid(gi: number, gj: number): number {
  const id = gj * cStride + gi;
  const cached = cScratch.gridVert[id];
  if (cached >= 0) return cached;
  const v = newVert(gi * cStep, gj * cStep);
  if (v >= 0) cScratch.gridVert[id] = v;
  return v;
}

// Intersection on the edge between a below-level endpoint and an above-level one.
// t is measured from the below endpoint so both traversal directions agree bit-for-bit.
function vertForEdge(
  giB: number,
  gjB: number,
  hB: number,
  giA: number,
  gjA: number,
  hA: number,
): number {
  let id: number;
  if (gjA === gjB) {
    id = gjB * cRes + Math.min(giA, giB); // horizontal edge (i,j)-(i+1,j)
  } else if (giA === giB) {
    id = cRes * cStride + Math.min(gjA, gjB) * cStride + giB; // vertical edge (i,j)-(i,j+1)
  } else {
    // quad diagonal (i,j+1)-(i+1,j); index by the quad's lower-left corner
    const qi = Math.min(giA, giB);
    const qj = Math.min(gjA, gjB);
    id = 2 * cRes * cStride + qj * cRes + qi;
  }
  const cached = cScratch.edgeVert[id];
  if (cached >= 0) return cached;
  const t = (cLevel - hB) / (hA - hB);
  const v = newVert((giB + (giA - giB) * t) * cStep, (gjB + (gjA - gjB) * t) * cStep);
  if (v >= 0) cScratch.edgeVert[id] = v;
  return v;
}

const poly = new Int32Array(4);

// Emit the below-level polygon of one grid triangle as flat surface triangles.
// Winding follows the original triangle order so faces stay up-facing.
function emitTri(
  gi0: number, gj0: number,
  gi1: number, gj1: number,
  gi2: number, gj2: number,
): void {
  const h0 = cHeights[gj0 * cStride + gi0];
  const h1 = cHeights[gj1 * cStride + gi1];
  const h2 = cHeights[gj2 * cStride + gi2];
  const b0 = h0 < cLevel;
  const b1 = h1 < cLevel;
  const b2 = h2 < cLevel;
  if (!b0 && !b1 && !b2) return;
  // a two-below triangle emits a quad = 2 tris = 6 indices; guard before any write
  if (cILocal + 6 > cCapI) {
    cOverflow = true;
    return;
  }
  let n = 0;
  // walk edges v0->v1, v1->v2, v2->v0: emit the below endpoint, then the crossing point
  if (b0) poly[n++] = vertForGrid(gi0, gj0);
  if (b0 !== b1) poly[n++] = b0
    ? vertForEdge(gi0, gj0, h0, gi1, gj1, h1)
    : vertForEdge(gi1, gj1, h1, gi0, gj0, h0);
  if (b1) poly[n++] = vertForGrid(gi1, gj1);
  if (b1 !== b2) poly[n++] = b1
    ? vertForEdge(gi1, gj1, h1, gi2, gj2, h2)
    : vertForEdge(gi2, gj2, h2, gi1, gj1, h1);
  if (b2) poly[n++] = vertForGrid(gi2, gj2);
  if (b2 !== b0) poly[n++] = b2
    ? vertForEdge(gi2, gj2, h2, gi0, gj0, h0)
    : vertForEdge(gi0, gj0, h0, gi2, gj2, h2);
  if (cOverflow) return;
  // fan from the first vertex — n is 3 (one below) or 4 (two below)
  cIdx[cILocal++] = poly[0];
  cIdx[cILocal++] = poly[1];
  cIdx[cILocal++] = poly[2];
  if (n === 4) {
    cIdx[cILocal++] = poly[0];
    cIdx[cILocal++] = poly[2];
    cIdx[cILocal++] = poly[3];
  }
}

/**
 * Emit the clipped surface for interior quad rows [j0, j1) (each quad = the two triangles
 * of buildIndex). heights is the (res+1)^2 interior height grid; positions are written
 * chunk-local (gi*step). Indices reference absolute vertex slots (vBase + emitted order).
 * Row slices of one chunk share the caller's scratch so verts dedup across slice seams;
 * call resetClipScratch before starting a different chunk.
 */
export function emitSurfaceQuads(
  heights: Float32Array,
  res: number,
  j0: number,
  j1: number,
  step: number,
  level: number,
  pos: Float32Array,
  kinds: Uint8Array,
  idx: Uint32Array,
  vBase: number,
  iBase: number,
  scratch: ClipScratch,
): EmitResult {
  cHeights = heights;
  cRes = res;
  cStride = res + 1;
  cStep = step;
  cLevel = level;
  cPos = pos;
  cKinds = kinds;
  cIdx = idx;
  cVBase = vBase;
  cVLocal = 0;
  cILocal = iBase;
  cCapV = Math.floor(pos.length / 3) - vBase;
  cCapI = idx.length - iBase;
  cScratch = scratch;
  cOverflow = false;

  outer: for (let j = j0; j < j1; j++) {
    for (let i = 0; i < res; i++) {
      emitTri(i, j, i, j + 1, i + 1, j); // buildIndex order (a, c, b)
      emitTri(i + 1, j, i, j + 1, i + 1, j + 1); // (b, c, d)
      if (cOverflow) break outer;
    }
  }
  return {
    vertexCount: cVLocal,
    indexCount: cILocal - iBase,
    overflowed: cOverflow,
  };
}
