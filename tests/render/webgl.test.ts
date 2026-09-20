// Real-render smoke (T052): serves the app through Vite and renders actual WebGL2 frames in
// headless Chrome. Fails on any shader compile, program link, or page error, and asserts the
// framebuffer carries a real image (varied pixels), not a blank canvas. puppeteer is a
// development-only harness dependency — core-mechanic tests stay in Node (constitution III).
//
// Chrome resolution order: $CHROME_BIN, then the puppeteer-downloaded browser (CI).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { existsSync } from "node:fs";

let server: ViteDevServer;
let browser: Browser | null = null;
let page: Page;
let url = "";
let chromeMissing = false;
const consoleErrors: string[] = [];
const pageErrors: string[] = [];

const CHROME_ARGS = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

async function chromeExecutable(): Promise<string | undefined> {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  try {
    const p = await puppeteer.executablePath();
    return existsSync(p) ? p : undefined;
  } catch {
    return undefined;
  }
}

beforeAll(async () => {
  server = await createServer({ logLevel: "silent", server: { port: 0 } });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === "object" && address ? address.port : 5173;
  url = `http://localhost:${port}/?seed=42&renderTest`;

  const executablePath = await chromeExecutable();
  if (!executablePath) {
    chromeMissing = true;
    return;
  }
  browser = await puppeteer.launch({
    headless: true,
    args: CHROME_ARGS,
    executablePath,
  });
  page = await browser.newPage();
  await page.setViewport({ width: 960, height: 600 });
  page.on("console", (msg) => {
    // favicon 404s are noise; a missing module would fail with a page error instead
    if (msg.type() === "error" && !msg.location()?.url?.endsWith("/favicon.ico")) {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

interface PixelStats {
  unique: number;
  topY: number[];
  bottomY: number[];
  waterY: number | null;
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
    let top: number[] | null = null;
    let bottom: number[] | null = null;
    for (let i = 0; i < data.length; i += 16) {
      seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    const w = probe.width;
    const h = probe.height;
    const px = (x: number, y: number) => {
      const o = (y * w + x) * 4;
      return [data[o], data[o + 1], data[o + 2]];
    };
    top = px(Math.floor(w / 2), 4);
    bottom = px(Math.floor(w / 2), h - 6);
    return { unique: seen.size, topY: top, bottomY: bottom, waterY: null };
  });
}

// Chrome must exist to run this test: $CHROME_BIN or the puppeteer-downloaded browser
// (CI installs it via `npx puppeteer browsers install chrome`). Without either, skip
// locally — but never in CI, where a missing browser must fail the run.
describe("webgl smoke", () => {
  it(
    "renders real WebGL2 frames with terrain, sky, and the plane — no shader errors",
    async (ctx) => {
      if (chromeMissing) {
        expect(
          process.env.CI,
          "no Chrome executable: set CHROME_BIN or run `npx puppeteer browsers install chrome`",
        ).toBeFalsy();
        return ctx.skip();
      }
      await page.goto(url, { waitUntil: "load" });

      // let the sim run a few seconds so terrain streams in and the camera settles
      let stats: PixelStats | null = null;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 250));
        stats = await samplePixels();
        if (stats && stats.unique > 32) break;
      }

      expect(pageErrors).toEqual([]);
      expect(
        consoleErrors.filter(
          (e) => !e.includes("Automatic fallback to software WebGL"),
        ),
      ).toEqual([]);
      expect(stats).not.toBeNull();
      expect(stats!.unique).toBeGreaterThan(32);
      // the sky gradient must differ between the top and bottom of the frame
      expect(stats!.topY).not.toEqual(stats!.bottomY);
    },
    60_000,
  );
});
