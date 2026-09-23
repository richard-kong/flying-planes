// 002 T039: capture Seed-42 flight views and per-theme overview shots matching the
// approved N4/A4 review viewpoints, plus the chooser itself. Writes PNGs to
// captures/themes/ (gitignored) for PR evidence — never shipped assets.
// Usage: npx vite-node scripts/capture-themes.ts [outDir]
import { mkdirSync, writeFileSync } from "node:fs";
import {
  buildVerificationBundle,
  freePort,
  launchChromium,
  requireChromium,
  serveVerification,
} from "./browser-harness";

// default output lives outside the repo — captures are PR evidence, never shipped files
const OUT = process.argv[2] ?? "../captures/themes";
mkdirSync(OUT, { recursive: true });

const port = await freePort();
await buildVerificationBundle();
const server = await serveVerification(port);
const browser = await launchChromium();

async function saveDataUrl(dataUrl: string, path: string): Promise<void> {
  const b64 = dataUrl.split(",")[1];
  writeFileSync(path, Buffer.from(b64, "base64"));
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${server.url}/?seed=42&renderTest`, { waitUntil: "load" });
  await page.waitForFunction(
    () =>
      document.body.dataset.readyChooser === "true" ||
      document.body.dataset.phase === "choosing",
    undefined,
    { timeout: 120_000 },
    );

  // chooser with the three decoded preview cards
  await page.screenshot({ path: `${OUT}/chooser.png` });
  for (const id of ["nature", "alien", "arctic"]) {
    const img = await page.$(`img[data-theme-img="${id}"]`);
    if (img) await img.screenshot({ path: `${OUT}/card-${id}.png` });
  }

  // overview shots through the shared terrain/material/sky pipeline at the preview pose
  for (const id of ["nature", "alien", "arctic"]) {
    const dataUrl = await page.evaluate(
      (tid) =>
        (
          globalThis as {
            __verifyOverview?: (id: string, w: number, h: number) => Promise<string>;
          }
        ).__verifyOverview!(tid, 1280, 720),
      id,
    );
    await saveDataUrl(dataUrl, `${OUT}/overview-${id}.png`);
  }

  // flight views: launch each theme and screenshot after streaming settles
  for (const id of ["nature", "alien", "arctic"]) {
    const needsChooser = await page.evaluate(
      () => document.body.dataset.phase !== "choosing",
    );
    if (needsChooser) {
      // flying -> reopen the chooser
      await page.click("#change-theme");
      await page.waitForFunction(() => document.body.dataset.phase === "choosing", undefined, {
        timeout: 30_000,
      });
    }
    await page.click(`#chooser input[value="${id}"]`);
    await page.click("#fly");
    await page.waitForFunction(() => document.body.dataset.phase === "flying", undefined, {
      timeout: 120_000,
    });
    // give the streamer a few seconds to fill the view disc
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `${OUT}/flight-${id}.png` });
    // a banked-turn shot to check sun/fog alignment while turning
    await page.mouse.move(960, 300);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/turn-${id}.png` });
    await page.mouse.move(640, 360);
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`captures written to ${OUT}/`);
