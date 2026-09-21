// Rendered soak (002 T056/T063): drives the real app for `--minutes N` in Chromium —
// headed on request — through the chooser (no Theme URL; FR-022 keeps the chooser the
// only entry point), then flies a deterministic max-speed route that crosses chunk bands
// and LOD transitions using the normal input mappers. Records rendered frame intervals,
// page errors, and pool/manifest counts every 10 s, and exits nonzero on any failure.
//
//   npm run soak:rendered -- --minutes 60 --seed 42 --theme alien --headed
//
// Owner-device runs report wall-clock acceptance; the VM run under SwiftShader measures
// correctness invariants (determinism, leaks, errors), not frame-rate budgets.
import { writeFileSync, mkdirSync } from "node:fs";
import {
  assertWebGL2,
  buildVerificationBundle,
  freePort,
  launchChromium,
  serveVerification,
} from "./browser-harness";

interface Args {
  minutes: number;
  seed: number;
  theme: "nature" | "alien" | "arctic";
  headed: boolean;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { minutes: 60, seed: 42, theme: "alien", headed: false, out: "soak-report.json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--minutes") args.minutes = Number(argv[++i]);
    else if (a === "--seed") args.seed = Number(argv[++i]);
    else if (a === "--theme") args.theme = argv[++i] as Args["theme"];
    else if (a === "--headed") args.headed = true;
    else if (a === "--out") args.out = argv[++i];
  }
  if (!["nature", "alien", "arctic"].includes(args.theme)) {
    throw new Error(`--theme must be nature|alien|arctic, got ${args.theme}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const port = await freePort();
await buildVerificationBundle();
const server = await serveVerification(port);
await assertWebGL2();
const browser = await launchChromium({ headed: args.headed });

const errors: string[] = [];
let code = 0;

interface Sample {
  t: number;
  simTime: number;
  x: number;
  z: number;
  speed: number;
  residents: number;
  queued: number;
  surfaces: number;
  geo: number;
  tex: number;
  progs: number;
  framesSince: number;
  frameP50: number;
  frameP95: number;
  frameP99: number;
  frameMax: number;
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.location()?.url?.endsWith("/favicon.ico")) {
      errors.push(`console: ${m.text()}`);
    }
  });
  // frame-interval probe installed before the app boots: wraps rAF and buckets the gaps
  await page.addInitScript(() => {
    const times: number[] = [];
    const orig = window.requestAnimationFrame.bind(window);
    let last = 0;
    window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
      orig((t) => {
        if (last) times.push(t - last);
        last = t;
        return cb(t);
      });
    (window as unknown as { __frameTimes: number[] }).__frameTimes = times;
  });

  await page.goto(`${server.url}/?seed=${args.seed}&renderTest=1`);
  await page.waitForFunction(() => document.body.dataset.phase === "choosing", {
    timeout: 120_000,
  });
  // drive the real chooser: select, Fly, wait for the committed first frame
  await page.click(`#chooser input[value="${args.theme}"]`);
  await page.click("#fly");
  await page.waitForFunction(() => document.body.dataset.phase === "flying", {
    timeout: 120_000,
  });

  // throttle to max through the normal mapper (wheel events), then hold a straight route:
  // maximum speed covers the most bands and LOD transitions per minute (spec route)
  const cx = 640;
  const cy = 360;
  await page.mouse.move(cx, cy - 200); // slight nose-down input = first arm + dive bias
  for (let i = 0; i < 24; i++) await page.mouse.wheel(0, -120);

  const endAt = Date.now() + args.minutes * 60_000;
  const samples: Sample[] = [];
  let framesSeen = 0;
  let lastFrameTimes = 0;
  while (Date.now() < endAt) {
    await page.waitForTimeout(10_000);
    // keep the route level: alternate gentle left/right nudges every ~30 s so the plane
    // sweeps a wide S — crosses more chunk bands than a single straight line
    const t = (Date.now() - (endAt - args.minutes * 60_000)) / 1000;
    const leg = Math.floor(t / 30) % 2 === 0 ? 1 : -1;
    await page.mouse.move(cx + leg * 120, cy - 60);

    const raw = await page.evaluate(() => {
      const ft = (window as unknown as { __frameTimes: number[] }).__frameTimes;
      const stats = (globalThis as any).__verifyStats();
      const state = (globalThis as any).__verifyState();
      return { ft: ft.slice(), stats, state };
    });
    const ft = raw.ft.slice(lastFrameTimes);
    lastFrameTimes = raw.ft.length;
    ft.sort((a, b) => a - b);
    const pct = (p: number) => (ft.length ? ft[Math.min(ft.length - 1, Math.floor(p * ft.length))] : 0);
    framesSeen = raw.ft.length;
    samples.push({
      t,
      simTime: raw.state.simTime,
      x: raw.state.x,
      z: raw.state.z,
      speed: raw.state.speed,
      residents: raw.stats.residents,
      queued: raw.stats.queued,
      surfaces: raw.stats.surfaces,
      geo: raw.stats.geo,
      tex: raw.stats.tex,
      progs: raw.stats.progs,
      framesSince: ft.length,
      frameP50: pct(0.5),
      frameP95: pct(0.95),
      frameP99: pct(0.99),
      frameMax: ft.length ? ft[ft.length - 1] : 0,
    });
    const s = samples[samples.length - 1];
    console.log(
      `[${Math.floor(s.t)}s] pos=(${s.x.toFixed(0)},${s.z.toFixed(0)}) speed=${s.speed.toFixed(0)} ` +
        `res=${s.residents} q=${s.queued} geo=${s.geo} progs=${s.progs} ` +
        `frames p50=${s.frameP50.toFixed(1)}ms p99=${s.frameP99.toFixed(1)}ms`,
    );
  }

  const report = { args, startedAt: new Date().toISOString(), samples, errors };
  mkdirSync(new URL("../captures", import.meta.url).pathname, { recursive: true });
  writeFileSync(args.out, JSON.stringify(report, null, 2));
  console.log(`soak report written to ${args.out} (${samples.length} samples, ${framesSeen} frames)`);

  // failures: any page/console error, a stalled sim clock, or runaway pool growth
  const simAdvance = samples.length > 1 ? samples[samples.length - 1].simTime - samples[0].simTime : 0;
  const geoDrift = samples.length > 2 ? samples[samples.length - 1].geo - samples[2].geo : 0;
  if (errors.length) {
    console.error(`FAIL: ${errors.length} page/console errors`);
    code = 1;
  }
  if (simAdvance < args.minutes * 30) {
    console.error(`FAIL: sim clock advanced only ${simAdvance.toFixed(1)}s in ${args.minutes}min`);
    code = 1;
  }
  if (geoDrift > 16) {
    console.error(`FAIL: geometry count drifted +${geoDrift} over the soak`);
    code = 1;
  }
} finally {
  await browser.close();
  server.close();
}

process.exit(code);
