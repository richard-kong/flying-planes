// Shared page-driving helpers for the *.browser.test.ts suites (002). Only imported by
// browser tests — vitest.browser.config.ts picks up tests by filename, so helpers here are
// never collected as tests themselves.
import { expect } from "vitest";
import type { Page } from "playwright";
import type { AircraftTypeId } from "../../src/sim/aircraft";

export const BASE = process.env.BROWSER_BASE_URL ?? "http://127.0.0.1:0";

export function collectPageErrors(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.location()?.url?.endsWith("/favicon.ico")) {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  return { consoleErrors, pageErrors };
}

export async function gotoAndWaitChooser(page: Page, query = ""): Promise<void> {
  await page.goto(`${BASE}/${query}`, { waitUntil: "load" });
  // bootReady sets readyChooser once previews settle (decoded or degraded)
  await page.waitForFunction(
    () =>
      document.body.dataset.readyChooser === "true" ||
      document.body.dataset.phase === "choosing",
    undefined,
    { timeout: 120_000 },
  );
}

export async function flyTheme(page: Page, themeId: "nature" | "alien" | "arctic"): Promise<void> {
  await page.click(`#chooser input[value="${themeId}"]`);
  await page.click("#fly");
  await page.waitForFunction(() => document.body.dataset.phase === "flying", undefined, {
    timeout: 120_000,
  });
}

export async function flyDefault(page: Page): Promise<void> {
  await page.click("#fly");
  await page.waitForFunction(() => document.body.dataset.phase === "flying", undefined, {
    timeout: 120_000,
  });
}

// Sample the render canvas through a 2D context and report colour diversity.
export function sampleCanvas(page: Page): Promise<{
  unique: number;
  topY: number[];
  bottomY: number[];
} | null> {
  return page.evaluate(() => {
    const src = document.getElementById("scene") as HTMLCanvasElement | null;
    if (!src || src.width === 0) return null;
    const probe = document.createElement("canvas");
    probe.width = src.width;
    probe.height = src.height;
    const ctx = probe.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0);
    const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 16) {
      seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    const w = probe.width;
    const h = probe.height;
    const px = (x: number, y: number) => {
      const o = (y * w + x) * 4;
      return [data[o], data[o + 1], data[o + 2]];
    };
    return {
      unique: seen.size,
      topY: px(Math.floor(w / 2), 4),
      bottomY: px(Math.floor(w / 2), h - 6),
    };
  });
}

// --- Flight/chooser probes shared by the switching and aircraft suites ---

export function phase(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.body.dataset.phase);
}

export interface FlightProbe {
  x: number; y: number; z: number; speed: number; heading: number;
  simTime: number; phase: string;
}

export async function probeState(page: Page): Promise<FlightProbe> {
  return (await page.evaluate(() => (globalThis as any).__verifyState())) as FlightProbe;
}

// Wait for the flight to cover ground rather than sleeping wall time: under software GL the
// sim clamps each slow frame to 0.25 s, so seconds of wall time can be far less sim time.
export async function waitForFlownDistance(page: Page, min: number): Promise<FlightProbe> {
  await page.waitForFunction(
    (m) => {
      const s = (globalThis as any).__verifyState();
      return Math.hypot(s.x, s.z) > m;
    },
    min,
    { timeout: 60_000 },
  );
  return probeState(page);
}

// __verifyAircraft (003): the live aircraft's type, scene visibility, master spinner
// phase in radians, and its projected bbox in screen-space CSS px.
export interface AircraftProbe {
  type: AircraftTypeId;
  visible: boolean;
  spinPhase: number;
  box: { left: number; top: number; right: number; bottom: number };
}

export async function probeAircraft(page: Page): Promise<AircraftProbe> {
  return (await page.evaluate(() => (globalThis as any).__verifyAircraft())) as AircraftProbe;
}

export async function checkedSelections(
  page: Page,
): Promise<{ theme: string | undefined; aircraft: string | undefined }> {
  return page.evaluate(() => ({
    theme: document.querySelector<HTMLInputElement>('#chooser input[name="theme"]:checked')
      ?.value,
    aircraft: document.querySelector<HTMLInputElement>(
      '#chooser input[name="aircraft"]:checked',
    )?.value,
  }));
}

export function expectBoxInsideViewport(
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

export async function selectAircraft(page: Page, id: AircraftTypeId): Promise<void> {
  await page.click(`#chooser input[name="aircraft"][value="${id}"]`);
}

// spinPhase wraps at 2π — measure forward progress modulo 2π, never raw ordering
const TAU = Math.PI * 2;
export function phaseDelta(before: number, after: number): number {
  return (((after - before) % TAU) + TAU) % TAU;
}

export function checkedRadio(page: Page, name: "theme" | "aircraft"): Promise<string> {
  return page.evaluate(
    (n) =>
      (document.querySelector(`#chooser input[name="${n}"]:checked`) as HTMLInputElement)
        .value,
    name,
  );
}

export async function openChooserFromFlight(page: Page): Promise<void> {
  await page.click("#change-theme");
  await page.waitForFunction(() => document.body.dataset.phase === "choosing");
  // the modal is visible and the active theme is pre-selected
  await page.waitForFunction(() => !document.getElementById("chooser")!.hidden);
}

export async function cancelDirect(page: Page): Promise<void> {
  await page.click("#cancel");
  await page.waitForFunction(() => document.body.dataset.phase === "flying", undefined, {
    timeout: 30_000,
  });
}

export async function cancelWhilePreparing(page: Page): Promise<void> {
  // Escape is the keyboard Cancel; the button is equally enabled during preparing
  await page.waitForFunction(() => !document.getElementById("cancel")!.hidden);
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.body.dataset.phase === "flying",
    undefined,
    { timeout: 120_000 },
    );
}
