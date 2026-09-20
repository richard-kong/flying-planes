import { defineConfig } from "vite";

export default defineConfig({
  // project Pages URL is /<repo>/; keep "/" for local dev and preview
  base: process.env.GITHUB_ACTIONS ? "/flying-planes/" : "/",
  build: { target: "es2022" },
});
