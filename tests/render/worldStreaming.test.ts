import { MeshBasicMaterial, Scene } from "three";
import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, VIEW_RINGS } from "../../src/constants";
import { createWorldRuntime } from "../../src/render/world";
import { createChunkGrid, type ChunkKey } from "../../src/sim/chunks";
import { themeById } from "../../src/sim/themes";

describe("terrain streaming", () => {
  it.each(["nature", "alien", "arctic"] as const)(
    "%s fills the complete view after water and ice LOD replacements",
    (theme) => {
      const material = new MeshBasicMaterial();
      const runtime = createWorldRuntime(new Scene(), material, {
        theme: themeById(theme),
        seed: 42,
      });
      const manifest: ChunkKey[] = [];
      const wanted: ChunkKey[] = [];

      try {
        for (const offset of [0, CHUNK_SIZE, -CHUNK_SIZE]) {
          const x = 3306 + offset;
          const z = 4783 + offset;
          for (let frame = 0; frame < 3; frame++) runtime.update(x, z, 1024);
          createChunkGrid(VIEW_RINGS).update(x, z, wanted, []);
          runtime.manifest(4096, manifest);
          expect(runtime.queuedCount(), "stationary terrain queue cannot drain").toBe(0);
          expect(manifest).toHaveLength(wanted.length);
          for (const { cx, cz, lod } of wanted) {
            expect(manifest).toContainEqual({ cx, cz, lod });
          }
        }
      } finally {
        runtime.dispose();
        material.dispose();
      }
    },
    30_000,
  );

  it("keeps nearby terrain resident during sustained diagonal flight", () => {
    const material = new MeshBasicMaterial();
    const runtime = createWorldRuntime(new Scene(), material, {
      theme: themeById("nature"),
      seed: 42,
    });
    const manifest: ChunkKey[] = [];
    const fps = 6;
    const vx = 60;
    const vz = 70;

    try {
      for (let frame = 0; frame < 400; frame++) runtime.update(0, 0, 2);

      for (let second = 0; second <= 60; second++) {
        for (let frame = 0; frame < fps; frame++) {
          const t = second + frame / fps;
          runtime.update(t * vx, t * vz, 2);
        }

        runtime.manifest(4096, manifest);
        const cx = Math.floor(((second + 1) * vx) / 256);
        const cz = Math.floor(((second + 1) * vz) / 256);
        const nearby = manifest.filter(
          (key) => Math.abs(key.cx - cx) <= 2 && Math.abs(key.cz - cz) <= 2,
        ).length;
        expect(nearby, `terrain disappeared around the Plane at ${second}s`).toBe(25);
      }
    } finally {
      runtime.dispose();
      material.dispose();
    }
  }, 30_000);
});
