// Deterministic, seedable PRNG. ALL randomness in generators must flow through
// this — never `Math.random` — so that `generate(params, seed)` is reproducible.
// Reproducibility is what makes "regenerate", multiple versions, and saved
// recipes work (see the PRD's seed-determinism principle).

export interface Rng {
  /** float in [0, 1) */
  next(): number;
  /** integer in [min, max], inclusive */
  int(min: number, max: number): number;
  /** pick a uniformly random element */
  pick<T>(items: readonly T[]): T;
  /** true with probability `p` (default 0.5) */
  bool(p?: number): boolean;
}

/** mulberry32 — small, fast, good-enough PRNG for problem generation. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(next() * (max - min + 1));
  };

  return {
    next,
    int,
    pick: (items) => items[int(0, items.length - 1)],
    bool: (p = 0.5) => next() < p,
  };
}

/**
 * Derive a stable child seed from a base seed and an index. Used to give each
 * problem in a worksheet its own reproducible seed from one base seed, and to
 * derive per-version seeds later.
 */
export function deriveSeed(base: number, index: number): number {
  let h = (base >>> 0) ^ Math.imul(index + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}
