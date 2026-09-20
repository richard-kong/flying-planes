import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// research R7: src/sim imports only three/src/math/*, ../constants, and sibling ./x modules.
const SIM_DIR = new URL("../../src/sim", import.meta.url).pathname;
const IMPORT_RE = /import[^'"]*from\s+['"]([^'"]+)['"]/g;
const FORBIDDEN_RE = /\b(window|document|navigator|requestAnimationFrame)\b|src\/render/;

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(p));
    else if (entry.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("sim purity", () => {
  const files = collect(SIM_DIR);

  it("src/sim has at least one module", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("imports only three/src/math, ../constants, or ./sibling", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const match of src.matchAll(IMPORT_RE)) {
        const spec = match[1];
        const ok =
          spec.startsWith("three/src/math/") ||
          spec === "../constants" ||
          spec === "../constants.js" ||
          spec.startsWith("./");
        expect(ok, `${file} imports forbidden specifier "${spec}"`).toBe(true);
      }
    }
  });

  it("has no DOM or render references", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(FORBIDDEN_RE.test(src), `${file} references a forbidden global`).toBe(false);
    }
  });
});
