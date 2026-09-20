import { describe, expect, it } from "vitest";
import { Mesh, Scene } from "three";
import { createTerrainMaterial } from "../../src/render/terrainMaterial";
import { createChunkPool, fillChunk } from "../../src/render/terrainMesh";
import { worldAlien } from "../sim/theme-test-helpers";
import { createSkyMesh } from "../../src/render/sky";
import { createPlaneMesh } from "../../src/render/plane";

// research R11: build the whole scene graph in Node, no WebGLRenderer.
describe("render smoke", () => {
  it("builds material, pooled chunks, sky and plane without throwing", () => {
    const scene = new Scene();
    const material = createTerrainMaterial();
    const pool = createChunkPool();
    for (const lod of [0, 1, 2] as const) {
      const geometry = pool.acquire(lod);
      fillChunk(geometry, { cx: 0, cz: 0, lod }, worldAlien(42));
      scene.add(new Mesh(geometry, material));
    }
    scene.add(createSkyMesh());
    scene.add(createPlaneMesh());
    scene.updateMatrixWorld(true);
    expect(material.vertexShader.length).toBeGreaterThan(0);
    expect(material.fragmentShader.length).toBeGreaterThan(0);
  });
});
