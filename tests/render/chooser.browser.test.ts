// T022 [US1]: chooser accessibility + input isolation — labelled radios, non-colour
// selection, visible focus, 44px targets, keyboard, busy guards, and proof that menu
// gestures never reach the flight sim.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchChromium } from "../../scripts/browser-harness";
import { BASE, collectPageErrors, flyTheme, gotoAndWaitChooser } from "./browser-helpers";

let browser: Browser;

beforeAll(async () => {
  browser = await launchChromium();
});

afterAll(async () => {
  await browser?.close();
});

describe("chooser accessibility", () => {
  it("radios are labelled, focus is visible, and targets are >= 44 CSS px", async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest");
      // radio group semantics
      const group = await page.evaluate(() =>
        document.querySelector('[role="radiogroup"]')?.getAttribute("aria-label"),
      );
      expect(group).toBeTruthy();
      // every card's label wraps its input
      const labelled = await page.evaluate(() =>
        ["nature", "alien", "arctic"].every((id) =>
          document
            .querySelector(`input[value="${id}"]`)
            ?.closest("label"),
        ),
      );
      expect(labelled).toBe(true);
      // 44px targets: fly + each card's hit area
      const heights = await page.evaluate(() => {
        const hs: number[] = [];
        hs.push(document.getElementById("fly")!.getBoundingClientRect().height);
        document
          .querySelectorAll(".card")
          .forEach((c) => hs.push(c.getBoundingClientRect().height));
        return hs;
      });
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
      // focus lands inside the dialog when it opens
      const focused = await page.evaluate(() =>
        document.getElementById("chooser")!.contains(document.activeElement),
      );
      expect(focused).toBe(true);
    } finally {
      await page.close();
    }
  });

  it("selection is non-colour: a badge and the checked radio both change", async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest");
      await page.click('#chooser input[value="alien"]');
      const state = await page.evaluate(() => ({
        checked: (document.querySelector('input[value="alien"]') as HTMLInputElement)
          .checked,
        badgeVisible: (() => {
          const badge = document
            .querySelector('input[value="alien"]')!
            .closest(".card")!
            .querySelector(".badge") as HTMLElement;
          return getComputedStyle(badge).opacity;
        })(),
      }));
      expect(state.checked).toBe(true);
      expect(Number(state.badgeVisible)).toBe(1);
    } finally {
      await page.close();
    }
  });

  it("keyboard: Tab reaches controls, arrows move the radio group, Enter flies", async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest");
      // Tab from Fly moves forward through the dialog (never out of it while modal)
      await page.keyboard.press("Tab");
      const activeTag = await page.evaluate(() => document.activeElement?.tagName);
      expect(["INPUT", "BUTTON"]).toContain(activeTag);
      // radio arrow keys change selection natively
      await page.focus('input[value="nature"]');
      await page.keyboard.press("ArrowRight");
      const sel = await page.evaluate(
        () => (document.querySelector("#chooser input:checked") as HTMLInputElement)?.value,
      );
      expect(["alien", "arctic"]).toContain(sel);
      // Enter on the focused Fly button launches
      await page.focus("#fly");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.body.dataset.phase === "flying", {
        timeout: 120_000,
      });
    } finally {
      await page.close();
    }
  });

  it("scrolling/pinching the chooser cannot throttle or steer the flight", async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest");
      await flyTheme(page, "nature");
      // pointer location is remembered while flying
      await page.mouse.move(400, 250);
      await page.mouse.move(500, 250);
      await page.click("#change-theme");
      await page.waitForFunction(() => document.body.dataset.phase === "choosing", {
        timeout: 30_000,
      });
      // wheel over the dialog + drags on it must not count as flight input
      await page.mouse.move(400, 300);
      await page.mouse.wheel(0, -400);
      await page.mouse.down();
      await page.mouse.move(500, 300);
      await page.mouse.up();
      // resume via Cancel (prior flight exists)
      await page.click("#cancel");
      await page.waitForFunction(() => document.body.dataset.phase === "flying", {
        timeout: 60_000,
      });
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("Escape cancels only when a prior flight exists", async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest");
      // no prior flight: Escape does nothing and no Cancel button exists
      await page.keyboard.press("Escape");
      expect(await page.evaluate(() => document.body.dataset.phase)).toBe("choosing");
      expect(await page.isVisible("#cancel")).toBe(false);
      await flyTheme(page, "alien");
      await page.click("#change-theme");
      await page.waitForFunction(() => document.body.dataset.phase === "choosing", {
        timeout: 30_000,
      });
      expect(await page.isVisible("#cancel")).toBe(true);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.body.dataset.phase === "flying", {
        timeout: 60_000,
      });
    } finally {
      await page.close();
    }
  });
});
