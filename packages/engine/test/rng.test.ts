import { describe, expect, it } from 'vitest';
import { MAX_SEED, Rng, dailySeed, deriveSeed, hashString, isValidSeed } from '../src/rng.js';

/** Draws n floats from a fresh generator. */
function draw(seed: number, n: number): number[] {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => rng.next());
}

describe('Rng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(draw(12345, 20)).toEqual(draw(12345, 20));
  });

  it('gives different sequences for different seeds', () => {
    expect(draw(1, 5)).not.toEqual(draw(2, 5));
  });

  // Saved runs are replayed with this generator, so its output must never change.
  // If this test fails, every stored run would replay differently.
  it('matches the known mulberry32 output', () => {
    expect(draw(42, 3)).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
    expect(draw(0, 1)).toEqual([0.26642920868471265]);
  });

  it('accepts the smallest and largest seeds', () => {
    expect(() => new Rng(0)).not.toThrow();
    expect(() => new Rng(MAX_SEED)).not.toThrow();
  });

  it.each([-1, 1.5, MAX_SEED + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects the invalid seed %s',
    (seed) => {
      expect(() => new Rng(seed)).toThrow(RangeError);
    },
  );

  it('next() stays in [0, 1) and averages about 0.5', () => {
    const values = draw(99, 10_000);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });

  describe('int', () => {
    it('returns every value in range, roughly evenly', () => {
      const rng = new Rng(7);
      const counts = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < 6000; i++) {
        const v = rng.int(6);
        expect(Number.isInteger(v)).toBe(true);
        counts[v] = (counts[v] ?? 0) + 1;
      }
      for (const c of counts) {
        expect(c).toBeGreaterThan(850);
        expect(c).toBeLessThan(1150);
      }
    });

    it('always returns 0 for int(1)', () => {
      const rng = new Rng(3);
      for (let i = 0; i < 100; i++) expect(rng.int(1)).toBe(0);
    });

    it.each([0, -1, 1.5, Number.NaN])('rejects maxExclusive = %s', (max) => {
      expect(() => new Rng(1).int(max)).toThrow(RangeError);
    });
  });

  describe('chance', () => {
    it('is never true for 0 and always true for 1', () => {
      const rng = new Rng(5);
      for (let i = 0; i < 1000; i++) {
        expect(rng.chance(0)).toBe(false);
        expect(rng.chance(1)).toBe(true);
      }
    });

    it('is true about 30% of the time for 0.3', () => {
      const rng = new Rng(11);
      let hits = 0;
      for (let i = 0; i < 10_000; i++) if (rng.chance(0.3)) hits++;
      expect(hits).toBeGreaterThan(2800);
      expect(hits).toBeLessThan(3200);
    });
  });

  describe('pick', () => {
    it('returns an element of the array', () => {
      const rng = new Rng(8);
      const items = ['red', 'blue', 'yellow'] as const;
      for (let i = 0; i < 100; i++) expect(items).toContain(rng.pick(items));
    });

    it('throws on an empty array', () => {
      expect(() => new Rng(1).pick([])).toThrow(RangeError);
    });
  });

  describe('shuffle', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];

    it('returns a permutation and leaves the input unchanged', () => {
      const out = new Rng(7).shuffle(input);
      expect(out).toHaveLength(input.length);
      expect([...out].sort((a, b) => a - b)).toEqual(input);
      expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('is deterministic for a seed', () => {
      expect(new Rng(7).shuffle(input)).toEqual([5, 7, 2, 3, 4, 6, 8, 1]);
      expect(new Rng(7).shuffle(input)).toEqual(new Rng(7).shuffle(input));
    });

    it('handles empty and single-item arrays', () => {
      expect(new Rng(1).shuffle([])).toEqual([]);
      expect(new Rng(1).shuffle(['only'])).toEqual(['only']);
    });
  });
});

describe('isValidSeed', () => {
  it('accepts unsigned 32-bit integers only', () => {
    expect(isValidSeed(0)).toBe(true);
    expect(isValidSeed(MAX_SEED)).toBe(true);
    expect(isValidSeed(-1)).toBe(false);
    expect(isValidSeed(2.5)).toBe(false);
    expect(isValidSeed(MAX_SEED + 1)).toBe(false);
    expect(isValidSeed('42')).toBe(false);
  });
});

describe('hashString', () => {
  it('is stable and returns an unsigned 32-bit integer', () => {
    expect(hashString('switchyard')).toBe(533657755);
    expect(isValidSeed(hashString('any text'))).toBe(true);
  });

  it('gives different hashes for similar strings', () => {
    expect(hashString('1:layout')).not.toBe(hashString('2:layout'));
    expect(hashString('abc')).not.toBe(hashString('acb'));
  });
});

describe('deriveSeed', () => {
  it('gives each stream its own seed', () => {
    expect(deriveSeed(42, 'layout')).not.toBe(deriveSeed(42, 'trains'));
    expect(deriveSeed(42, 'layout')).not.toBe(deriveSeed(43, 'layout'));
  });

  it('is stable', () => {
    expect(deriveSeed(42, 'layout')).toBe(1867275697);
    expect(deriveSeed(42, 'trains')).toBe(1324106337);
  });

  it('rejects an invalid seed', () => {
    expect(() => deriveSeed(-5, 'layout')).toThrow(RangeError);
  });
});

describe('dailySeed', () => {
  it('gives the same seed for the same date and a new one each day', () => {
    expect(dailySeed('2026-09-27')).toBe(3763314342);
    expect(dailySeed('2026-09-27')).toBe(dailySeed('2026-09-27'));
    expect(dailySeed('2026-09-28')).not.toBe(dailySeed('2026-09-27'));
  });

  it.each(['2026-9-27', '27-09-2026', '', '2026-09-27T00:00:00Z'])(
    'rejects the badly formatted date "%s"',
    (date) => {
      expect(() => dailySeed(date)).toThrow(RangeError);
    },
  );
});