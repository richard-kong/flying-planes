// Real-render smoke (T052, migrated to Playwright in 002 T002): renders actual WebGL2 frames
// in headless Chromium against the isolated verification build served by
// scripts/test-browser.ts. Fails on any shader compile, program link, or page error, and
// asserts the framebuffer carries a real image (varied pixels), not a blank canvas.
// playwright is a development-only harness dependency — core-mechanic tests stay in Node
// (constitution III).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchChromium } from "../../scripts/browser-harness";

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
