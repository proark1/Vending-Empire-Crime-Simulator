// Deterministic, seedable PRNG for the procedural city generator.
//
// Pure on purpose: no Math.random and no Date, so the same seed always yields
// the same stream and generated layouts are reproducible / unit-testable.
// xmur3 hashes a seed string to a 32-bit state; mulberry32 turns that into a
// fast, well-distributed float stream.

export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [minInclusive, maxExclusive); returns minInclusive if the range is empty. */
  int(minInclusive: number, maxExclusive: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** True with the given probability in [0, 1]. */
  chance(probability: number): boolean;
  /** Uniformly pick one item; throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /**
   * Derive an isolated child stream keyed by `label`. Forks depend only on the
   * parent seed + label, never on how much the parent has been consumed, so the
   * order in which pipeline stages run does not shift one another's randomness.
   */
  fork(label: string): Rng;
}

export function createRng(seed: string): Rng {
  const next = mulberry32(xmur3(seed)());
  return {
    next,
    int(minInclusive, maxExclusive) {
      if (maxExclusive <= minInclusive) {
        return minInclusive;
      }
      return minInclusive + Math.floor(next() * (maxExclusive - minInclusive));
    },
    range(min, max) {
      return min + next() * (max - min);
    },
    chance(probability) {
      return next() < probability;
    },
    pick(items) {
      if (items.length === 0) {
        throw new Error("Rng.pick called with an empty array");
      }
      return items[Math.floor(next() * items.length)];
    },
    fork(label) {
      return createRng(`${seed}:${label}`);
    }
  };
}
