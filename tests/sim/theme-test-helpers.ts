// Indirection over the terrain/biome entry points so signature changes touch one file.
// WorldContext upgrade (T012): helpers build a real { theme, seed } context now.
import { Vector3 } from "three";
import * as terrain from "../../src/sim/terrain";
import * as biome from "../../src/sim/biome";
import { themeById, type ThemeId, type WorldContext } from "../../src/sim/themes";

export type WorldLike = WorldContext;

export function worldAlien(seed: number): WorldLike {
  return { theme: themeById("alien"), seed };
}

export function worldOf(id: ThemeId, seed: number): WorldLike {
  return { theme: themeById(id), seed };
}

export function heightAt(x: number, z: number, world: WorldLike): number {
  return terrain.heightAt(x, z, world);
}

export function surfaceHeightAt(x: number, z: number, world: WorldLike): number {
  return terrain.surfaceHeightAt(x, z, world);
}

export function normalAt(x: number, z: number, world: WorldLike, out: Vector3): Vector3 {
  return terrain.normalAt(x, z, world, out);
}

export function bandWeight(x: number, seed: number): number {
  return biome.bandWeight(x, seed);
}
