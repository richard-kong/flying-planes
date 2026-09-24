// `npm run test:browser` (002 T002): builds the isolated verification bundle outside dist/,
// serves it on a free port, verifies Chromium + WebGL2 exist (nonzero exit otherwise), then
// runs the serial *.browser.test.ts Vitest suite and cleans up.
import { startVitest } from "vitest/node";
import {
  assertWebGL2,
  buildVerificationBundle,
  freePort,
  requireChromium,
  serveVerification,
} from "./browser-harness";

const port = await freePort();
await buildVerificationBundle();
const server = await serveVerification(port);

let code = 1;
try {
  requireChromium();
  await assertWebGL2();

  process.env.BROWSER_BASE_URL = server.url;
  // optional filename filters: `npm run test:browser -- chooser switching`
  const vitest = await startVitest("test", process.argv.slice(2), {
    watch: false,
    config: "vitest.browser.config.ts",
  });
  await vitest?.close();
  const state = vitest?.state;
  const failed = state
    ? state.getCountOfFailedTests() > 0 || state.getFiles().some((f) => f.result?.errors?.length)
    : true;
  code = failed ? 1 : 0;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  code = 1;
} finally {
  await server.close();
}
process.exit(code);
