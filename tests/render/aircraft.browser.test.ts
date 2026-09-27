// T008 [US1] + T013 [US2]: the __verifyAircraft() probe — the default Light Plane framed
// inside the viewport, the shared spinner phase advancing in flight and under Autopilot,
// and reload resetting the pending pair. The eighteen aircraft × Theme pairs live in
// aircraft.soak.browser.test.ts (main pushes and the nightly run only).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { launchChromium } from "../../scripts/browser-harness";
import {
  type AircraftProbe,
  checkedSelections,
  expectBoxInsideViewport,
  flyTheme,
  gotoAndWaitChooser,
  phaseDelta,
  probeAircraft,
} from "./browser-helpers";

const SEEDED = "?seed=42&renderTest=1";

let browser: Browser;

beforeAll(async () => {
  browser = await launchChromium();
});

afterAll(async () => {
  await browser?.close();
});

describe("aircraft selection", () => {
  it("the default flight flies the Light Plane framed inside the viewport", async () => {
    for (const viewport of [
      { width: 960, height: 600 },
      { width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      try {
        await gotoAndWaitChooser(page, SEEDED);
        await flyTheme(page, "nature");
        const probe = await probeAircraft(page);
        const size = `${viewport.width}x${viewport.height}`;
        expect(probe?.type, size).toBe("light");
        expect(probe?.visible, size).toBe(true);
        expectBoxInsideViewport(probe?.box, viewport.width, viewport.height);
      } finally {
        await page.close();
      }
    }
  }, 300_000);

  it("the spinner phase advances while flying", async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    try {
      await gotoAndWaitChooser(page, SEEDED);
      await flyTheme(page, "nature");
      const before = (await probeAircraft(page))?.spinPhase;
      expect(before).toBeDefined();
      // wait on the phase itself, not wall time — rAF can stall under load
      await page.waitForFunction(
        (b) =>
          (window as unknown as { __verifyAircraft?: () => AircraftProbe })
            .__verifyAircraft?.().spinPhase !== b,
        before,
        { timeout: 120_000 },
      );
      const after = (await probeAircraft(page))?.spinPhase;
      expect(after).toBeDefined();
      expect(phaseDelta(before ?? 0, after ?? 0)).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  }, 180_000);

  it("the spinner phase still advances once Autopilot takes over", async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    try {
      await gotoAndWaitChooser(page, SEEDED);
      await flyTheme(page, "nature");
      // Autopilot engages after five idle sim-seconds — wait on the sim clock,
      // not wall time, so software rendering cannot skew the idle count
      await page.waitForFunction(
        () =>
          ((
            window as unknown as { __verifyState?: () => { simTime: number } }
          ).__verifyState?.()?.simTime ?? 0) >= 6,
        undefined,
    { timeout: 120_000 },
    );
      const before = (await probeAircraft(page))?.spinPhase;
      expect(before).toBeDefined();
      await page.waitForFunction(
        (b) =>
          (window as unknown as { __verifyAircraft?: () => AircraftProbe })
            .__verifyAircraft?.().spinPhase !== b,
        before,
        { timeout: 120_000 },
      );
      const after = (await probeAircraft(page))?.spinPhase;
      expect(after).toBeDefined();
      expect(phaseDelta(before ?? 0, after ?? 0)).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  }, 180_000);

  it("reload resets the pending choices to Nature and the Light Plane", async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    try {
      await gotoAndWaitChooser(page, SEEDED);
      await page.click('#chooser input[name="theme"][value="arctic"]');
      await page.click('#chooser input[name="aircraft"][value="glider"]');
      const before = await checkedSelections(page);
      expect(before.theme).toBe("arctic");
      expect(before.aircraft).toBe("glider");
      await page.reload({ waitUntil: "load" });
      await page.waitForFunction(
        () =>
          document.body.dataset.readyChooser === "true" ||
          document.body.dataset.phase === "choosing",
        undefined,
    { timeout: 120_000 },
    );
      const checked = await checkedSelections(page);
      expect(checked.theme).toBe("nature");
      expect(checked.aircraft).toBe("light");
    } finally {
      await page.close();
    }
  });
});
