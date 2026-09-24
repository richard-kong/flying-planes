// T008 [US1] + T013 [US2]: the __verifyAircraft() probe — the default Light Plane framed
// inside the viewport, the shared spinner phase advancing in flight and under Autopilot,
// all eighteen aircraft × Theme pairs committing their selections, and reload resetting
// the pending pair. Fails until T009–T017 land the hook and the chooser's Aircraft section.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchChromium } from "../../scripts/browser-harness";
import { collectPageErrors, flyTheme, gotoAndWaitChooser } from "./browser-helpers";
import { AIRCRAFT_ORDER, type AircraftTypeId } from "../../src/sim/aircraft";
import type { ThemeId } from "../../src/sim/themes";

const THEME_IDS: readonly ThemeId[] = ["nature", "alien", "arctic"];
const SEEDED = "?seed=42&renderTest=1";
const TAU = Math.PI * 2;

interface AircraftProbe {
  type: AircraftTypeId;
  visible: boolean;
  spinPhase: number;
  box: { left: number; top: number; right: number; bottom: number };
}

let browser: Browser;

beforeAll(async () => {
  browser = await launchChromium();
});

afterAll(async () => {
  await browser?.close();
});

async function probeAircraft(page: Page): Promise<AircraftProbe | null> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as { __verifyAircraft?: () => AircraftProbe }
    ).__verifyAircraft;
    return hook?.() ?? null;
  });
}

function expectBoxInsideViewport(
  box: AircraftProbe["box"] | undefined,
  width: number,
  height: number,
): void {
  expect(box).toBeTruthy();
  if (!box) return;
  expect(box.right).toBeGreaterThan(box.left);
  expect(box.bottom).toBeGreaterThan(box.top);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(width);
  expect(box.bottom).toBeLessThanOrEqual(height);
}

// spinPhase wraps at 2π — assert forward progress, not raw ordering
function phaseDelta(before: number, after: number): number {
  return (((after - before) % TAU) + TAU) % TAU;
}

async function checkedSelections(
  page: Page,
): Promise<{ theme: string | undefined; aircraft: string | undefined }> {
  return page.evaluate(() => ({
    theme: document.querySelector<HTMLInputElement>(
      '#chooser input[name="theme"]:checked',
    )?.value,
    aircraft: document.querySelector<HTMLInputElement>(
      '#chooser input[name="aircraft"]:checked',
    )?.value,
  }));
}

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

  it("every aircraft × Theme pair flies the committed selections", async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, SEEDED);
      for (const themeId of THEME_IDS) {
        for (const aircraftId of AIRCRAFT_ORDER) {
          const label = `${aircraftId}/${themeId}`;
          await page.click(
            `#chooser input[name="aircraft"][value="${aircraftId}"]`,
          );
          await flyTheme(page, themeId);
          const probe = await probeAircraft(page);
          expect(probe?.type, label).toBe(aircraftId);
          expect(probe?.visible, label).toBe(true);
          expectBoxInsideViewport(probe?.box, 960, 600);
          // the reopened chooser selects the committed pair — the active Theme check
          await page.click("#change-theme");
          await page.waitForFunction(
            () => document.body.dataset.phase === "choosing",
            undefined,
    { timeout: 30_000 },
    );
          const checked = await checkedSelections(page);
          expect(checked.theme, label).toBe(themeId);
          expect(checked.aircraft, label).toBe(aircraftId);
        }
      }
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 600_000);

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
