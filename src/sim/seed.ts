// Seed from `?seed=` (FR-018): a non-negative whole number <= 2^32 - 1, else a random one.

const SEED_RE = /(?:^|[?&])seed=(\d+)(?:&|$)/;

export function parseSeed(query: string): number | undefined {
  const m = SEED_RE.exec(query);
  if (!m) return undefined;
  const s = Number(m[1]);
  if (!Number.isInteger(s) || s < 0 || s > 4294967295) return undefined;
  return s;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
