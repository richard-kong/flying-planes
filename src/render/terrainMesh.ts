// Chunk geometry pools and fills (FR-006/007/012, 002 T014). Geometry objects are pooled per
// LOD and only vertex data is rewritten on acquisition — no allocation in the frame loop
// (NFR-002). The water/ice sheet is real geometry: emitSurfaceQuads clips each grid
// triangle's below-level region onto the Theme's surface plane into a pooled surface
// geometry (same material; biomeB.w = 1 marks surface verts for the shader), replacing the
// old fragment-depth projection. Heights stay raw on the terrain grid — submerged land is
// simply occluded by the opaque surface.
import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import {
  CHUNK_SIZE,
  LOD_MORPH_BAND,
  LOD_RESOLUTIONS,
  LOD_RINGS,
  POOL_PER_LOD,
  SKIRT_DEPTH,
  SURF_POOL_PER_LOD,
} from "../constants";
import { biomeParamsAt, BiomeParams } from "../sim/biome";
import { ChunkKey } from "../sim/chunks";
import { heightAt, normalAt } from "../sim/terrain";
import {
  createClipScratch,
  emitSurfaceQuads,
  gridVertexCount,
  maxSurfaceIndices,
  maxSurfaceVertices,
  resetClipScratch,
  type ClipScratch,
} from "../sim/terrain-topology";
import type { WorldContext } from "../sim/themes";

const normalScratch = new Vector3();
const biomeScratch: BiomeParams = {
  amplitude: 0,
  baseFrequency: 0,
  ridgeSharpness: 0,
  heightOffset: 0,
  snowHeight: 0,
  forestTop: 0,
  forestBottom: 0,
  rockSlope: 0,
  fogDensity: 0,
};

function buildIndex(res: number): BufferAttribute {
  const side = res + 3;
  const idx = new Uint32Array((res + 2) * (res + 2) * 6);
  let o = 0;
  for (let j = 0; j < res + 2; j++) {
    for (let i = 0; i < res + 2; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      idx[o++] = a;
      idx[o++] = c;
      idx[o++] = b;
      idx[o++] = b;
      idx[o++] = c;
      idx[o++] = d;
    }
  }
  return new BufferAttribute(idx, 1);
}

export function makeTerrainGeometry(lod: number): BufferGeometry {
  const res = LOD_RESOLUTIONS[lod];
  const count = gridVertexCount(res);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(count * 3), 3));
  // per-vertex biome params so one material can render both biomes (R3):
  //   biomeA = (snowHeight, forestTop, forestBottom, rockSlope)
  //   biomeB = (fogDensity, morphStart, morphEnd, surface flag) — morph band edges in chunk
  //   units; w = 1 on clipped surface verts (T014)
  //   aMorph = this vertex's height on the next-coarser lod grid (T056 vertex morphing)
  g.setAttribute("biomeA", new BufferAttribute(new Float32Array(count * 4), 4));
  g.setAttribute("biomeB", new BufferAttribute(new Float32Array(count * 4), 4));
  g.setAttribute("aMorph", new BufferAttribute(new Float32Array(count), 1));
  g.setIndex(buildIndex(res));
  g.userData.lod = lod;
  return g;
}

// Surface geometries share the terrain attribute layout so one material draws both; they are
// sized to the worst-case clipped topology for their LOD, and carry their own pool.
export function makeSurfaceGeometry(lod: number): BufferGeometry {
  const res = LOD_RESOLUTIONS[lod];
  const count = maxSurfaceVertices(res);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute("biomeA", new BufferAttribute(new Float32Array(count * 4), 4));
  g.setAttribute("biomeB", new BufferAttribute(new Float32Array(count * 4), 4));
  g.setAttribute("aMorph", new BufferAttribute(new Float32Array(count), 1));
  g.setIndex(new BufferAttribute(new Uint32Array(maxSurfaceIndices(res)), 1));
  g.setDrawRange(0, 0);
  g.userData.lod = lod;
  g.userData.surface = true;
  return g;
}

export interface ChunkPool {
  /** Returns undefined when the pool is exhausted — callers defer, never allocate. */
  acquire(lod: number): BufferGeometry | undefined;
  release(geometry: BufferGeometry): void;
  readonly freeCount: number;
}

export interface ChunkPools {
  terrain: ChunkPool;
  surface: ChunkPool;
  /** Every geometry ever created by the pools — for bounded teardown. */
  readonly made: BufferGeometry[];
}

export function createChunkPools(): ChunkPools {
  const made: BufferGeometry[] = [];
  const terrainStacks = LOD_RESOLUTIONS.map((_, lod) => {
    const stack: BufferGeometry[] = [];
    for (let i = 0; i < POOL_PER_LOD[lod]; i++) {
      const g = makeTerrainGeometry(lod);
      stack.push(g);
      made.push(g);
    }
    return stack;
  });
  // surface pools are lazily constructed up to SURF_POOL_PER_LOD — worst-case clipped
  // geometry is large, so it is only allocated once a wet chunk actually needs it
  const surfaceStacks: BufferGeometry[][] = [[], [], []];
  const surfaceMade = [0, 0, 0];
  return {
    terrain: {
      acquire: (lod) => terrainStacks[lod].pop(),
      release: (g) => terrainStacks[g.userData.lod as number].push(g),
      get freeCount() {
        return terrainStacks[0].length + terrainStacks[1].length + terrainStacks[2].length;
      },
    },
    surface: {
      acquire: (lod) => {
        const stack = surfaceStacks[lod];
        const g = stack.pop();
        if (g) return g;
        if (surfaceMade[lod] >= SURF_POOL_PER_LOD[lod]) return undefined;
        surfaceMade[lod]++;
        const created = makeSurfaceGeometry(lod);
        made.push(created);
        return created;
      },
      release: (g) => surfaceStacks[g.userData.lod as number].push(g),
      get freeCount() {
        return (
          surfaceStacks[0].length + surfaceStacks[1].length + surfaceStacks[2].length +
          (SURF_POOL_PER_LOD[0] - surfaceMade[0]) +
          (SURF_POOL_PER_LOD[1] - surfaceMade[1]) +
          (SURF_POOL_PER_LOD[2] - surfaceMade[2])
        );
      },
    },
    made,
  };
}

// Back-compat shim for callers that only fill the terrain grid (smoke test, prototypes).
export interface ChunkPoolLegacy {
  acquire(lod: number): BufferGeometry;
  release(geometry: BufferGeometry): void;
}
export function createChunkPool(): ChunkPoolLegacy {
  const pools = createChunkPools();
  return {
    acquire(lod: number): BufferGeometry {
      const g = pools.terrain.acquire(lod);
      if (g) return g;
      // smoke-test path only: grow beyond the preallocated pool rather than fail
      return makeTerrainGeometry(lod);
    },
    release(geometry: BufferGeometry): void {
      pools.terrain.release(geometry);
    },
  };
}

// scratch height grid, sized for the finest lod's (res + 1) interior samples; one fill is
// live at a time (streamed fills and preparation slices both serialize through it)
const heightsScratch = new Float32Array((LOD_RESOLUTIONS[0] + 1) * (LOD_RESOLUTIONS[0] + 1));
const clipScratch: (ClipScratch | undefined)[] = [undefined, undefined, undefined];
// kinds bookkeeping for the surface emit (shader flag travels as biomeB.w instead)
const kindsScratch = new Uint8Array(maxSurfaceVertices(LOD_RESOLUTIONS[0]));

function scratchFor(res: number): ClipScratch {
  const lod = LOD_RESOLUTIONS.indexOf(res);
  let s = clipScratch[lod];
  if (!s) {
    s = createClipScratch(res);
    clipScratch[lod] = s;
  }
  return s;
}

/**
 * A resumable chunk fill (T017): grid rows fill pos/normal/biome/heights; each completed
 * interior row unlocks the surface quad row beneath it; morph rows trail the height grid.
 * Step through with stepChunkFill for deadline-sliced fills, or fillChunk for the whole
 * chunk in one call. One fill is active at a time — the scratch grids are module state.
 */
export interface ChunkFill {
  readonly key: ChunkKey;
  readonly world: WorldContext;
  readonly terrain: BufferGeometry;
  surface: BufferGeometry | null; // acquired by the caller once countSurface is known
  row: number; // next side row of the grid fill
  morphRow: number; // next side row of the morph pass
  surfRow: number; // next interior quad row of surface emission
  surfVerts: number;
  surfIndices: number;
  surfaceCounts: number; // verts needed, or -1 until counted
  done: boolean;
}

export function beginChunkFill(
  terrain: BufferGeometry,
  key: ChunkKey,
  world: WorldContext,
): ChunkFill {
  return {
    key, world, terrain,
    surface: null,
    row: 0, morphRow: 0, surfRow: 0,
    surfVerts: 0, surfIndices: 0, surfaceCounts: -1,
    done: false,
  };
}

function fillGridRow(fill: ChunkFill): void {
  const { key, world, terrain } = fill;
  const lod = key.lod;
  const res = LOD_RESOLUTIONS[lod];
  const side = res + 3;
  const ox = key.cx * CHUNK_SIZE;
  const oz = key.cz * CHUNK_SIZE;
  const step = CHUNK_SIZE / res;
  const j = fill.row;

  const pos = terrain.getAttribute("position") as BufferAttribute;
  const nrm = terrain.getAttribute("normal") as BufferAttribute;
  const bA = terrain.getAttribute("biomeA") as BufferAttribute;
  const bB = terrain.getAttribute("biomeB") as BufferAttribute;
  const p = pos.array as Float32Array;
  const n = nrm.array as Float32Array;
  const a = bA.array as Float32Array;
  const b = bB.array as Float32Array;

  const edge = j === 0 || j === side - 1;
  const gj = Math.min(Math.max(j - 1, 0), res);
  for (let i = 0; i < side; i++) {
    const gi = Math.min(Math.max(i - 1, 0), res);
    const wx = ox + gi * step;
    const wz = oz + gj * step;
    const v = j * side + i;
    const isEdge = edge || i === 0 || i === side - 1;
    const h = heightAt(wx, wz, world);
    heightsScratch[gj * (res + 1) + gi] = h;
    p[v * 3] = wx - ox;
    p[v * 3 + 1] = h - (isEdge ? SKIRT_DEPTH : 0);
    p[v * 3 + 2] = wz - oz;

    if (!isEdge) {
      normalAt(wx, wz, world, normalScratch);
      n[v * 3] = normalScratch.x;
      n[v * 3 + 1] = normalScratch.y;
      n[v * 3 + 2] = normalScratch.z;
    } else {
      n[v * 3] = 0;
      n[v * 3 + 1] = 1;
      n[v * 3 + 2] = 0;
    }

    biomeParamsAt(wx, world, biomeScratch);
    a[v * 4] = biomeScratch.snowHeight;
    a[v * 4 + 1] = biomeScratch.forestTop;
    a[v * 4 + 2] = biomeScratch.forestBottom;
    a[v * 4 + 3] = biomeScratch.rockSlope;
    b[v * 4] = biomeScratch.fogDensity;
  }
  fill.row++;
}

function fillMorphRow(fill: ChunkFill): void {
  const { key, terrain } = fill;
  const lod = key.lod;
  const res = LOD_RESOLUTIONS[lod];
  const side = res + 3;
  const stride = res + 1;
  const morphEnd = lod < 2 ? LOD_RINGS[lod] + 0.5 : 0.001;
  const morphStart = lod < 2 ? morphEnd - LOD_MORPH_BAND : 0;
  const j = fill.morphRow;

  const bB = terrain.getAttribute("biomeB") as BufferAttribute;
  const mrp = terrain.getAttribute("aMorph") as BufferAttribute;
  const b = bB.array as Float32Array;
  const m = mrp.array as Float32Array;

  const edge = j === 0 || j === side - 1;
  const gj = Math.min(Math.max(j - 1, 0), res);
  for (let i = 0; i < side; i++) {
    const gi = Math.min(Math.max(i - 1, 0), res);
    const v = j * side + i;
    const isEdge = edge || i === 0 || i === side - 1;
    const x0 = gi - (gi % 2);
    const z0 = gj - (gj % 2);
    const x1 = Math.min(x0 + 2, res);
    const z1 = Math.min(z0 + 2, res);
    const fx = (gi - x0) * 0.5;
    const fz = (gj - z0) * 0.5;
    const h00 = heightsScratch[z0 * stride + x0];
    const h10 = heightsScratch[z0 * stride + x1];
    const h01 = heightsScratch[z1 * stride + x0];
    const h11 = heightsScratch[z1 * stride + x1];
    // Match buildIndex's a-c-b / b-c-d split. The two triangle planes meet on the
    // diagonal from h10 to h01; bilinear interpolation would not match that surface.
    const mhi = fx + fz <= 1
      ? h00 + (h10 - h00) * fx + (h01 - h00) * fz
      : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
    m[v] = mhi - (isEdge ? SKIRT_DEPTH : 0);
    b[v * 4 + 1] = morphStart;
    b[v * 4 + 2] = morphEnd;
    b[v * 4 + 3] = 0;
  }
  fill.morphRow++;
}

// Emit the whole clipped surface once the height grid is complete. Surface emission needs
// no noise samples, so it stays a single pass even in sliced fills.
function emitAllSurfaceRows(fill: ChunkFill): void {
  const surface = fill.surface;
  if (!surface || fill.surfRow !== 0) return;
  const { key, world } = fill;
  const res = LOD_RESOLUTIONS[key.lod];
  const level = world.theme.surface.level;
  const step = CHUNK_SIZE / res;
  const pos = surface.getAttribute("position") as BufferAttribute;
  const idx = surface.getIndex() as BufferAttribute;
  const scratch = scratchFor(res);
  resetClipScratch(scratch);
  const r = emitSurfaceQuads(
    heightsScratch, res, 0, res, step, level,
    pos.array as Float32Array, kindsScratch, idx.array as Uint32Array,
    0, 0, scratch,
  );
  // pool geometries are worst-case sized; overflow is unreachable
  fill.surfRow = res;
  fill.surfVerts = r.vertexCount;
  fill.surfIndices = r.indexCount;
}

// Count the surface verts/indices a finished height grid needs — pure, dedup-aware.
export function countChunkSurface(fill: ChunkFill): { verts: number; indices: number } {
  const { key, world } = fill;
  const res = LOD_RESOLUTIONS[key.lod];
  const level = world.theme.surface.level;
  const scratch = scratchFor(res);
  resetClipScratch(scratch);
  // counting runs against the same scratch emission uses; finish by resetting again so the
  // real emit sees clean maps
  const stride = res + 1;
  let verts = 0;
  let indices = 0;
  let counted = 0;
  const { gridVert, edgeVert } = scratch;
  for (let gj = 0; gj <= res; gj++) {
    for (let gi = 0; gi <= res; gi++) {
      if (heightsScratch[gj * stride + gi] < level) {
        gridVert[gj * stride + gi] = counted++;
        verts++;
      }
    }
  }
  for (let gj = 0; gj <= res; gj++) {
    for (let gi = 0; gi < res; gi++) {
      const h0 = heightsScratch[gj * stride + gi];
      const h1 = heightsScratch[gj * stride + gi + 1];
      if ((h0 < level) !== (h1 < level)) {
        edgeVert[gj * res + gi] = counted++;
        verts++;
      }
    }
  }
  for (let gj = 0; gj < res; gj++) {
    for (let gi = 0; gi <= res; gi++) {
      const h0 = heightsScratch[gj * stride + gi];
      const h1 = heightsScratch[(gj + 1) * stride + gi];
      if ((h0 < level) !== (h1 < level)) {
        edgeVert[res * stride + gj * stride + gi] = counted++;
        verts++;
      }
    }
  }
  for (let gj = 0; gj < res; gj++) {
    for (let gi = 0; gi < res; gi++) {
      const b = heightsScratch[gj * stride + gi + 1];
      const c = heightsScratch[(gj + 1) * stride + gi];
      if ((b < level) !== (c < level)) {
        edgeVert[2 * res * stride + gj * res + gi] = counted++;
        verts++;
      }
    }
  }
  for (let gj = 0; gj < res; gj++) {
    for (let gi = 0; gi < res; gi++) {
      const a = heightsScratch[gj * stride + gi];
      const b = heightsScratch[gj * stride + gi + 1];
      const c = heightsScratch[(gj + 1) * stride + gi];
      const d = heightsScratch[(gj + 1) * stride + gi + 1];
      for (const [h0, h1, h2] of [[a, c, b], [b, c, d]] as const) {
        const below = (h0 < level ? 1 : 0) + (h1 < level ? 1 : 0) + (h2 < level ? 1 : 0);
        if (below === 2) indices += 6;
        else if (below > 0) indices += 3;
      }
    }
  }
  resetClipScratch(scratch);
  fill.surfaceCounts = verts;
  return { verts, indices };
}

// Per-vertex attributes for the emitted surface verts: flat up normal, fog density sampled
// like terrain, aMorph pinned to the level so the morph band never lifts the sheet.
// biomeA.x carries the terrain height beneath the surface vert so the fragment shader can
// grade the water/ice tint by depth like the baseline renderer (grid verts take their
// sampled height; rim verts sit at the level by construction).
function finishSurfaceAttributes(fill: ChunkFill): void {
  const surface = fill.surface;
  if (!surface || fill.surfVerts === 0) return;
  const { key, world } = fill;
  const res = LOD_RESOLUTIONS[key.lod];
  const lod = key.lod;
  const ox = key.cx * CHUNK_SIZE;
  const oz = key.cz * CHUNK_SIZE;
  const level = world.theme.surface.level;
  const step = CHUNK_SIZE / res;
  const stride = res + 1;
  const morphEnd = lod < 2 ? LOD_RINGS[lod] + 0.5 : 0.001;
  const morphStart = lod < 2 ? morphEnd - LOD_MORPH_BAND : 0;

  const pos = surface.getAttribute("position") as BufferAttribute;
  const nrm = surface.getAttribute("normal") as BufferAttribute;
  const bA = surface.getAttribute("biomeA") as BufferAttribute;
  const bB = surface.getAttribute("biomeB") as BufferAttribute;
  const mrp = surface.getAttribute("aMorph") as BufferAttribute;
  const p = pos.array as Float32Array;
  const n = nrm.array as Float32Array;
  const a = bA.array as Float32Array;
  const b = bB.array as Float32Array;
  const m = mrp.array as Float32Array;
  const eps = step * 0.001;
  for (let v = 0; v < fill.surfVerts; v++) {
    n[v * 3] = 0;
    n[v * 3 + 1] = 1;
    n[v * 3 + 2] = 0;
    const lx = p[v * 3];
    const lz = p[v * 3 + 2];
    const gi = Math.round(lx / step);
    const gj = Math.round(lz / step);
    const onGrid =
      Math.abs(lx - gi * step) < eps && Math.abs(lz - gj * step) < eps;
    a[v * 4] = onGrid ? heightsScratch[gj * stride + gi] : level;
    biomeParamsAt(ox + lx, world, biomeScratch);
    b[v * 4] = biomeScratch.fogDensity;
    b[v * 4 + 1] = morphStart;
    b[v * 4 + 2] = morphEnd;
    b[v * 4 + 3] = 1; // surface flag
    m[v] = level;
  }
}

/**
 * Advance a fill by up to rowBudget grid rows (plus the morph work those rows unlock).
 * When the grid completes, surfaceCounts is computed for the caller to acquire a surface
 * geometry; the clip emission runs after the caller attaches fill.surface (or immediately
 * when the chunk is dry). Returns true when the chunk is fully filled.
 */
export function stepChunkFill(fill: ChunkFill, rowBudget: number): boolean {
  const res = LOD_RESOLUTIONS[fill.key.lod];
  const side = res + 3;
  let remaining = rowBudget;
  while (remaining > 0 && !fill.done) {
    if (fill.row < side) {
      fillGridRow(fill);
      // Row 0 is the skirt; completed interior samples end at row - 2.
      while (fill.morphRow < side) {
        const gj = Math.min(Math.max(fill.morphRow - 1, 0), res);
        const z1 = Math.min(gj - (gj % 2) + 2, res);
        if (z1 > Math.min(fill.row - 2, res)) break;
        fillMorphRow(fill);
      }
      remaining--;
      if (fill.row === side && fill.surfaceCounts < 0) {
        fill.surfaceCounts = countChunkSurface(fill).verts;
      }
      continue;
    }
    if (fill.surfaceCounts > 0 && !fill.surface) {
      return false; // caller must attach a surface geometry before this fill can finish
    }
    if (fill.surface) emitAllSurfaceRows(fill);
    finishSurfaceAttributes(fill);
    {
      const pos = fill.terrain.getAttribute("position") as BufferAttribute;
      const nrm = fill.terrain.getAttribute("normal") as BufferAttribute;
      const bA = fill.terrain.getAttribute("biomeA") as BufferAttribute;
      const bB = fill.terrain.getAttribute("biomeB") as BufferAttribute;
      const mrp = fill.terrain.getAttribute("aMorph") as BufferAttribute;
      pos.needsUpdate = true;
      nrm.needsUpdate = true;
      bA.needsUpdate = true;
      bB.needsUpdate = true;
      mrp.needsUpdate = true;
      fill.terrain.computeBoundingSphere();
      if (fill.surface) {
        const sPos = fill.surface.getAttribute("position") as BufferAttribute;
        const sNrm = fill.surface.getAttribute("normal") as BufferAttribute;
        const sA = fill.surface.getAttribute("biomeA") as BufferAttribute;
        const sB = fill.surface.getAttribute("biomeB") as BufferAttribute;
        const sM = fill.surface.getAttribute("aMorph") as BufferAttribute;
        sPos.needsUpdate = true;
        sNrm.needsUpdate = true;
        sA.needsUpdate = true;
        sB.needsUpdate = true;
        sM.needsUpdate = true;
        (fill.surface.getIndex() as BufferAttribute).needsUpdate = true;
        fill.surface.setDrawRange(0, fill.surfIndices);
        fill.surface.computeBoundingSphere();
      }
      fill.done = true;
    }
  }
  return fill.done;
}

/** Whole-chunk fill in one call (streaming path; used without a surface geometry in tests). */
export function fillChunk(geometry: BufferGeometry, key: ChunkKey, world: WorldContext): void {
  const fill = beginChunkFill(geometry, key, world);
  while (!stepChunkFill(fill, 1024)) {
    // loop until done
  }
}
