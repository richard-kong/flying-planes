// 003 visual study: render every aircraft design direction in aircraft-prototype.html and
// write PNGs (card, chase level, chase banking, rear detail) plus a designs.json manifest.
// Output is review evidence, never a shipped asset.
// Usage: npx vite-node scripts/capture-aircraft-prototypes.ts [outDir]
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "vite";
import { freePort, launchChromium } from "./browser-harness";

const OUT = process.argv[2] ?? ".lavish/aircraft-prototypes/img";
mkdirSync(OUT, { recursive: true });

const VIEWS: { id: string; w: number; h: number }[] = [
  { id: "card", w: 640, h: 360 },
  { id: "level", w: 1280, h: 720 },
  { id: "bank", w: 1280, h: 720 },
  { id: "detail", w: 640, h: 360 },
];

const port = await freePort();
const server = await createServer({ server: { port, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(`http://localhost:${port}/aircraft-prototype.html?capture`, { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.ready, { timeout: 60_000 });
  const designs = await page.evaluate(
    () => (globalThis as { __designs?: () => unknown }).__designs!() as {
      id: string;
      type: string;
      name: string;
      description: string;
    }[],
  );
  writeFileSync(`${OUT}/../designs.json`, JSON.stringify(designs, null, 2));
  for (const d of designs) {
    for (const v of VIEWS) {
      const dataUrl = await page.evaluate(
        ([id, view, w, h]) =>
          (globalThis as { __shot?: (id: string, view: string, w: number, h: number) => string }).__shot!(
            id as string,
            view as string,
            w as number,
            h as number,
          ),
        [d.id, v.id, v.w, v.h] as const,
      );
      writeFileSync(`${OUT}/${d.id}-${v.id}.png`, Buffer.from(dataUrl.split(",")[1], "base64"));
    }
    console.log("captured", d.id, d.name);
  }
} finally {
  await browser.close();
  await server.close();
}
