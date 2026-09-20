// Chunk geometry pooling and filling (FR-006/007/012). Geometry objects are pooled per LOD
// and only vertex data is rewritten on acquisition — no allocation in the frame loop (NFR-002).
import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import {
  CHUNK_SIZE,
  LOD_MORPH_BAND,
  LOD_RESOLUTIONS,
  LOD_RINGS,
  POOL_PER_LOD,
  SKIRT_DEPTH,
} from "../constants";
import { biomeParamsAt, BiomeParams } from "../sim/biome";
import { ChunkKey } from "../sim/chunks";
import { heightAt, normalAt } from "../sim/terrain";

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

function makeGeometry(lod: number): BufferGeometry {
  const res = LOD_RESOLUTIONS[lod];
  const side = res + 3;
  const count = side * side;
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(count * 3), 3));
  // per-vertex biome params so one material can render both biomes (R3):
  //   biomeA = (snowHeight, forestTop, forestBottom, rockSlope)
  //   biomeB = (fogDensity, morphStart, morphEnd, unused) — morph band edges in chunk units
  //   aMorph = this vertex's height on the next-coarser lod grid (T056 vertex morphing)
  g.setAttribute("biomeA", new BufferAttribute(new Float32Array(count * 4), 4));
  g.setAttribute("biomeB", new BufferAttribute(new Float32Array(count * 4), 4));
  g.setAttribute("aMorph", new BufferAttribute(new Float32Array(count), 1));
  g.setIndex(buildIndex(res));
  g.userData.lod = lod;
  return g;
}

export interface ChunkPool {
  acquire(lod: number): BufferGeometry;
  release(geometry: BufferGeometry): void;
}

export function createChunkPool(): ChunkPool {
  const pools: BufferGeometry[][] = [[], [], []];
  for (let lod = 0; lod < 3; lod++) {
    for (let i = 0; i < POOL_PER_LOD[lod]; i++) pools[lod].push(makeGeometry(lod));
  }
  return {
    acquire(lod: number): BufferGeometry {
      const g = pools[lod].pop();
      if (g) return g;
      return makeGeometry(lod);
    },
    release(geometry: BufferGeometry): void {
      pools[geometry.userData.lod as number].push(geometry);
    },
  };
}

// scratch height grid, sized for the finest lod's (res + 1) interior samples
const heightsScratch = new Float32Array((LOD_RESOLUTIONS[0] + 1) * (LOD_RESOLUTIONS[0] + 1));

export function fillChunk(geometry: BufferGeometry, key: ChunkKey, seed: number): void {
  const lod = key.lod;
  const res = LOD_RESOLUTIONS[lod];
  const side = res + 3;
  const ox = key.cx * CHUNK_SIZE;
  const oz = key.cz * CHUNK_SIZE;
  const step = CHUNK_SIZE / res;

  const pos = geometry.getAttribute("position") as BufferAttribute;
  const nrm = geometry.getAttribute("normal") as BufferAttribute;
  const bA = geometry.getAttribute("biomeA") as BufferAttribute;
  const bB = geometry.getAttribute("biomeB") as BufferAttribute;
  const mrp = geometry.getAttribute("aMorph") as BufferAttribute;
  const p = pos.array as Float32Array;
  const n = nrm.array as Float32Array;
  const a = bA.array as Float32Array;
  const b = bB.array as Float32Array;
  const m = mrp.array as Float32Array;

  for (let j = 0; j < side; j++) {
    const edge = j === 0 || j === side - 1;
    const gj = Math.min(Math.max(j - 1, 0), res);
    for (let i = 0; i < side; i++) {
      const gi = Math.min(Math.max(i - 1, 0), res);
      const wx = ox + gi * step;
      const wz = oz + gj * step;
      const v = j * side + i;
      const isEdge = edge || i === 0 || i === side - 1;
      const h = heightAt(wx, wz, seed);
      heightsScratch[gj * (res + 1) + gi] = h;
      p[v * 3] = wx - ox;
      p[v * 3 + 1] = h - (isEdge ? SKIRT_DEPTH : 0);
      p[v * 3 + 2] = wz - oz;

      if (!isEdge) {
        normalAt(wx, wz, seed, normalScratch);
        n[v * 3] = normalScratch.x;
        n[v * 3 + 1] = normalScratch.y;
        n[v * 3 + 2] = normalScratch.z;
      } else {
        n[v * 3] = 0;
        n[v * 3 + 1] = 1;
        n[v * 3 + 2] = 0;
      }

      biomeParamsAt(wx, seed, biomeScratch);
      a[v * 4] = biomeScratch.snowHeight;
      a[v * 4 + 1] = biomeScratch.forestTop;
      a[v * 4 + 2] = biomeScratch.forestBottom;
      a[v * 4 + 3] = biomeScratch.rockSlope;
      b[v * 4] = biomeScratch.fogDensity;
    }
  }

  // morph targets (T056): height of each vertex on the next-coarser lod grid. Even grid
  // indices coincide with parent samples; odd indices interpolate the same two triangles
  // emitted by buildIndex, so the morphed surface exactly matches the coarser mesh. The
  // coarsest lod has no parent — morph height equals the vertex height, so the band is
  // inert there. Skirt verts keep their drop offset so they never lift out of the ground.
  const morphEnd = lod < 2 ? LOD_RINGS[lod] + 0.5 : 0.001;
  const morphStart = lod < 2 ? morphEnd - LOD_MORPH_BAND : 0;
  const stride = res + 1;
  for (let j = 0; j < side; j++) {
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
  }

  pos.needsUpdate = true;
  nrm.needsUpdate = true;
  bA.needsUpdate = true;
  bB.needsUpdate = true;
  mrp.needsUpdate = true;
  geometry.computeBoundingSphere();
}


