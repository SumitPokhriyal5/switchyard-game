import {
  COUNTDOWN_TICKS,
  MAX_LEVEL,
  MAX_SPAWN_TICKS,
  SPAWN_GAP_UNITS,
  TICKS_PER_SECOND,
} from './constants.js';
import { LINES, type LineId } from './lines.js';

/** Everything that changes from one level to the next. */
export interface LevelConfig {
  readonly level: number;
  readonly stations: number;
  readonly cols: number;
  readonly rows: number;
  readonly durationSeconds: number;
  /** Ticks from the start of the countdown to the end of the round. */
  readonly totalTicks: number;
  /** Train speed in cells per second. For display only; the simulation uses speedUnitsPerTick. */
  readonly speedCellsPerSecond: number;
  /** Train speed in distance units per tick (cells per second x 100). */
  readonly speedUnitsPerTick: number;
  /** Shortest wait between trains: the time a train needs to travel 1.25 cells. */
  readonly minSpawnTicks: number;
  /** Longest wait between trains (3 seconds). */
  readonly maxSpawnTicks: number;
  /** The lines in play: the first `stations` lines, in order of introduction. */
  readonly lineIds: readonly LineId[];
}

export function isValidLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_LEVEL;
}

export function getLevelConfig(level: number): LevelConfig {
  if (!isValidLevel(level)) {
    throw new RangeError(`Level must be an integer from 1 to ${MAX_LEVEL}, got ${level}`);
  }
  const step = level - 1;

  const stations = Math.min(10, 3 + Math.floor(step / 2));
  const cols = Math.min(9, 5 + Math.floor(step / 3));
  const rows = Math.min(7, 4 + Math.floor(step / 4));
  const durationSeconds = level <= 3 ? 60 : level <= 8 ? 75 : 90;

  // speed = min(1.6, 0.8 + 0.04 x (level - 1)) cells per second, kept as whole units per tick.
  const speedUnitsPerTick = Math.min(160, 80 + 4 * step);

  return {
    level,
    stations,
    cols,
    rows,
    durationSeconds,
    totalTicks: COUNTDOWN_TICKS + durationSeconds * TICKS_PER_SECOND,
    speedCellsPerSecond: speedUnitsPerTick / 100,
    speedUnitsPerTick,
    minSpawnTicks: Math.ceil(SPAWN_GAP_UNITS / speedUnitsPerTick),
    maxSpawnTicks: MAX_SPAWN_TICKS,
    lineIds: LINES.slice(0, stations).map((line) => line.id),
  };
}
