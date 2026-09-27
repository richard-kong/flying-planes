// Soak-class switching scenarios (T043/T050): the six-Fly Euler trail over every ordered
// theme pair and a real 60 s hidden pause. Minutes of wall time under software GL, so the
// PR gate skips *.soak.browser.test.ts; main pushes and the nightly run them.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchChromium } from "../../scripts/browser-harness";
import type { ThemeId } from "../../src/sim/themes";
import {
  cancelDirect,
  collectPageErrors,
  flyTheme,
  gotoAndWaitChooser,
  openChooserFromFlight,
  probeState,
} from "./browser-helpers";

let browser: Browser | null = null;

beforeAll(async () => {
  browser = await launchChromium();
});

afterAll(async () => {
  await browser?.close();
});

async function newPage(): Promise<Page> {
  return browser!.newPage({ viewport: { width: 800, height: 450 } });
}

describe("theme switching soak (US3)", () => {
  it("six directed switches cover every theme pair in both directions", async () => {
    const page = await newPage();
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      await flyTheme(page, "nature");
      // an Euler trail over the 3-theme digraph: every ordered pair exactly once
      const pairs: [ThemeId, ThemeId][] = [
        ["nature", "alien"], ["alien", "arctic"], ["arctic", "nature"],
        ["nature", "arctic"], ["arctic", "alien"], ["alien", "nature"],
      ];
      let active: ThemeId = "nature";
      for (const [from, to] of pairs) {
        expect(active).toBe(from);
        await openChooserFromFlight(page);
        // six directed Flys — every pair both ways
        await flyTheme(page, to);
        const st = await probeState(page);
        expect(st.phase).toBe("flying");
        active = to;
      }
      const stats = (await page.evaluate(() => (globalThis as any).__verifyStats())) as {
        residents: number; queued: number; geo: number; tex: number; progs: number;
      };
      expect(stats.residents).toBeGreaterThan(0);
      expect(stats.residents).toBeLessThanOrEqual(1024); // residency stays pool-bounded
      expect(stats.progs).toBeGreaterThan(0);
      expect(errs.pageErrors).toEqual([]);
      expect(errs.consoleErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 300_000);

  it("a 60-second hidden pause resumes without elapsed-time replay", async () => {
    const page = await newPage();
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      await flyTheme(page, "nature");
      await page.waitForTimeout(800);
      await openChooserFromFlight(page);
      const a = await probeState(page);
      // hide the tab for a full minute inside the pause
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { get: () => true, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(60_000);
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await cancelDirect(page);
      const c = await probeState(page);
      // menu time never entered the simulation — the resume continues the snapshot clock
      expect(c.simTime).toBeGreaterThanOrEqual(a.simTime);
      expect(c.simTime).toBeLessThan(a.simTime + 3);
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 180_000);
});
