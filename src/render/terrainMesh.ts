// Chunk geometry pooling and filling (FR-006/007/012). Geometry objects are pooled per LOD
// and only vertex data is rewritten on acquisition — no allocation in the frame loop (NFR-002).
import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import {
  CHUNK_SIZE,
  LOD_RESOLUTIONS,
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
  //   biomeB = (fogDensity, unused, unused, unused)
  g.setAttribute("biomeA", new BufferAttribute(new Float32Array(count * 4), 4));
  g.setAttribute("biomeB", new BufferAttribute(new Float32Array(count * 4), 4));
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
  const p = pos.array as Float32Array;
  const n = nrm.array as Float32Array;
  const a = bA.array as Float32Array;
  const b = bB.array as Float32Array;

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
      b[v * 4 + 1] = 0;
      b[v * 4 + 2] = 0;
      b[v * 4 + 3] = 0;
    }
  }

  pos.needsUpdate = true;
  nrm.needsUpdate = true;
  bA.needsUpdate = true;
  bB.needsUpdate = true;
  geometry.computeBoundingSphere();
}


