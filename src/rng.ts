export type Rng = () => number;

/** Small, fast, seedable PRNG so a whole round can be rebuilt from its seed. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng: Rng, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));

export const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

export const chance = (rng: Rng, p: number): boolean => rng() < p;

export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sample = <T>(rng: Rng, arr: readonly T[], k: number): T[] => shuffle(rng, arr).slice(0, k);

export const newSeed = (): number => (Math.random() * 2 ** 32) >>> 0;
