import { defineConfig } from "vite";

export default defineConfig({
  // project Pages URL is /<repo>/; keep "/" for local dev and preview
  base: process.env.GITHUB_ACTIONS ? "/flying-planes/" : "/",
  build: { target: "es2022" },
  // production bundles never carry the verification hooks; scripts/browser-harness.ts
  // overrides this define for the isolated test build
  define: { __VERIFY_HOOKS__: "false" },
});
