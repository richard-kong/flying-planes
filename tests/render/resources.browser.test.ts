// T054 [US3]: repeated switches must not leak pools, drawables, or preview cards, and the
// page must never show a second chooser or renderer. Fifty completed switches — including
// intervening cancel and retry cycles — keep residency bounded and resource counts flat.
// Software GL makes this slow; the counter set is verified, not the wall time.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchChromium } from "../../scripts/browser-harness";
import { collectPageErrors, gotoAndWaitChooser } from "./browser-helpers";

const SWITCHES = Number(process.env.THEME_SWITCHES ?? 50);

let browser: Browser | null = null;
let page: Page;

async function stats() {
  return (await page.evaluate(() => (globalThis as any).__verifyStats())) as {
    residents: number;
    queued: number;
    surfaces: number;
    generation: number;
    geo: number;
    tex: number;
    progs: number;
  };
}

async function previewUrls(): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>("#chooser img[data-theme-img]"))
      .map((i) => i.src)
      .filter((s) => s.startsWith("blob:")),
  );
}

async function switchOnce(to: "nature" | "alien" | "arctic"): Promise<void> {
  await page.click("#change-theme");
  await page.waitForFunction(() => document.body.dataset.phase === "choosing");
  await page.click(`#chooser input[value="${to}"]`);
  await page.click("#fly");
  await page.waitForFunction(() => document.body.dataset.phase === "flying", undefined, {
    timeout: 120_000,
  });
}

beforeAll(async () => {
  browser = await launchChromium();
  page = await browser.newPage({ viewport: { width: 640, height: 400 } });
});

afterAll(async () => {
  await page?.close();
  await browser?.close();
});

describe("resource stability across switches (T054)", () => {
  it("50 completed switches keep pools bounded, previews cached, and errors at zero", async () => {
    const errs = collectPageErrors(page);
    await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
    await page.click("#fly");
    await page.waitForFunction(() => document.body.dataset.phase === "flying", undefined, {
      timeout: 120_000,
    });
    const urls0 = await previewUrls();
    expect(urls0.length).toBe(3); // three cached card images, never regenerated
    // warm every theme's lazy surface/terrain pools before counting — pools size once
    // to their high-water mark and then stay flat
    for (const id of ["alien", "arctic", "nature"] as const) {
      await page.click("#change-theme");
      await page.waitForFunction(() => document.body.dataset.phase === "choosing");
      await page.click(`#chooser input[value="${id}"]`);
      await page.click("#fly");
      await page.waitForFunction(() => document.body.dataset.phase === "flying", undefined, {
        timeout: 120_000,
      });
    }
    const stats0 = await stats();
    const geo0 = stats0.geo;

    const order = ["alien", "arctic", "nature"] as const;
    for (let i = 0; i < SWITCHES; i++) {
      await switchOnce(order[i % 3]);
      if (i === 9) {
        // intervening cancel: pause + resume between switches
        await page.click("#change-theme");
        await page.waitForFunction(() => document.body.dataset.phase === "choosing");
        await page.click("#cancel");
        await page.waitForFunction(() => document.body.dataset.phase === "flying", undefined, {
          timeout: 30_000,
        });
      }
      if (i === 19) {
        // intervening failed launch + retry cycle
        await page.click("#change-theme");
        await page.waitForFunction(() => document.body.dataset.phase === "choosing");
        await page.evaluate(() => {
          (globalThis as any).__verifyLaunch = () => "fail";
        });
        await page.click(`#chooser input[value="${order[(i + 1) % 3]}"]`);
        await page.click("#fly");
        await page.waitForFunction(
          () =>
            !document.getElementById("chooser-error")!.hidden &&
            document.body.dataset.phase === "choosing",
        );
        await page.evaluate(() => {
          (globalThis as any).__verifyLaunch = undefined;
        });
        await page.click("#fly");
        await page.waitForFunction(() => document.body.dataset.phase === "flying", undefined, {
          timeout: 120_000,
        });
      }
    }

    const urlsN = await previewUrls();
    expect(urlsN).toEqual(urls0); // the same three blob URLs — no regeneration
    const statsN = await stats();
    expect(statsN.progs).toBe(stats0.progs);
    expect(statsN.tex).toBe(stats0.tex);
    // pooled geometry: resident chunks churn in and out but the driver-visible set is
    // bounded by the fixed pools — drift must be tiny across 50 cycles
    expect(Math.abs(statsN.geo - geo0)).toBeLessThanOrEqual(20);
    expect(statsN.residents).toBeLessThanOrEqual(1024);
    expect(await page.evaluate(() => document.body.dataset.phase)).toBe("flying");
    expect(errs.pageErrors).toEqual([]);
    expect(errs.consoleErrors).toEqual([]);
  }, 1_200_000);
});
