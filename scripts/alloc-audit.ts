// Steady-state allocation audit (002 T059): flies a max-speed straight route through
// warm pools while CDP HeapProfiler samples every allocation, then reports the per-site
// byte totals attributable to application code. Constitution requires zero steady-state
// frame allocations — this records the actual trace, not just a flat heap total.
//   npx vite-node scripts/alloc-audit.ts [aircraft]   (default: light)
import { buildVerificationBundle, freePort, launchChromium, serveVerification } from "./browser-harness";
import { AIRCRAFT_ORDER, DEFAULT_AIRCRAFT, type AircraftTypeId } from "../src/sim/aircraft";

const aircraft = (process.argv[2] ?? DEFAULT_AIRCRAFT) as AircraftTypeId;
if (!AIRCRAFT_ORDER.includes(aircraft)) {
  throw new Error(`aircraft must be ${AIRCRAFT_ORDER.join("|")}, got ${process.argv[2]}`);
}

const port = await freePort();
await buildVerificationBundle();
const server = await serveVerification(port);
const browser = await launchChromium();

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`${server.url}/?seed=42&renderTest=1&aircraft=${aircraft}`);
  await page.waitForFunction(() => document.body.dataset.phase === "choosing", undefined,
    { timeout: 120_000 },
    );
  await page.click("#fly"); // Nature default
  await page.waitForFunction(() => document.body.dataset.phase === "flying", undefined,
    { timeout: 120_000 },
    );
  // warm-up: let pools reach their high-water marks before sampling
  await page.mouse.move(480, 240);
  for (let i = 0; i < 24; i++) await page.mouse.wheel(0, -120);
  await page.waitForTimeout(30_000);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: 4096 });
  await page.waitForTimeout(30_000); // steady-state window: streaming across bands
  const { profile } = (await cdp.send("HeapProfiler.getSamplingProfile")) as {
    profile: {
      samples: { size: number; nodeId: number }[];
      head: { callFrame: HeapFrame; selfSize: number; id: number; children: HeapNodeChild[] };
    };
  };
  await cdp.send("HeapProfiler.stopSampling");

  interface HeapFrame { functionName: string; url: string; lineNumber: number }
  interface HeapNodeChild {
    callFrame: HeapFrame;
    selfSize: number;
    id: number;
    children: HeapNodeChild[];
  }
  // the profile is a tree — flatten it into id -> callFrame
  const frames = new Map<number, HeapFrame>();
  const walk = (n: HeapNodeChild): void => {
    frames.set(n.id, n.callFrame);
    n.children.forEach(walk);
  };
  profile.head.children.forEach(walk);
  let total = 0;
  const bySite = new Map<string, number>();
  for (const s of profile.samples) {
    total += s.size;
    const cf = frames.get(s.nodeId);
    const site = cf ? `${cf.functionName || "(anon)"} @ ${cf.url.split("/").pop()}:${cf.lineNumber + 1}` : "?";
    bySite.set(site, (bySite.get(site) ?? 0) + s.size);
  }
  const top = [...bySite.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  console.log(`sampled ${(total / 1024).toFixed(0)} KiB across ${profile.samples.length} samples in 30s`);
  for (const [site, bytes] of top) console.log(`  ${(bytes / 1024).toFixed(1).padStart(7)} KiB  ${site}`);
  const appAllocs = top.filter(([site]) => site.includes("index-") || site.includes("main"));
  const appBytes = appAllocs.reduce((n, [, b]) => n + b, 0);
  console.log(`application-site total (top 25): ${(appBytes / 1024).toFixed(1)} KiB`);
  console.log(appBytes === 0 ? "PASS: no application allocation sites in the top sample set" : "REVIEW: application sites above — inspect whether they are steady-state or churn");
} finally {
  await browser.close();
  server.close();
}
