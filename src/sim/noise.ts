// Hand-rolled hashed value noise (research R6). All integer hashing via Math.imul and
// unsigned shifts so Node and every browser agree bit for bit.

export function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fade(fx);
  const v = fade(fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(
  x: number,
  z: number,
  seed: number,
  octaves: number,
  lacunarity: number,
  gain: number,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fz = z;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(fx, fz, seed + i * 1013);
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fz *= lacunarity;
  }
  return sum / norm;
}

// One domain-warp pass used by terrain (R6): returns warped coordinates in-place via out[0]/out[1].
export function domainWarp(
  x: number,
  z: number,
  seed: number,
  strength: number,
  out: Float64Array,
): void {
  out[0] = x + strength * (fbm(x * 0.0013 + 31.7, z * 0.0013, seed + 7, 3, 2, 0.5) - 0.5);
  out[1] = z + strength * (fbm(x * 0.0013, z * 0.0013 + 17.3, seed + 11, 3, 2, 0.5) - 0.5);
}
