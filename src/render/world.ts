// World residency and ownership (002 T015/T017): the single ChunkGrid, geometry pools
// (terrain + clipped surface), mesh freelists, the per-frame streaming driver, bounded
// teardown, and the deadline-sliced PreparationJob. Pool and mesh misses defer work to a
// later frame — nothing allocates or grows mid-flight once pools are warm.
//
// Preparation ownership: a job's fills land in a private candidate table tracked by
// generation; commit merges them into the live residency atomically with the world swap,
// cancel releases them back to the pools so the buffers are acknowledged-reusable before
// another generation starts. The shared ChunkGrid never learns about uncommitted chunks.
import { BufferGeometry, Material, Mesh, Scene } from "three";
import { CHUNK_SIZE, VIEW_RINGS } from "../constants";
import type { AircraftTypeId } from "../sim/aircraft";
import { createChunkGrid, createCoordTable, lodForRing, type ChunkKey } from "../sim/chunks";
import { themeById, type ThemeId, type WorldContext } from "../sim/themes";
import {
  beginChunkFill,
  createChunkPools,
  stepChunkFill,
  type ChunkFill,
} from "./terrainMesh";

interface ResidentMesh {
  terrain: Mesh;
  surface: Mesh | null;
}

// --- PreparationJob (data-model): one live generation, deadline-sliced fills, readiness =
// priority coverage; the caller ORs in shader/sky/surface/pose staging before commit.
export type PreparationKind = "startup" | "launch" | "restore";
export type PreparationPhase = "terrain" | "previews" | "commit";

export interface PreparationJob {
  readonly generation: number;
  readonly themeId: ThemeId;
  /** Committed Aircraft Type for this launch/restore — swaps the visible mesh at commit. */
  readonly aircraftType: AircraftTypeId;
  readonly seed: number;
  readonly kind: PreparationKind;
  phase: PreparationPhase;
  deadline: number; // per-slice ms budget
  readiness: number; // 0..1
  cancelled: boolean;
}

// Priority coverage: a margin disc around the anchor plus a forward cone through the fog
// envelope — wide enough that the first committed frame shows continuous world in view.
const PREP_MARGIN_RINGS = 3;
const PREP_CONE_HALF_WIDTH = 3;

export interface WorldRuntime {
  /** The world currently streamed and drawn. */
  world: WorldContext;
  /** Stream the resident disc around (px, pz); fills at most budget chunks per call. */
  update(px: number, pz: number, budget: number): void;
  /** Release every resident mesh/geometry back to the pools and clear the grid. */
  reset(): void;
  /** Detach and dispose every owned mesh and pooled geometry. */
  dispose(): void;
  residentCount(): number;
  queuedCount(): number;
  /** Resident chunks currently showing a clipped water/ice sheet (verification probe). */
  surfaceCount(): number;
  /** Bounded copy of the resident keys (snapshot manifest; cap at `cap`). */
  manifest(cap: number, out: ChunkKey[]): ChunkKey[];
  readonly liveGeneration: number;
  /** Start a deadline-sliced preparation for a world switch at the anchor. When
   * `restoreKeys` is given it replaces the priority coverage set — rebuilt Cancels
   * restore exactly the chunks the snapshot recorded. */
  beginPreparation(
    job: PreparationJob,
    anchorX: number,
    anchorZ: number,
    heading: number,
    restoreKeys?: readonly ChunkKey[],
  ): boolean;
  /** Continue the live job inside its deadline. Returns job.readiness. */
  stepPreparation(job: PreparationJob): number;
  /** Commit the prepared world if the job is still the live generation. */
  commitPreparation(job: PreparationJob): boolean;
  /** Cancel the live job; its candidate buffers return to the pools. */
  cancelPreparation(job: PreparationJob): void;
}

// The priority key set: margin disc + forward cone (Chebyshev-limited to the view disc).
function collectPriorityKeys(
  cx: number,
  cz: number,
  heading: number,
  out: ChunkKey[],
): number {
  out.length = 0;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const seen = new Set<number>();
  let n = 0;
  const push = (px: number, pz: number) => {
    const dx = px - cx;
    const dz = pz - cz;
    if (dx * dx + dz * dz > VIEW_RINGS * VIEW_RINGS) return;
    const id = px * 4096 + pz;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ cx: px, cz: pz, lod: lodForRing(Math.max(Math.abs(dx), Math.abs(dz))) });
    n++;
  };
  for (let dx = -PREP_MARGIN_RINGS; dx <= PREP_MARGIN_RINGS; dx++) {
    for (let dz = -PREP_MARGIN_RINGS; dz <= PREP_MARGIN_RINGS; dz++) {
      if (dx * dx + dz * dz <= PREP_MARGIN_RINGS * PREP_MARGIN_RINGS) push(cx + dx, cz + dz);
    }
  }
  for (let r = 0; r <= VIEW_RINGS; r++) {
    const halfW = Math.min(PREP_CONE_HALF_WIDTH + r * 0.4, 7);
    const bx = cx + fx * r;
    const bz = cz + fz * r;
    for (let w = -Math.ceil(halfW); w <= Math.ceil(halfW); w++) {
      push(Math.round(bx + fz * w), Math.round(bz - fx * w));
    }
  }
  return n;
}

export function createWorldRuntime(
  scene: Scene,
  material: Material,
  initialWorld: WorldContext,
): WorldRuntime {
  const grid = createChunkGrid(VIEW_RINGS);
  const pools = createChunkPools();
  const residents = createCoordTable<ResidentMesh>();

  // --- freelists, bounded ---
  const MAX_RESIDENT_MESHES = 832; // full 16-ring disc plus in-flight fills
  const freeTerrain: Mesh[] = [];
  const freeSurface: Mesh[] = [];
  let terrainMade = 0;
  let surfaceMade = 0;
  const allMeshes: Mesh[] = [];

  function newMesh(): Mesh {
    const m = new Mesh();
    m.material = material;
    m.frustumCulled = true;
    allMeshes.push(m);
    return m;
  }

  function acquireTerrainMesh(): Mesh | undefined {
    const m = freeTerrain.pop();
    if (m) return m;
    if (terrainMade >= MAX_RESIDENT_MESHES) return undefined;
    terrainMade++;
    return newMesh();
  }
  function acquireSurfaceMesh(): Mesh | undefined {
    const m = freeSurface.pop();
    if (m) return m;
    if (surfaceMade >= MAX_RESIDENT_MESHES) return undefined;
    surfaceMade++;
    return newMesh();
  }

  const toLoad: ChunkKey[] = [];
  const toFree: ChunkKey[] = [];

  // --- live residency ---
  function releaseResident(cx: number, cz: number): void {
    const r = residents.get(cx, cz);
    if (!r) return;
    residents.delete(cx, cz);
    scene.remove(r.terrain);
    pools.terrain.release(r.terrain.geometry as BufferGeometry);
    freeTerrain.push(r.terrain);
    if (r.surface) {
      scene.remove(r.surface);
      pools.surface.release(r.surface.geometry as BufferGeometry);
      freeSurface.push(r.surface);
    }
  }

  // Fill one chunk end-to-end and attach it under `into` (the live table or a job's
  // candidate table). Returns false when a pool is exhausted — the caller retries later;
  // every acquired resource is returned before exiting on failure.
  function fillInto(
    key: ChunkKey,
    world: WorldContext,
    into: ReturnType<typeof createCoordTable<ResidentMesh>>,
  ): boolean {
    const existing = into.get(key.cx, key.cz);
    const terrainGeo = pools.terrain.acquire(key.lod);
    if (!terrainGeo) return false;
    const fill: ChunkFill = beginChunkFill(terrainGeo, key, world);
    // the only state that blocks a huge-budget step is a missing surface geometry
    while (!fill.done) {
      if (fill.surfaceCounts > 0 && !fill.surface) {
        const surfGeo = pools.surface.acquire(key.lod);
        if (!surfGeo) {
          pools.terrain.release(terrainGeo);
          return false;
        }
        fill.surface = surfGeo;
      } else {
        stepChunkFill(fill, 1 << 20);
      }
    }
    let surfaceMesh: Mesh | null = existing?.surface ?? null;
    if (fill.surface) {
      if (!surfaceMesh) {
        surfaceMesh = acquireSurfaceMesh() ?? null;
        if (!surfaceMesh) {
          pools.surface.release(fill.surface);
          pools.terrain.release(terrainGeo);
          return false;
        }
        surfaceMesh.geometry = fill.surface;
        surfaceMesh.position.set(key.cx * CHUNK_SIZE, 0, key.cz * CHUNK_SIZE);
        scene.add(surfaceMesh);
      } else {
        pools.surface.release(surfaceMesh.geometry as BufferGeometry);
        surfaceMesh.geometry = fill.surface;
      }
    } else if (surfaceMesh) {
      scene.remove(surfaceMesh);
      pools.surface.release(surfaceMesh.geometry as BufferGeometry);
      freeSurface.push(surfaceMesh);
      surfaceMesh = null;
    }
    if (existing) {
      pools.terrain.release(existing.terrain.geometry as BufferGeometry);
      existing.terrain.geometry = terrainGeo;
      into.set(key.cx, key.cz, { terrain: existing.terrain, surface: surfaceMesh });
    } else {
      const mesh = acquireTerrainMesh();
      if (!mesh) {
        if (surfaceMesh) {
          scene.remove(surfaceMesh);
          pools.surface.release(surfaceMesh.geometry as BufferGeometry);
          freeSurface.push(surfaceMesh);
        } else if (fill.surface) {
          pools.surface.release(fill.surface);
        }
        pools.terrain.release(terrainGeo);
        return false;
      }
      mesh.geometry = terrainGeo;
      mesh.position.set(key.cx * CHUNK_SIZE, 0, key.cz * CHUNK_SIZE);
      scene.add(mesh);
      into.set(key.cx, key.cz, { terrain: mesh, surface: surfaceMesh });
    }
    return true;
  }

  // --- preparation state ---
  let liveJob: PreparationJob | null = null;
  const candidates = createCoordTable<ResidentMesh>();
  const candidateKeys: ChunkKey[] = [];
  let prepCursor = 0;
  let prepTotal = 0;

  const runtime: WorldRuntime = {
    world: initialWorld,

    get liveGeneration() {
      return liveJob ? liveJob.generation : 0;
    },

    update(px: number, pz: number, budget: number): void {
      const world = runtime.world;
      grid.update(px, pz, toLoad, toFree);
      for (let i = 0; i < toFree.length; i++) {
        releaseResident(toFree[i].cx, toFree[i].cz);
      }
      let filled = 0;
      for (let i = 0; i < toLoad.length && filled < budget; i++) {
        // pool exhaustion skips a chunk rather than stalling the queue: it stays wanted,
        // is re-emitted by the next grid.update, and fills once a geometry frees
        if (!fillInto(toLoad[i], world, residents)) continue;
        grid.markResident(toLoad[i]);
        filled++;
      }
    },

    reset(): void {
      const stale: ChunkKey[] = [];
      residents.forEach((cx, cz) => {
        stale.push({ cx, cz, lod: 0 });
      });
      for (const k of stale) releaseResident(k.cx, k.cz);
      grid.reset();
    },

    dispose(): void {
      if (liveJob) runtime.cancelPreparation(liveJob);
      runtime.reset();
      for (const g of pools.made) g.dispose();
      for (const m of allMeshes) scene.remove(m);
      freeTerrain.length = 0;
      freeSurface.length = 0;
    },

    residentCount: () => grid.residentCount,
    queuedCount: () => toLoad.length,
    surfaceCount: () => {
      let n = 0;
      residents.forEach((cx, cz, r) => {
        if (r.surface) n++;
      });
      return n;
    },

    manifest(cap, out): ChunkKey[] {
      out.length = 0;
      residents.forEach((cx, cz, r) => {
        if (out.length < cap) out.push({ cx, cz, lod: r.terrain.geometry.userData.lod as ChunkKey["lod"] });
      });
      return out;
    },

    beginPreparation(job, anchorX, anchorZ, heading, restoreKeys): boolean {
      if (liveJob) return false; // exactly one live generation
      liveJob = job;
      job.phase = "terrain";
      job.readiness = 0;
      if (restoreKeys) {
        candidateKeys.length = 0;
        for (const k of restoreKeys) candidateKeys.push({ cx: k.cx, cz: k.cz, lod: k.lod });
      } else {
        const cx = Math.floor(anchorX / CHUNK_SIZE);
        const cz = Math.floor(anchorZ / CHUNK_SIZE);
        collectPriorityKeys(cx, cz, heading, candidateKeys);
      }
      prepCursor = 0;
      prepTotal = candidateKeys.length;
      return true;
    },

    stepPreparation(job): number {
      if (!liveJob || job.generation !== liveJob.generation || job.cancelled) return 0;
      const world = worldOfJob(job);
      const t0 = performance.now();
      const budget = job.deadline > 0 ? job.deadline : 8;
      while (prepCursor < prepTotal) {
        const key = candidateKeys[prepCursor];
        if (candidates.get(key.cx, key.cz)) {
          prepCursor++;
          continue;
        }
        if (!fillInto(key, world, candidates)) {
          // restores must not advance past a miss: the manifest is the contract, so a
          // pool-exhausted key stays pending and is retried on the next slice (residents
          // are reset before restore, so capacity is proven). Launch misses are skipped —
          // the cell streams in after commit and readiness still reaches 1.
          if (job.kind === "restore") break;
          prepCursor++;
          continue;
        }
        prepCursor++;
        if (performance.now() - t0 >= budget) break;
      }
      job.readiness = prepTotal === 0 ? 1 : prepCursor / prepTotal;
      return job.readiness;
    },

    commitPreparation(job): boolean {
      if (!liveJob || job.generation !== liveJob.generation || job.cancelled) return false;
      runtime.world = worldOfJob(job);
      for (let i = 0; i < prepCursor; i++) {
        const k = candidateKeys[i];
        const m = candidates.get(k.cx, k.cz);
        if (!m) continue;
        candidates.delete(k.cx, k.cz);
        residents.set(k.cx, k.cz, m);
        grid.markResident({ cx: k.cx, cz: k.cz, lod: k.lod });
      }
      candidateKeys.length = 0;
      prepCursor = 0;
      prepTotal = 0;
      liveJob = null;
      return true;
    },

    cancelPreparation(job): void {
      if (!liveJob || job.generation !== liveJob.generation) return;
      job.cancelled = true;
      for (let i = 0; i < prepCursor; i++) {
        const k = candidateKeys[i];
        const m = candidates.get(k.cx, k.cz);
        if (!m) continue;
        candidates.delete(k.cx, k.cz);
        scene.remove(m.terrain);
        pools.terrain.release(m.terrain.geometry as BufferGeometry);
        freeTerrain.push(m.terrain);
        if (m.surface) {
          scene.remove(m.surface);
          pools.surface.release(m.surface.geometry as BufferGeometry);
          freeSurface.push(m.surface);
        }
      }
      candidateKeys.length = 0;
      prepCursor = 0;
      prepTotal = 0;
      liveJob = null;
    },
  };

  function worldOfJob(job: PreparationJob): WorldContext {
    return { theme: themeById(job.themeId), seed: job.seed };
  }

  return runtime;
}
