// T018/T020 [003 US3]: the aircraft axis of the switching lifecycle — the spinner phase
// freezes with the pause and resumes without catch-up, the visible type survives cancels
// and failed launches, and aircraft-only Flys are fresh flights.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchChromium } from "../../scripts/browser-harness";
import { SIM_DT } from "../../src/constants";
import {
  cancelWhilePreparing,
  collectPageErrors,
  flyTheme,
  gotoAndWaitChooser,
  openChooserFromFlight,
  phaseDelta,
  probeAircraft,
  probeState,
  selectAircraft,
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

describe("aircraft switching (003 US3)", () => {
  it("Change flight freezes the spinner phase; Cancel resumes the same aircraft and phase", async () => {
    const page = await newPage();
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      // fly the Biplane — a non-default aircraft, so "the original" is not the boot card
      await selectAircraft(page, "biplane");
      await flyTheme(page, "nature");
      await page.waitForTimeout(1500); // let the propeller spin up
      expect((await probeAircraft(page)).type).toBe("biplane");
      await openChooserFromFlight(page);

      // paused: the master phase is frozen bit-for-bit
      const paused = await probeAircraft(page);
      expect(paused.spinPhase).toBeGreaterThan(0);
      await page.waitForTimeout(1000);
      expect((await probeAircraft(page)).spinPhase).toBe(paused.spinPhase);

      // change both pending radios, then Cancel — neither reaches the paused flight
      await page.click('#chooser input[name="theme"][value="alien"]');
      await selectAircraft(page, "helicopter");
      // capture the phase on the first frame that paints after resume
      await page.evaluate(() => {
        (globalThis as any).__resumeSpin = null;
        const probe = () => {
          if (
            (globalThis as any).__resumeSpin === null &&
            document.body.dataset.phase === "flying"
          ) {
            (globalThis as any).__resumeSpin = (
              globalThis as any
            ).__verifyAircraft().spinPhase;
          }
          if ((globalThis as any).__resumeSpin === null) requestAnimationFrame(probe);
        };
        requestAnimationFrame(probe);
      });
      await page.click("#cancel");
      await page.waitForFunction(() => (globalThis as any).__resumeSpin !== null, undefined, {
        timeout: 30_000,
      });
      const firstFrameSpin = (await page.evaluate(
        () => (globalThis as any).__resumeSpin,
      )) as number;

      // original aircraft, never the pending card
      expect((await probeAircraft(page)).type).toBe("biplane");
      // the first live frame continues the frozen phase (at most one clamp window plus
      // the snapshot's sub-step accumulator of drift from the resume-side step); paused
      // time is never replayed
      expect(phaseDelta(paused.spinPhase, firstFrameSpin)).toBeLessThanOrEqual(0.25 + SIM_DT);
      // ...and then keeps advancing with live flight
      await page.waitForTimeout(500);
      expect(phaseDelta(firstFrameSpin, (await probeAircraft(page)).spinPhase)).toBeGreaterThan(0);
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 120_000);

  it("aircraft-only Fly starts a fresh flight: spawn pose, hint re-armed, new type", async () => {
    const page = await newPage();
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      await flyTheme(page, "nature"); // default Light Plane
      await page.mouse.move(700, 120);
      await page.waitForTimeout(2000);
      const flown = await probeState(page);
      expect(Math.hypot(flown.x, flown.z)).toBeGreaterThan(20);

      await openChooserFromFlight(page);
      await selectAircraft(page, "fighter"); // aircraft changes, theme stays Nature
      await page.click("#fly");
      await page.waitForFunction(() => document.body.dataset.phase === "flying", undefined, {
        timeout: 120_000,
      });

      const swapped = await probeAircraft(page);
      expect(swapped.type).toBe("fighter");
      expect(swapped.visible).toBe(true);
      // on screen at spawn — the projected box sits inside the 800×450 viewport
      const box = swapped.box;
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(800);
      expect(box.bottom).toBeLessThanOrEqual(450);
      const fresh = await probeState(page);
      expect(fresh.simTime).toBeLessThan(2);
      expect(Math.hypot(fresh.x, fresh.z)).toBeLessThan(
        Math.hypot(flown.x, flown.z),
      );
      // a new flight re-arms the hint and resets the spinner phase with the clock
      expect(
        await page.evaluate(
          () => !document.getElementById("hint")!.classList.contains("hidden"),
        ),
      ).toBe(true);
      expect(swapped.spinPhase).toBeLessThan(2);
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 120_000);

  it("unchanged Fly still restarts: fresh clock, spawn pose, same aircraft", async () => {
    const page = await newPage();
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      await flyTheme(page, "nature");
      await page.mouse.move(700, 120);
      await page.waitForTimeout(2000);
      const flown = await probeState(page);
      expect(Math.hypot(flown.x, flown.z)).toBeGreaterThan(20);

      await openChooserFromFlight(page);
      // touch neither radio — Fly on the unchanged pair is still a fresh Flight
      await page.click("#fly");
      await page.waitForFunction(() => document.body.dataset.phase === "flying", undefined, {
        timeout: 120_000,
      });

      const again = await probeAircraft(page);
      expect(again.type).toBe("light"); // the unchanged aircraft stays
      const fresh = await probeState(page);
      expect(fresh.simTime).toBeLessThan(2);
      expect(Math.hypot(fresh.x, fresh.z)).toBeLessThan(
        Math.hypot(flown.x, flown.z),
      );
      expect(
        await page.evaluate(
          () => !document.getElementById("hint")!.classList.contains("hidden"),
        ),
      ).toBe(true);
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 120_000);

  it("a failed aircraft launch leaves the original aircraft recoverable via Cancel", async () => {
    const page = await newPage();
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      await flyTheme(page, "nature");
      await page.waitForTimeout(1200);
      await openChooserFromFlight(page);
      // inject a one-shot launch failure, then Fly on a different aircraft
      await page.evaluate(() => {
        (globalThis as any).__verifyLaunch = () => "fail";
      });
      await selectAircraft(page, "airliner");
      await page.click("#fly");
      await page.waitForFunction(
        () =>
          !document.getElementById("chooser-error")!.hidden &&
          document.body.dataset.phase === "choosing",
      );
      await page.evaluate(() => {
        (globalThis as any).__verifyLaunch = undefined;
      });
      // the failed launch released the paused world — Cancel rebuilds it, aircraft too
      await page.click("#cancel");
      await page.waitForFunction(() => document.body.dataset.phase === "flying", undefined, {
        timeout: 120_000,
      });
      const restored = await probeAircraft(page);
      expect(restored.type).toBe("light");
      expect(restored.visible).toBe(true);
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 300_000);

  it("a mid-preparation Cancel abandons the candidate and never swaps the aircraft", async () => {
    const page = await newPage();
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      await flyTheme(page, "nature");
      await page.waitForTimeout(1200);
      await openChooserFromFlight(page);
      await selectAircraft(page, "glider");
      await page.click("#fly");
      await page.waitForFunction(() => document.body.dataset.phase === "preparing");
      // under the opaque veil the paused aircraft is still the visible one — the
      // candidate Glider can only appear at a live-generation commit
      const during = await probeAircraft(page);
      expect(during.type).toBe("light");
      expect(during.visible).toBe(true);
      await cancelWhilePreparing(page); // Escape — abandons the launch, rebuilds
      const restored = await probeAircraft(page);
      expect(restored.type).toBe("light");
      expect(restored.visible).toBe(true);
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 300_000);
});
