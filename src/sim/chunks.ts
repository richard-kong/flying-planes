// ChunkGrid (R2, FR-016, FR-024): the resident set is the Euclidean disc of chunks whose
// centre lies within viewRings of the Plane's chunk; LOD is by Chebyshev ring. update() diffs
// wanted vs resident into caller-supplied lists (pooled entries, reset each call — do not
// retain them past the frame). A chunk whose ring crosses an LOD boundary is reported in
// toLoad only — never toFree — so the previous mesh stays on screen until its replacement
// has been filled and swapped in (T055).
//
// Residency is a CoordTable keyed by exact (cx, cz) pairs — no per-column maps, no Map
// iteration, and no allocation in the steady-state update path (T051).
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

export interface ChunkGrid {
  update(planeX: number, planeZ: number, toLoad: ChunkKey[], toFree: ChunkKey[]): void;
  markResident(key: ChunkKey): void;
  readonly residentCount: number;
}

// Coordinate-keyed store with O(1) get/set/delete and zero steady-state allocation.
// Keys are exact (cx, cz) pairs compared on probe — no hash packing, no coordinate aliasing.
export interface CoordTable<V> {
  get(cx: number, cz: number): V | undefined;
  set(cx: number, cz: number, value: V): void;
  delete(cx: number, cz: number): void;
  forEach(cb: (cx: number, cz: number, value: V) => void): void;
  readonly size: number;
}

function hashCoord(cx: number, cz: number): number {
  return (Math.imul(cx, 0x9e3779b1) ^ Math.imul(cz, 0x85ebca77)) >>> 0;
}

export function createCoordTable<V>(capacityPow2 = 4096): CoordTable<V> {
  const cap = capacityPow2;
  const mask = cap - 1;
  const sx = new Int32Array(cap);
  const sz = new Int32Array(cap);
  const used = new Uint8Array(cap);
  const vals: (V | undefined)[] = new Array(cap);
  let size = 0;

  function slotOf(cx: number, cz: number): number {
    let i = hashCoord(cx, cz) & mask;
    while (used[i] !== 0 && (sx[i] !== cx || sz[i] !== cz)) i = (i + 1) & mask;
    return i;
  }

  // standard linear-probing delete: clear the slot, then reinsert the following cluster
  function removeAt(i: number): void {
    used[i] = 0;
    vals[i] = undefined;
    size--;
    let j = (i + 1) & mask;
    while (used[j] !== 0) {
      const cx = sx[j];
      const cz = sz[j];
      const v = vals[j] as V;
      used[j] = 0;
      vals[j] = undefined;
      size--;
      const k = slotOf(cx, cz);
      sx[k] = cx;
      sz[k] = cz;
      vals[k] = v;
      used[k] = 1;
      size++;
      j = (j + 1) & mask;
    }
  }

  return {
    get(cx: number, cz: number): V | undefined {
      const i = slotOf(cx, cz);
      return used[i] !== 0 ? vals[i] : undefined;
    },
    set(cx: number, cz: number, value: V): void {
      const i = slotOf(cx, cz);
      if (used[i] === 0) {
        used[i] = 1;
        size++;
      }
      sx[i] = cx;
      sz[i] = cz;
      vals[i] = value;
    },
    delete(cx: number, cz: number): void {
      const i = slotOf(cx, cz);
      if (used[i] !== 0) removeAt(i);
    },
    forEach(cb: (cx: number, cz: number, value: V) => void): void {
      // the table MUST NOT be mutated inside cb — deletion reinserts the cluster
      for (let i = 0; i < cap; i++) {
        if (used[i] !== 0) cb(sx[i], sz[i], vals[i] as V);
      }
    },
    get size() {
      return size;
    },
  };
}

const TABLE_CAP = 4096; // ~5x the largest resident disc (~805 chunks at VIEW_RINGS 16)
const MAX_OUT = 2048; // pooled records, covers a full disc plus the largest possible diff

export function createChunkGrid(viewRings: number): ChunkGrid {
  const residents = createCoordTable<0 | 1 | 2>(TABLE_CAP);
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

  // hoisted classify callback + context so update() allocates nothing; deletes are deferred
  // until forEach finishes (see CoordTable.forEach)
  let scanPcx = 0;
  let scanPcz = 0;
  let scanR2 = 0;
  let scanToLoad: ChunkKey[] = [];
  let scanToFree: ChunkKey[] = [];

  function classifyResident(cx: number, cz: number, lod: 0 | 1 | 2): void {
    const dx = cx - scanPcx;
    const dz = cz - scanPcz;
    const d2 = dx * dx + dz * dz;
    const wantedLod = lodForRing(Math.max(Math.abs(dx), Math.abs(dz)));
    if (d2 > scanR2) {
      scanToFree.push(take(cx, cz, lod, d2));
    } else if (lod !== wantedLod) {
      // stale LOD: stays resident (and rendered) until the replacement is filled
      scanToLoad.push(take(cx, cz, wantedLod, d2));
    }
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

    // scan residents: out-of-disc goes to toFree; in-disc with a stale LOD goes to toLoad
    scanPcx = pcx;
    scanPcz = pcz;
    scanR2 = r2;
    scanToLoad = toLoad;
    scanToFree = toFree;
    residents.forEach(classifyResident);
    for (let i = 0; i < toFree.length; i++) {
      residents.delete(toFree[i].cx, toFree[i].cz);
    }

    // load pass: every wanted cell not resident
    for (let dx = -viewRings; dx <= viewRings; dx++) {
      for (let dz = -viewRings; dz <= viewRings; dz++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (residents.get(cx, cz) !== undefined) continue;
        toLoad.push(take(cx, cz, lodForRing(Math.max(Math.abs(dx), Math.abs(dz))), d2));
      }
    }

    toLoad.sort(byD2);
  }

  function markResident(key: ChunkKey): void {
    residents.set(key.cx, key.cz, key.lod);
  }

  return {
    update,
    markResident,
    get residentCount() {
      return residents.size;
    },
  };
}
