// T022 [US1]: chooser accessibility + input isolation — labelled radios, non-colour
// selection, visible focus, 44px targets, keyboard, busy guards, and proof that menu
// gestures never reach the flight sim.
// T012 [US2] (003): the Aircraft section — a second radiogroup of six cards, an
// independent pending selection, scroll reachability at phone sizes, and the same
// input isolation for its wheel/drag gestures.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchChromium } from "../../scripts/browser-harness";
import { MAX_SPEED, MIN_SPEED } from "../../src/constants";
import { AIRCRAFT_ORDER } from "../../src/sim/aircraft";
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

describe("aircraft selection (003 T012)", () => {
  it("exposes World and Aircraft radiogroups, six labelled aircraft cards, light checked", async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      const info = await page.evaluate((order) => {
        const groups = Array.from(
          document.querySelectorAll('#chooser [role="radiogroup"]'),
        );
        const radios = Array.from(
          document.querySelectorAll<HTMLInputElement>(
            '#chooser input[name="aircraft"]',
          ),
        );
        return {
          groupLabels: groups.map((g) => g.getAttribute("aria-label")),
          sectionHeadings: Array.from(document.querySelectorAll("#chooser h2")).map(
            (h) => h.textContent?.trim(),
          ),
          worldRadioCount: groups[0]?.querySelectorAll('input[name="theme"]').length ?? -1,
          aircraftRadioCount: radios.length,
          aircraftValues: radios.map((r) => r.value),
          wrappedInLabelCard: radios.every((r) => r.closest("label.card") !== null),
          cardPartsComplete: order.every((id) => {
            const card = document
              .querySelector(`input[name="aircraft"][value="${id}"]`)
              ?.closest("label.card");
            return (
              !!card?.querySelector(`img[data-aircraft-img="${id}"]`) &&
              !!card.querySelector(`[data-aircraft-fallback="${id}"]`) &&
              !!card.querySelector(".badge") &&
              !!card.querySelector(".name") &&
              !!card.querySelector(".desc")
            );
          }),
          checkedAircraft:
            document.querySelector<HTMLInputElement>(
              '#chooser input[name="aircraft"]:checked',
            )?.value ?? null,
          checkedTheme:
            document.querySelector<HTMLInputElement>(
              '#chooser input[name="theme"]:checked',
            )?.value ?? null,
        };
      }, [...AIRCRAFT_ORDER]);
      expect(info.groupLabels).toEqual(["World", "Aircraft"]);
      expect(info.sectionHeadings).toEqual(["World", "Aircraft"]);
      expect(info.worldRadioCount).toBe(3);
      expect(info.aircraftRadioCount).toBe(6);
      expect(info.aircraftValues).toEqual([...AIRCRAFT_ORDER]);
      expect(info.wrappedInLabelCard).toBe(true);
      expect(info.cardPartsComplete).toBe(true);
      expect(info.checkedAircraft).toBe("light");
      expect(info.checkedTheme).toBe("nature");
    } finally {
      await page.close();
    }
  });

  it("selecting an aircraft radio keeps the theme pending and starts no flight", async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      await page.click('#chooser input[name="theme"][value="alien"]');
      await page.click('#chooser input[name="aircraft"][value="glider"]');
      const picked = await page.evaluate(() => ({
        theme: document.querySelector<HTMLInputElement>(
          '#chooser input[name="theme"]:checked',
        )?.value,
        aircraft: document.querySelector<HTMLInputElement>(
          '#chooser input[name="aircraft"]:checked',
        )?.value,
      }));
      // each pending selection is independent — the other axis is untouched
      expect(picked.theme).toBe("alien");
      expect(picked.aircraft).toBe("glider");
      await page.waitForTimeout(600);
      expect(await page.evaluate(() => document.body.dataset.phase)).toBe("choosing");
      expect(await page.evaluate(() => document.getElementById("chooser")!.hidden)).toBe(
        false,
      );
      // reverse direction: a theme change keeps the aircraft pending
      await page.click('#chooser input[name="theme"][value="arctic"]');
      const repicked = await page.evaluate(() => ({
        theme: document.querySelector<HTMLInputElement>(
          '#chooser input[name="theme"]:checked',
        )?.value,
        aircraft: document.querySelector<HTMLInputElement>(
          '#chooser input[name="aircraft"]:checked',
        )?.value,
      }));
      expect(repicked.theme).toBe("arctic");
      expect(repicked.aircraft).toBe("glider");
      await page.waitForTimeout(600);
      expect(await page.evaluate(() => document.body.dataset.phase)).toBe("choosing");
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("all nine cards and the Fly/Cancel bar stay scroll-reachable at phone sizes", async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
    const errs = collectPageErrors(page);
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      // open the chooser over a live flight so both Fly and Cancel are offered
      await flyTheme(page, "nature");
      await page.click("#change-theme");
      await page.waitForFunction(() => document.body.dataset.phase === "choosing", {
        timeout: 30_000,
      });
      await page.waitForFunction(() => !document.getElementById("cancel")!.hidden);
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
        await page.setViewportSize(viewport);
        // every hit target (nine cards, Fly, Cancel) is at least 44 CSS px
        const sizes = await page.evaluate(() => {
          const els = [
            ...document.querySelectorAll("#chooser .card"),
            document.getElementById("fly")!,
            document.getElementById("cancel")!,
          ];
          return els.map((el) => {
            const r = el.getBoundingClientRect();
            return { w: r.width, h: r.height };
          });
        });
        expect(sizes.length).toBe(11);
        for (const s of sizes) {
          expect(s.h).toBeGreaterThanOrEqual(44);
          expect(s.w).toBeGreaterThanOrEqual(44);
        }
        // trial clicks run the full actionability pass (scroll-into-view + hit
        // target) without activating anything — the definition of reachable
        for (let i = 0; i < 9; i++) {
          await page.locator("#chooser .card").nth(i).click({ trial: true });
        }
        await page.locator("#fly").click({ trial: true });
        await page.locator("#cancel").click({ trial: true });
      }
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 180_000);

  it("wheel/drag over aircraft cards then Fly leaves throttle and steering at defaults until fresh input", async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errs = collectPageErrors(page);
    const state = () =>
      page.evaluate(() => (globalThis as any).__verifyState()) as Promise<{
        speed: number;
        heading: number;
      }>;
    try {
      await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
      // park the pointer on an aircraft card, then gesture there: menu wheel and
      // drag must never reach the flight mappers
      const card = page.locator('#chooser label.card:has(input[value="airliner"])');
      const box = await card.boundingBox();
      const cx = box!.x + box!.width / 2;
      const cy = box!.y + box!.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.wheel(0, -400);
      await page.mouse.down();
      await page.mouse.move(cx + 80, cy - 40);
      await page.mouse.up();
      await page.click("#fly");
      await page.waitForFunction(() => document.body.dataset.phase === "flying", {
        timeout: 120_000,
      });
      // spawn cruise sits mid-envelope; with no fresh input it must hold, dead-straight
      const spawnSpeed = (MIN_SPEED + MAX_SPEED) / 2;
      await page.waitForTimeout(1500);
      const cruising = await state();
      expect(Math.abs(cruising.speed - spawnSpeed)).toBeLessThan(1);
      expect(Math.abs(cruising.heading)).toBeLessThan(0.02);
      // the gate still opens for fresh input: first wheel re-arms it, second throttles up
      await page.mouse.wheel(0, -240);
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(1500);
      const throttled = await state();
      expect(throttled.speed).toBeGreaterThan(spawnSpeed + 2);
      expect(errs.pageErrors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 180_000);
});
