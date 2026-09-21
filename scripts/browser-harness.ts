// Shared verification harness (002 T002): isolated build outside dist/, free-port static
// server, and one Playwright Chromium launcher. Used by scripts/test-browser.ts and
// scripts/soak-rendered.ts; never part of the production bundle.
import { existsSync } from "node:fs";
import net from "node:net";
import { build, preview, type PreviewServer } from "vite";
import { chromium, type Browser } from "playwright";

export const VERIFY_OUT = ".verify-dist";

export const CHROMIUM_ARGS = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      const port = typeof a === "object" && a ? a.port : 0;
      s.close(() => (port ? resolve(port) : reject(new Error("no free port"))));
    });
  });
}

// Production build for verification: enables the __VERIFY_HOOKS__ test adapter that the
// shipped bundle drops via dead-code elimination, and serves from base "/" rather than the
// GitHub Pages path.
export async function buildVerificationBundle(): Promise<void> {
  await build({
    logLevel: "warn",
    base: "/",
    define: { __VERIFY_HOOKS__: "true" },
    build: { outDir: VERIFY_OUT, emptyOutDir: true, minify: "esbuild" },
  });
}

export async function serveVerification(
  port: number,
): Promise<{ url: string; close(): Promise<void> }> {
  const server: PreviewServer = await preview({
    logLevel: "silent",
    base: "/",
    build: { outDir: VERIFY_OUT },
    preview: { port, strictPort: true, host: "127.0.0.1" },
  });
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.httpServer.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export function requireChromium(): string {
  const executablePath = chromium.executablePath();
  if (!existsSync(executablePath)) {
    throw new Error(
      "Playwright Chromium not installed: run `npx playwright install chromium`",
    );
  }
  return executablePath;
}

export async function launchChromium(opts: { headed?: boolean } = {}): Promise<Browser> {
  return chromium.launch({
    headless: !opts.headed,
    executablePath: requireChromium(),
    args: CHROMIUM_ARGS,
  });
}

// Fails hard (nonzero) when the verification browser cannot produce a real WebGL2 context —
// an unavailable GPU stack is a failed environment check, never a skipped green.
export async function assertWebGL2(): Promise<void> {
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    const ok = await page.evaluate(() => {
      const c = document.createElement("canvas");
      return c.getContext("webgl2") !== null;
    });
    if (!ok) throw new Error("WebGL2 unavailable in the verification Chromium build");
  } finally {
    await browser.close();
  }
}
