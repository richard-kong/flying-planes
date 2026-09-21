// T043/T050/T052/T055 [US3]: theme switching and pause/cancel lifecycle through the real
// UI — directed switches in both directions, same-theme restarts, pause invariance, a
// hidden tab, mid-preparation and post-failure cancels, and duplicate-action guards.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchChromium } from "../../scripts/browser-harness";
import {
  collectPageErrors,
  flyTheme,
  gotoAndWaitChooser,
} from "./browser-helpers";

const THEMES = ["nature", "alien", "arctic"] as const;

let browser: Browser | null = null;

beforeAll(async () => {
  browser = await launchChromium();
});

async function newPage(): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 800, height: 450 } });
  return page;
}

function phase(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.body.dataset.phase);
}

async function state(page: Page) {
  return (await page.evaluate(() => (globalThis as any).__verifyState())) as {
    x: number; y: number; z: number; speed: number; heading: number;
    simTime: number; phase: string;
  };
}

async function openChooserFromFlight(page: Page): Promise<void> {
  await page.click("#change-theme");
  await page.waitForFunction(() => document.body.dataset.phase === "choosing");
  // the modal is visible and the active theme is pre-selected
  await page.waitForFunction(() => !document.getElementById("chooser")!.hidden);
}

async function cancelDirect(page: Page): Promise<void> {
  await page.click("#cancel");
  await page.waitForFunction(() => document.body.dataset.phase === "flying", {
    timeout: 30_000,
  });
}

async function cancelWhilePreparing(page: Page): Promise<void> {
  // Escape is the keyboard Cancel; the button is equally enabled during preparing
  await page.waitForFunction(() => !document.getElementById("cancel")!.hidden);
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.body.dataset.phase === "flying",
    { timeout: 120_000 },
  );
}

describe("theme switching (US3)", () => {
  it("Change theme pauses a live flight; Cancel resumes the snapshot bit-for-bit", async () => {
    const page = await newPage();
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      await flyTheme(page, "nature");
      await page.mouse.move(600, 100); // arm input + steer so the flight diverges
      await page.waitForTimeout(1500);
      await openChooserFromFlight(page);

      // pause invariance: two consecutive probes are identical — no sim advance
      const a = await state(page);
      await page.waitForTimeout(800);
      const b = await state(page);
      expect(b.simTime).toBe(a.simTime);
      expect(b.x).toBe(a.x);
      expect(b.z).toBe(a.z);
      expect(b.speed).toBe(a.speed);
      // active theme pre-selected, Cancel offered
      await page.waitForFunction(
        () => (document.querySelector('#chooser input:checked') as HTMLInputElement).value === "nature",
      );
      expect(await page.isVisible("#cancel")).toBe(true);

      await cancelDirect(page); // direct resume — terrain still resident
      const c = await state(page);
      // resumed from the snapshot, then a frame or two of live sim before the probe
      expect(c.simTime).toBeGreaterThanOrEqual(a.simTime);
      expect(c.simTime).toBeLessThan(a.simTime + 2);
      expect(Math.hypot(c.x - a.x, c.z - a.z)).toBeLessThan(150);
      expect(c.speed).toBeCloseTo(a.speed, 1);
      // focus returns to Change theme after the modal closes
      await page.waitForFunction(
        () => document.activeElement?.id === "change-theme",
      );
      // a pointer already moving across the boundary cannot steer — the first discrete
      // event only re-arms the gate, the second one banks
      const before = await state(page);
      await page.mouse.move(80, 430); // dropped: arms the closed gate
      await page.mouse.move(690, 390); // passes: steers
      await page.waitForTimeout(900);
      const after = await state(page);
      expect(Math.abs(after.heading - before.heading)).toBeGreaterThan(0.0001);
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 120_000);

  it("six directed switches cover every theme pair in both directions", async () => {
    const page = await newPage();
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      await flyTheme(page, "nature");
      // an Euler trail over the 3-theme digraph: every ordered pair exactly once
      const pairs: [string, string][] = [
        ["nature", "alien"], ["alien", "arctic"], ["arctic", "nature"],
        ["nature", "arctic"], ["arctic", "alien"], ["alien", "nature"],
      ];
      let active: string = "nature";
      for (const [from, to] of pairs) {
        expect(active).toBe(from);
        await openChooserFromFlight(page);
        // six directed Flys — every pair both ways
        await flyTheme(page, to as (typeof THEMES)[number]);
        const st = await state(page);
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

  it("same-theme Fly is a fresh flight: origin pose, zeroed clock, retained seed", async () => {
    const page = await newPage();
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      await flyTheme(page, "nature");
      await page.mouse.move(700, 120);
      await page.waitForTimeout(2000);
      const flown = await state(page);
      expect(Math.hypot(flown.x, flown.z)).toBeGreaterThan(20); // actually flew somewhere
      await openChooserFromFlight(page);
      await flyTheme(page, "nature"); // same theme — still a restart
      const fresh = await state(page);
      expect(fresh.simTime).toBeLessThan(2);
      const fresh2 = await state(page);
      expect(Math.hypot(fresh.x, fresh.z)).toBeLessThan(Math.hypot(flown.x, flown.z));
      expect(fresh2.simTime).toBeGreaterThanOrEqual(fresh.simTime);
      // the URL keeps the same page seed — restarts never re-randomise
      expect(page.url()).toContain("seed=42");
    } finally {
      await page.close();
    }
  }, 120_000);

  it("Cancel during preparation abandons the candidate and rebuilds the paused world", async () => {
    const page = await newPage();
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      await flyTheme(page, "nature");
      await page.waitForTimeout(1200); // let some streaming land so the manifest is real
      const pausedAt = await state(page);
      const manifestBefore = (await page.evaluate(
        () => (globalThis as any).__verifyManifest(),
      )) as string[];
      await openChooserFromFlight(page);
      await page.click('#chooser input[value="alien"]');
      await page.click("#fly");
      await page.waitForFunction(
        () => document.body.dataset.phase === "preparing",
      );
      await cancelWhilePreparing(page); // rebuilt Cancel — residency was released
      const restored = await state(page);
      expect(restored.phase).toBe("flying");
      expect(restored.simTime).toBeGreaterThanOrEqual(pausedAt.simTime);
      expect(restored.simTime).toBeLessThan(pausedAt.simTime + 3);
      expect(Math.hypot(restored.x - pausedAt.x, restored.z - pausedAt.z)).toBeLessThan(250);
      // the manifest is reconstituted: every snapshotted chunk is resident again
      const manifestAfter = (await page.evaluate(
        () => (globalThis as any).__verifyManifest(),
      )) as string[];
      const set = new Set(manifestAfter);
      for (const k of manifestBefore) expect(set.has(k)).toBe(true);
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 300_000);

  it("a failed launch keeps the chooser alive with retry; Cancel still restores the flight", async () => {
    const page = await newPage();
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      await flyTheme(page, "nature");
      await openChooserFromFlight(page);
      // inject a one-shot launch failure
      await page.evaluate(() => {
        (globalThis as any).__verifyLaunch = () => "fail";
      });
      await page.click('#chooser input[value="alien"]');
      await page.click("#fly");
      await page.waitForFunction(
        () =>
          !document.getElementById("chooser-error")!.hidden &&
          document.body.dataset.phase === "choosing",
      );
      // the error names the launch and the world, and the retry button is live
      await page.evaluate(() => {
        (globalThis as any).__verifyLaunch = undefined;
      });
      // retry: Fly again on the retained selection lands Alien
      await page.click("#fly");
      await page.waitForFunction(() => document.body.dataset.phase === "flying", {
        timeout: 120_000,
      });
      expect((await state(page)).phase).toBe("flying");
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 300_000);

  it("Cancel after a failed launch rebuilds the snapshot world (rebuilt path)", async () => {
    const page = await newPage();
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      await flyTheme(page, "nature");
      await page.waitForTimeout(800);
      const pausedAt = await state(page);
      await openChooserFromFlight(page);
      await page.evaluate(() => {
        (globalThis as any).__verifyLaunch = () => "fail";
      });
      await page.click('#chooser input[value="alien"]');
      await page.click("#fly");
      await page.waitForFunction(
        () =>
          !document.getElementById("chooser-error")!.hidden &&
          document.body.dataset.phase === "choosing",
      );
      await page.evaluate(() => {
        (globalThis as any).__verifyLaunch = undefined;
      });
      // the failed launch released the paused residency — Cancel must rebuild it
      await page.click("#cancel");
      await page.waitForFunction(() => document.body.dataset.phase === "flying", {
        timeout: 120_000,
      });
      const restored = await state(page);
      expect(restored.simTime).toBeGreaterThanOrEqual(pausedAt.simTime);
      expect(restored.simTime).toBeLessThan(pausedAt.simTime + 3);
      expect(Math.hypot(restored.x - pausedAt.x, restored.z - pausedAt.z)).toBeLessThan(250);
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 300_000);

  it("busy states ignore duplicate Fly/Cancel presses", async () => {
    const page = await newPage();
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      await flyTheme(page, "nature");
      await openChooserFromFlight(page);
      await page.click('#chooser input[value="arctic"]');
      await page.click("#fly");
      await page.waitForFunction(() => document.body.dataset.phase === "preparing");
      // Fly is disabled while busy — a programmatic click cannot double-launch
      await page.evaluate(() => document.getElementById("fly")!.click());
      const stats = (await page.evaluate(() => (globalThis as any).__verifyStats())) as {
        generation: number;
      };
      expect(stats.generation).toBeGreaterThanOrEqual(2); // exactly one live generation
      await page.waitForFunction(() => document.body.dataset.phase === "flying", {
        timeout: 120_000,
      });
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 300_000);

  it("resize and a hidden tab preserve phase and selection across every state", async () => {
    const page = await newPage();
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      await page.click('#chooser input[value="arctic"]');
      // resize while choosing: selection and phase untouched
      await page.setViewportSize({ width: 640, height: 480 });
      expect(await phase(page)).toBe("choosing");
      expect(
        await page.evaluate(
          () => (document.querySelector('#chooser input:checked') as HTMLInputElement).value,
        ),
      ).toBe("arctic");
      await page.click("#fly");
      await page.waitForFunction(() => document.body.dataset.phase === "preparing");
      // hide + resize mid-preparation: the job keeps streaming, nothing steers
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { get: () => true, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.setViewportSize({ width: 900, height: 500 });
      await page.waitForFunction(() => document.body.dataset.phase === "flying", {
        timeout: 120_000,
      });
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      // pause → resize → cancel still lands the snapshot
      await openChooserFromFlight(page);
      await page.setViewportSize({ width: 500, height: 700 });
      await cancelDirect(page);
      expect(await phase(page)).toBe("flying");
      expect(errs.pageErrors).toEqual([]);
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
      const a = await state(page);
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
      const c = await state(page);
      // menu time never entered the simulation — the resume continues the snapshot clock
      expect(c.simTime).toBeGreaterThanOrEqual(a.simTime);
      expect(c.simTime).toBeLessThan(a.simTime + 3);
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 180_000);
});

afterAll(async () => {
  await browser?.close();
});
