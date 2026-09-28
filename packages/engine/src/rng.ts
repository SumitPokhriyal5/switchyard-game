/** Largest valid seed. Seeds are unsigned 32-bit integers. */
export const MAX_SEED = 0xffffffff;

/** True when `value` is an integer from 0 to MAX_SEED. */
export function isValidSeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_SEED;
}

/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * The same seed always produces the same sequence, on every machine. The engine uses this
 * instead of Math.random so the server can replay a run and get exactly the same result.
 * Not suitable for security: it is fast and well spread, but predictable by design.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    if (!isValidSeed(seed)) {
      throw new RangeError(`Seed must be an integer from 0 to ${MAX_SEED}, got ${seed}`);
    }
    this.s = seed;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`);
    }
    return Math.floor(this.next() * maxExclusive);
  }

  /** True with probability p (0 = never, 1 = always). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** A random element of a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Cannot pick from an empty array');
    return items[this.int(items.length)] as T; // index is always in range
  }

  /** A shuffled copy of the array (Fisher-Yates). The input is not changed. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = out[i] as T; // i and j are always in range
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }
}

/** Hashes a string to an unsigned 32-bit integer (FNV-1a with a final mix step). */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Final mix so similar inputs ("1:layout", "2:layout") give very different outputs.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Derives an independent seed for one part of the game, such as "layout" or "trains".
 * Separate streams mean that changing how the layout uses randomness
 * does not change the order of the trains, and the other way round.
 */
export function deriveSeed(seed: number, stream: string): number {
  if (!isValidSeed(seed)) throw new RangeError(`Invalid seed: ${seed}`);
  return hashString(`${seed}:${stream}`);
}

/** Seed for the daily challenge. `date` is a UTC date in YYYY-MM-DD format. */
export function dailySeed(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RangeError(`Date must be in YYYY-MM-DD format, got "${date}"`);
  }
  return hashString(`daily:${date}`);
}
