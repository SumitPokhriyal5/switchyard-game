import { describe, expect, it } from 'vitest';
import {
  COUNTDOWN_TICKS,
  MAX_LEVEL,
  MAX_SPAWN_TICKS,
  SPAWN_GAP_UNITS,
  TICKS_PER_SECOND,
} from '../src/constants.js';
import { getLevelConfig, isValidLevel } from '../src/levels.js';

const ALL_LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

describe('getLevelConfig', () => {
  // Hand-checked values from the formulas in the project spec.
  it.each([
    // level, stations, cols, rows, seconds, speed (cells/s)
    [1, 3, 5, 4, 60, 0.8],
    [3, 4, 5, 4, 60, 0.88],
    [4, 4, 6, 4, 75, 0.92],
    [8, 6, 7, 5, 75, 1.08],
    [9, 7, 7, 6, 90, 1.12],
    [13, 9, 9, 7, 90, 1.28],
    [15, 10, 9, 7, 90, 1.36],
    [20, 10, 9, 7, 90, 1.56],
  ])('level %i: %i stations on %ix%i, %is, %f cells/s', (level, stations, cols, rows, s, speed) => {
    const config = getLevelConfig(level);
    expect(config).toMatchObject({ level, stations, cols, rows, durationSeconds: s });
    expect(config.speedCellsPerSecond).toBe(speed);
  });

  it.each(ALL_LEVELS)('level %i has consistent settings', (level) => {
    const config = getLevelConfig(level);

    // Speed is a whole number of units per tick, so movement is exact integer math.
    expect(Number.isInteger(config.speedUnitsPerTick)).toBe(true);
    expect(config.speedCellsPerSecond).toBeLessThanOrEqual(1.6);

    // The shortest gap always leaves 1.25 cells between trains, and fits under the 3 s maximum.
    expect(config.minSpawnTicks * config.speedUnitsPerTick).toBeGreaterThanOrEqual(SPAWN_GAP_UNITS);
    expect(config.minSpawnTicks).toBeLessThan(config.maxSpawnTicks);
    expect(config.maxSpawnTicks).toBe(MAX_SPAWN_TICKS);

    expect(config.totalTicks).toBe(COUNTDOWN_TICKS + config.durationSeconds * TICKS_PER_SECOND);

    // One line per station, taken in order of introduction.
    expect(config.lineIds).toEqual(Array.from({ length: config.stations }, (_, i) => i));

    // Enough cells for the stations to fit on the board.
    expect(config.cols * config.rows).toBeGreaterThan(config.stations * 2);
  });

  it('never gets easier as the levels go up', () => {
    for (let level = 2; level <= MAX_LEVEL; level++) {
      const prev = getLevelConfig(level - 1);
      const next = getLevelConfig(level);
      expect(next.stations).toBeGreaterThanOrEqual(prev.stations);
      expect(next.cols).toBeGreaterThanOrEqual(prev.cols);
      expect(next.rows).toBeGreaterThanOrEqual(prev.rows);
      expect(next.speedUnitsPerTick).toBeGreaterThanOrEqual(prev.speedUnitsPerTick);
    }
  });

  it.each([0, -1, MAX_LEVEL + 1, 1.5, Number.NaN])('rejects level %s', (level) => {
    expect(() => getLevelConfig(level)).toThrow(RangeError);
  });
});

describe('isValidLevel', () => {
  it('accepts 1 to 20 only', () => {
    expect(isValidLevel(1)).toBe(true);
    expect(isValidLevel(MAX_LEVEL)).toBe(true);
    expect(isValidLevel(0)).toBe(false);
    expect(isValidLevel(MAX_LEVEL + 1)).toBe(false);
    expect(isValidLevel('3')).toBe(false);
  });
});
