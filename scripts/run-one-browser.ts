import { startVitest } from "vitest/node";
import { assertWebGL2, buildVerificationBundle, freePort, requireChromium, serveVerification } from "./browser-harness";
const file = process.argv[2];
if (!file) throw new Error("usage: vite-node scripts/run-one-browser.ts <test-file>");
const port = await freePort();
await buildVerificationBundle();
const server = await serveVerification(port);
let code = 1;
try {
  requireChromium();
  await assertWebGL2();
  process.env.BROWSER_BASE_URL = server.url;
  const vitest = await startVitest("test", [file], { watch: false, config: "vitest.browser.config.ts" });
  await vitest?.close();
  const state = vitest?.state;
  const failed = state ? state.getCountOfFailedTests() > 0 || state.getFiles().some((f) => f.result?.errors?.length) : true;
  code = failed ? 1 : 0;
} finally {
  server.close();
}
process.exit(code);
