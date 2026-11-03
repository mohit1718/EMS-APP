// Deterministic pseudo-random helpers so the simulated dataset is identical on every load.

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless hash -> [0,1). Used for on-demand values (machine split, hourly noise). */
export function hash01(...n: number[]): number {
  let h = 2166136261 >>> 0;
  for (const v of n) {
    h ^= (v * 2654435761) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Approximately normal noise with mean 0 and sd 1 */
export function gauss(r: () => number) {
  return (r() + r() + r() + r() - 2) * 1.732;
}
