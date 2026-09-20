// ChunkGrid (R2, FR-016, FR-024): the resident set is the Euclidean disc of chunks whose
// centre lies within viewRings of the Plane's chunk; LOD is by Chebyshev ring. update() diffs
// wanted vs resident into caller-supplied lists (pooled entries, reset each call — do not
// retain them past the frame).
import { CHUNK_SIZE, LOD_RINGS } from "../constants";

export interface ChunkKey {
  cx: number;
  cz: number;
  lod: 0 | 1 | 2;
}

interface Rec extends ChunkKey {
  d2: number;
}

export function lodForRing(ring: number): 0 | 1 | 2 {
  if (ring <= LOD_RINGS[0]) return 0;
  if (ring <= LOD_RINGS[1]) return 1;
  return 2;
}

export function chunkId(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

function decodeX(id: number): number {
  return Math.floor(id / 65536) - 32768;
}

function decodeZ(id: number): number {
  return (id % 65536) - 32768;
}

export interface ChunkGrid {
  update(planeX: number, planeZ: number, toLoad: ChunkKey[], toFree: ChunkKey[]): void;
  markResident(key: ChunkKey): void;
  readonly residentCount: number;
}

const MAX_OUT = 2048; // pooled records, covers a full disc plus the largest possible diff

export function createChunkGrid(viewRings: number): ChunkGrid {
  const resident = new Map<number, 0 | 1 | 2>();
  const pool: Rec[] = [];
  for (let i = 0; i < MAX_OUT; i++) pool.push({ cx: 0, cz: 0, lod: 0, d2: 0 });
  let poolUsed = 0;

  function take(cx: number, cz: number, lod: 0 | 1 | 2, d2: number): Rec {
    const r = pool[poolUsed++];
    r.cx = cx;
    r.cz = cz;
    r.lod = lod;
    r.d2 = d2;
    return r;
  }

  function byD2(a: ChunkKey, b: ChunkKey): number {
    return (a as Rec).d2 - (b as Rec).d2;
  }

  function update(
    planeX: number,
    planeZ: number,
    toLoad: ChunkKey[],
    toFree: ChunkKey[],
  ): void {
    toLoad.length = 0;
    toFree.length = 0;
    poolUsed = 0;
    const pcx = Math.floor(planeX / CHUNK_SIZE);
    const pcz = Math.floor(planeZ / CHUNK_SIZE);
    const r2 = viewRings * viewRings;

    // free pass: drop out-of-disc and queue LOD re-fills
    for (const [id, lod] of resident) {
      const dx = decodeX(id) - pcx;
      const dz = decodeZ(id) - pcz;
      const d2 = dx * dx + dz * dz;
      const wantedLod = lodForRing(Math.max(Math.abs(dx), Math.abs(dz)));
      if (d2 > r2) {
        toFree.push(take(decodeX(id), decodeZ(id), lod, d2));
        resident.delete(id);
      } else if (lod !== wantedLod) {
        toFree.push(take(decodeX(id), decodeZ(id), lod, d2));
        resident.delete(id);
      }
    }

    // load pass: every wanted cell not resident
    for (let dx = -viewRings; dx <= viewRings; dx++) {
      for (let dz = -viewRings; dz <= viewRings; dz++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        const cx = pcx + dx;
        const cz = pcz + dz;
        const id = chunkId(cx, cz);
        if (resident.has(id)) continue;
        const lod = lodForRing(Math.max(Math.abs(dx), Math.abs(dz)));
        toLoad.push(take(cx, cz, lod, d2));
      }
    }

    toLoad.sort(byD2);
  }

  function markResident(key: ChunkKey): void {
    resident.set(chunkId(key.cx, key.cz), key.lod);
  }

  return {
    update,
    markResident,
    get residentCount() {
      return resident.size;
    },
  };
}
