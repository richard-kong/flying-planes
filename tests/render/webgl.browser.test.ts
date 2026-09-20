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

describe("webgl smoke", () => {
  it(
    "renders real WebGL2 frames with terrain, sky, and the plane — no shader errors",
    async () => {
      await page.goto(`${BASE}/?seed=42&renderTest`, { waitUntil: "load" });
      // 002: the chooser opens first — select Alien (the original world) and launch it
      await page.waitForFunction(
        () =>
          document.body.dataset.readyChooser === "true" ||
          document.body.dataset.phase === "choosing",
        { timeout: 120_000 },
      );
      await page.click('#chooser input[value="alien"]');
      await page.click("#fly");
      await page.waitForFunction(() => document.body.dataset.phase === "flying", {
        timeout: 120_000,
      });

      // let the sim run a few seconds so terrain streams in and the camera settles
      let stats: PixelStats | null = null;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 250));
        stats = await samplePixels();
        if (stats && stats.unique > 32) break;
      }

      expect(pageErrors).toEqual([]);
      expect(
        consoleErrors.filter((e) => !e.includes("Automatic fallback to software WebGL")),
      ).toEqual([]);
      expect(stats).not.toBeNull();
      expect(stats!.unique).toBeGreaterThan(32);
      // the sky gradient must differ between the top and bottom of the frame
      expect(stats!.topY).not.toEqual(stats!.bottomY);
    },
    60_000,
  );
});
