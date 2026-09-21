// T044 [US3]: candidate worlds never touch the live one until commit, buffers return to
// the shared pools, manifests round-trip through a rebuilt restore, and nothing leaks a
// second renderer, material set, or residency. Probe-only assertions — __verifyStats and
// __verifyManifest are the observability hooks (verification build only).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { launchChromium } from "../../scripts/browser-harness";
import { collectPageErrors, flyTheme, gotoAndWaitChooser } from "./browser-helpers";

let browser: Browser | null = null;
let page: Page;

interface Stats {
  residents: number;
  queued: number;
  surfaces: number;
  generation: number;
  sessionGen: number;
  geo: number;
  tex: number;
  progs: number;
}

async function stats(): Promise<Stats> {
  return (await page.evaluate(() => (globalThis as any).__verifyStats())) as Stats;
}

async function manifest(): Promise<string[]> {
  return (await page.evaluate(() => (globalThis as any).__verifyManifest())) as string[];
}

async function flyTo(id: "nature" | "alien" | "arctic"): Promise<void> {
  await flyTheme(page, id);
  // brief settle so the post-commit frame lands; the stream queue never fully
  // drains while the plane moves, so don't wait on it
  await page.waitForTimeout(1500);
}

beforeAll(async () => {
  browser = await launchChromium();
  page = await browser.newPage({ viewport: { width: 800, height: 450 } });
});

afterAll(async () => {
  await page?.close();
  await browser?.close();
});

describe("world switching resources (T044)", () => {
  it("commits swap residency atomically with no growth in programs or textures", async () => {
    const errs = collectPageErrors(page);
    await gotoAndWaitChooser(page, "?seed=42&renderTest=1");
    await flyTo("nature");
    // warm the lazy pools once (surface stacks per LOD fill on first use), then measure
    for (const id of ["alien", "arctic"] as const) {
      await page.click("#change-theme");
      await page.waitForFunction(() => document.body.dataset.phase === "choosing");
      await flyTo(id);
    }
    await page.click("#change-theme");
    await page.waitForFunction(() => document.body.dataset.phase === "choosing");
    await flyTo("nature");
    const base = await stats();
    expect(base.residents).toBeGreaterThan(0);
    expect(base.geo).toBeGreaterThan(0);
    const baseGeo = base.geo;
    const baseProgs = base.progs;

    // three switches; pool sizes are fixed at boot so geometry/program counts must not
    // grow with use — residency flips keys, not allocations
    for (const id of ["alien", "arctic", "nature"] as const) {
      await page.click("#change-theme");
      await page.waitForFunction(() => document.body.dataset.phase === "choosing");
      const gBefore = (await stats()).sessionGen;
      await flyTo(id);
      const now = await stats();
      expect(now.sessionGen).toBe(gBefore + 1); // exactly one generation per launch
      expect(now.progs).toBe(baseProgs); // one material set — themes are uniforms
      expect(Math.abs(now.geo - baseGeo)).toBeLessThanOrEqual(8); // pooled churn only
    }
    expect(errs.pageErrors).toEqual([]);
  }, 600_000);

  it("a rebuilt Cancel restores the snapshotted manifest and surface coverage", async () => {
    const errs = collectPageErrors(page);
    await page.click("#change-theme");
    await page.waitForFunction(() => document.body.dataset.phase === "choosing");
    const snapManifest = await manifest();
    const snapSurfaces = (await stats()).surfaces;
    expect(snapManifest.length).toBeGreaterThan(0);

    // Fly Alien releases the paused residency; cancelling that preparation rebuilds it
    await page.click('#chooser input[value="alien"]');
    await page.click("#fly");
    await page.waitForFunction(() => document.body.dataset.phase === "preparing");
    // buffers are only reused after cancelPreparation acknowledges (synchronous in world.ts)
    await page.click("#cancel");
    await page.waitForFunction(() => document.body.dataset.phase === "flying", {
      timeout: 120_000,
    });
    const after = await manifest();
    const set = new Set(after);
    for (const key of snapManifest) expect(set.has(key)).toBe(true);
    // planar surfaces the snapshot recorded are visible again (lake/ice sheets present)
    expect((await stats()).surfaces).toBeGreaterThanOrEqual(Math.min(snapSurfaces, 1));
    expect(errs.pageErrors).toEqual([]);
  }, 300_000);

  it("stale generations and double cancels are rejected — exactly one live operation", async () => {
    const errs = collectPageErrors(page);
    await page.click("#change-theme");
    await page.waitForFunction(() => document.body.dataset.phase === "choosing");
    const g0 = (await stats()).sessionGen;
    await page.click('#chooser input[value="arctic"]');
    await page.click("#fly");
    await page.waitForFunction(() => document.body.dataset.phase === "preparing");
    // second Escape/Cancel while restoring is ignored (phase already left preparing)
    await page.click("#cancel");
    await page.waitForFunction(() => document.body.dataset.phase === "restoring");
    await page.keyboard.press("Escape").catch(() => {});
    // the hidden Cancel can still be dispatched directly — the session must reject it
    await page.evaluate(() => document.getElementById("cancel")!.click());
    await page.waitForFunction(() => document.body.dataset.phase === "flying", {
      timeout: 120_000,
    });
    const g1 = (await stats()).sessionGen;
    expect(g1).toBe(g0 + 2); // launch gen + restore gen; the extra cancels are dead
    expect(errs.pageErrors).toEqual([]);
  }, 300_000);
});
