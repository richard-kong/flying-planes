// Soak-class aircraft coverage (T013 [US2]): all eighteen aircraft × Theme pairs commit
// their selections through the real chooser. Minutes of wall time under software GL, so
// the PR gate skips *.soak.browser.test.ts; main pushes and the nightly run it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { launchChromium } from "../../scripts/browser-harness";
import {
  checkedSelections,
  collectPageErrors,
  expectBoxInsideViewport,
  flyTheme,
  gotoAndWaitChooser,
  probeAircraft,
} from "./browser-helpers";
import { AIRCRAFT_ORDER } from "../../src/sim/aircraft";
import type { ThemeId } from "../../src/sim/themes";

const THEME_IDS: readonly ThemeId[] = ["nature", "alien", "arctic"];
const SEEDED = "?seed=42&renderTest=1";

let browser: Browser;

beforeAll(async () => {
  browser = await launchChromium();
});

afterAll(async () => {
  await browser?.close();
});

describe("aircraft selection soak", () => {
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
});
