// Shared page-driving helpers for the *.browser.test.ts suites (002). Only imported by
// browser tests — vitest.browser.config.ts picks up tests by filename, so helpers here are
// never collected as tests themselves.
import type { Page } from "playwright";

export const BASE = process.env.BROWSER_BASE_URL ?? "http://127.0.0.1:0";

export function collectPageErrors(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.location()?.url?.endsWith("/favicon.ico")) {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  return { consoleErrors, pageErrors };
}

export async function gotoAndWaitChooser(page: Page, query = ""): Promise<void> {
  await page.goto(`${BASE}/${query}`, { waitUntil: "load" });
  // bootReady sets readyChooser once previews settle (decoded or degraded)
  await page.waitForFunction(
    () =>
      document.body.dataset.readyChooser === "true" ||
      document.body.dataset.phase === "choosing",
    undefined,
    { timeout: 120_000 },
  );
}

export async function flyTheme(page: Page, themeId: "nature" | "alien" | "arctic"): Promise<void> {
  await page.click(`#chooser input[value="${themeId}"]`);
  await page.click("#fly");
  await page.waitForFunction(() => document.body.dataset.phase === "flying", undefined, {
    timeout: 120_000,
  });
}

export async function flyDefault(page: Page): Promise<void> {
  await page.click("#fly");
  await page.waitForFunction(() => document.body.dataset.phase === "flying", undefined, {
    timeout: 120_000,
  });
}

// Sample the render canvas through a 2D context and report colour diversity.
export function sampleCanvas(page: Page): Promise<{
  unique: number;
  topY: number[];
  bottomY: number[];
} | null> {
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
    return {
      unique: seen.size,
      topY: px(Math.floor(w / 2), 4),
      bottomY: px(Math.floor(w / 2), h - 6),
    };
  });
}
