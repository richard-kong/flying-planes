// Real-render smoke (T052, migrated to Playwright in 002 T002): renders actual WebGL2 frames
// in headless Chromium against the isolated verification build served by
// scripts/test-browser.ts. Fails on any shader compile, program link, or page error, and
// asserts the framebuffer carries a real image (varied pixels), not a blank canvas.
// playwright is a development-only harness dependency — core-mechanic tests stay in Node
// (constitution III).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchChromium } from "../../scripts/browser-harness";
import { AIRCRAFT, PLANE_FOOTPRINT } from "../../src/sim/aircraft";

const BASE = process.env.BROWSER_BASE_URL ?? "http://127.0.0.1:0";

let browser: Browser | null = null;
let page: Page;
const consoleErrors: string[] = [];
const pageErrors: string[] = [];

beforeAll(async () => {
  browser = await launchChromium();
  page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on("console", (msg) => {
    // favicon 404s are noise; a missing module would fail with a page error instead
    if (msg.type() === "error" && !msg.location()?.url?.endsWith("/favicon.ico")) {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));
});

afterAll(async () => {
  await browser?.close();
});

interface PixelStats {
  unique: number;
  topY: number[];
  bottomY: number[];
}

// read the canvas through a 2d context and report colour diversity
function samplePixels(): Promise<PixelStats | null> {
  return page.evaluate(() => {
    const src = document.getElementById("scene") as HTMLCanvasElement | null;
    if (!src || src.width === 0) return null;
    const probe = document.createElement("canvas");
    probe.width = src.width;
    probe.height = src.height;
    const ctx = probe.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0);
    const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 16) {
      seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    const w = probe.width;
    const h = probe.height;
    const px = (x: number, y: number) => {
      const o = (y * w + x) * 4;
      return [data[o], data[o + 1], data[o + 2]];
    };
    return { unique: seen.size, topY: px(Math.floor(w / 2), 4), bottomY: px(Math.floor(w / 2), h - 6) };
  });
}

interface WorldStats {
  residents: number;
  queued: number;
  surfaces: number;
  generation: number;
}

// 002 T034: every theme flies through the chooser and must render a live world with at
// least one clipped water/ice sheet drawn — not just a constructed scene.
const THEMES = [
  { id: "nature", label: "Nature" },
  { id: "alien", label: "Alien Planet" },
  { id: "arctic", label: "Arctic" },
] as const;

describe("webgl smoke", () => {
  for (const theme of THEMES) {
    it(
      `renders real WebGL2 frames for ${theme.label} — terrain, sky, plane, surface`,
      async () => {
        await page.goto(`${BASE}/?seed=42&renderTest`, { waitUntil: "load" });
        await page.waitForFunction(
          () =>
            document.body.dataset.readyChooser === "true" ||
            document.body.dataset.phase === "choosing",
          { timeout: 120_000 },
        );
        await page.click(`#chooser input[value="${theme.id}"]`);
        await page.click("#fly");
        await page.waitForFunction(() => document.body.dataset.phase === "flying", {
          timeout: 120_000,
        });

        // let the sim run so terrain streams in, the camera settles, and a clipped
        // water/ice sheet reaches residency (lakes may sit outside the prep cone —
        // the lazy streamer catches them within seconds of flight)
        let stats: PixelStats | null = null;
        let wstats: WorldStats | null = null;
        const readStats = () =>
          page.evaluate(
            () =>
              (globalThis as { __verifyStats?: () => WorldStats }).__verifyStats?.() ??
              null,
          );
        for (let i = 0; i < 120; i++) {
          await new Promise((r) => setTimeout(r, 250));
          stats = await samplePixels();
          wstats = await readStats();
          if (stats && stats.unique > 32 && wstats && wstats.surfaces > 0) break;
        }

        expect(pageErrors).toEqual([]);
        expect(
          consoleErrors.filter((e) => !e.includes("Automatic fallback to software WebGL")),
        ).toEqual([]);
        expect(stats).not.toBeNull();
        expect(stats!.unique).toBeGreaterThan(32);
        // the sky gradient must differ between the top and bottom of the frame
        expect(stats!.topY).not.toEqual(stats!.bottomY);
        // live world: resident terrain plus at least one drawn water/ice sheet
        expect(wstats).not.toBeNull();
        expect(wstats!.residents).toBeGreaterThan(0);
        expect(wstats!.surfaces).toBeGreaterThan(0);
      },
      120_000,
    );
  }
});

interface AircraftFrame {
  dominant: number;
  pixels: number;
  spinners: string[];
}

// 003 T007: mounts buildAircraft through the verification bundle's __verifyAircraftKit
// hook — every group plus the shared lighting rig renders one frame on a flat
// background, and the scaled world-bbox dominant axis (rotor disc included) must land
// on PLANE_FOOTPRINT.
describe("aircraft render smoke", () => {
  let smokePage: Page | null = null;
  const smokeErrors: string[] = [];

  beforeAll(async () => {
    smokePage = await browser!.newPage({ viewport: { width: 640, height: 360 } });
    smokePage.on("pageerror", (err) => smokeErrors.push(String(err)));
    await smokePage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await smokePage.waitForFunction(
      () =>
        (window as unknown as { __verifyAircraftKit?: unknown })
          .__verifyAircraftKit !== undefined,
      { timeout: 120_000 },
    );
  }, 300_000);

  afterAll(async () => {
    await smokePage?.close();
  });

  it(
    "renders every aircraft type at the shared PLANE_FOOTPRINT without page errors",
    async () => {
      const stats = await smokePage!.evaluate(async (ids) => {
        const kit = (
          window as unknown as { __verifyAircraftKit: () => unknown }
        ).__verifyAircraftKit() as {
          WebGLRenderer: typeof import("three").WebGLRenderer;
          Scene: typeof import("three").Scene;
          PerspectiveCamera: typeof import("three").PerspectiveCamera;
          Box3: typeof import("three").Box3;
          Vector3: typeof import("three").Vector3;
          Color: typeof import("three").Color;
          Sphere: typeof import("three").Sphere;
          buildAircraft: typeof import("../../src/render/aircraft").buildAircraft;
          disposeAircraft: typeof import("../../src/render/aircraft").disposeAircraft;
          createAircraftLights: typeof import("../../src/render/aircraft").createAircraftLights;
          applyThemeToLights: typeof import("../../src/render/aircraft").applyThemeToLights;
          aircraftById: typeof import("../../src/sim/aircraft").aircraftById;
          themeById: typeof import("../../src/sim/themes").themeById;
        };
        const W = 640;
        const H = 360;
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const renderer = new kit.WebGLRenderer({
          canvas,
          antialias: false,
          preserveDrawingBuffer: true,
        });
        renderer.setSize(W, H, false);
        renderer.setClearColor(0x101418, 1);
        const scene = new kit.Scene();
        const lights = kit.createAircraftLights();
        kit.applyThemeToLights(lights, kit.themeById("nature"));
        scene.add(lights.hemi, lights.sun);
        const camera = new kit.PerspectiveCamera(30, W / H, 0.1, 2000);
        const probe = document.createElement("canvas");
        probe.width = W;
        probe.height = H;
        const ctx = probe.getContext("2d")!;
        const bg = new kit.Color(0x101418);
        const bgRgb = [
          Math.round(bg.r * 255),
          Math.round(bg.g * 255),
          Math.round(bg.b * 255),
        ];
        const out: AircraftFrame[] = [];
        for (const id of ids) {
          const a = kit.buildAircraft(kit.aircraftById(id));
          scene.add(a.group);
          a.group.updateMatrixWorld(true);
          const box = new kit.Box3().setFromObject(a.group);
          const size = box.getSize(new kit.Vector3());
          const dominant = Math.max(size.x, size.z);
          const sphere = box.getBoundingSphere(new kit.Sphere());
          const dist =
            (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 0.92;
          camera.position
            .set(-0.6, 0.34, 0.72)
            .normalize()
            .multiplyScalar(dist)
            .add(new kit.Vector3(0, 0.1, 0.2));
          camera.lookAt(0, 0.1, 0.2);
          renderer.render(scene, camera);
          ctx.drawImage(canvas, 0, 0);
          const d = ctx.getImageData(0, 0, W, H).data;
          let pixels = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] !== bgRgb[0] || d[i + 1] !== bgRgb[1] || d[i + 2] !== bgRgb[2]) {
              pixels++;
            }
          }
          out.push({
            dominant,
            pixels,
            spinners: a.spinners.map((s) => String(s.userData.spinner)),
          });
          scene.remove(a.group);
          kit.disposeAircraft(a);
        }
        renderer.dispose();
        return out;
      }, AIRCRAFT.map((a) => a.id));

      expect(smokeErrors).toEqual([]);
      expect(stats).toHaveLength(AIRCRAFT.length);
      for (const [i, type] of AIRCRAFT.entries()) {
        const s = stats[i];
        // scaled world bbox dominant axis (x or z, rotor disc included) == PLANE_FOOTPRINT ±2%
        expect(
          Math.abs(s.dominant - PLANE_FOOTPRINT) / PLANE_FOOTPRINT,
          `${type.id} dominant axis ${s.dominant}`,
        ).toBeLessThanOrEqual(0.02);
        expect(s.pixels, `${type.id} drew no aircraft pixels`).toBeGreaterThan(0);
        expect(s.spinners).toEqual(type.spinners.map((sp) => sp.name));
      }
    },
    120_000,
  );
});
