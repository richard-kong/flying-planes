import { defineConfig } from "vitest/config";

// Isolated browser suite (002 T002): runs only *.browser.test.ts through the real-Chromium
// harness, serially (single fork, no file parallelism) so WebGL/resource assertions do not
// race. Spawned by scripts/test-browser.ts, which owns the build, server, and env.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.browser.test.ts"],
    fileParallelism: false,
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
