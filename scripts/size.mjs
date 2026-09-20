import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LIMIT_KB = 600;
const dir = "dist/assets";

let files;
try {
  files = readdirSync(dir).filter((f) => f.endsWith(".js"));
} catch {
  console.error(`no ${dir} directory; run \`npm run build\` first`);
  process.exit(1);
}

let total = 0;
for (const f of files) {
  total += gzipSync(readFileSync(join(dir, f))).length;
}
const kb = total / 1024;
console.log(`gzipped JS: ${kb.toFixed(1)} KB (limit ${LIMIT_KB} KB)`);
process.exit(kb > LIMIT_KB ? 1 : 0);
