import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COUNTDOWN_TICKS,
  LOW_TIME_SECONDS,
  MAX_SPAWN_TICKS,
  TICKS_PER_SECOND,
} from '../src/constants.js';
import { generateLevel } from '../src/generator.js';
import { getLevelConfig } from '../src/levels.js';
import type { LineId } from '../src/lines.js';
import { Rng } from '../src/rng.js';
import {
  createGame,
  createGameFromLayout,
  nextSpawnDelay,
  pickNextLine,
  secondsLeft,
  step,
  type GameEvent,
  type GameState,
} from '../src/simulation.js';
import { smallLayout } from './helpers/layouts.js';

interface TimedEvent {
  readonly tick: number;
  readonly event: GameEvent;
}

/**
 * Plays a game to the end. `flips` maps a tick to the switches flipped during it.
 * Returns every event with the tick it happened in.
 */
function playToEnd(
  state: GameState,
  flips: ReadonlyMap<number, number[]> = new Map(),
): TimedEvent[] {
  const log: TimedEvent[] = [];
  while (state.phase !== 'finished') {
    const tick = state.tick;
    for (const event of step(state, flips.get(tick) ?? [])) log.push({ tick, event });
  }
  return log;
}

function eventsOfType<T extends GameEvent['type']>(
  log: readonly TimedEvent[],
  type: T,
): Array<{ tick: number; event: Extract<GameEvent, { type: T }> }> {
  return log.filter((e) => e.event.type === type) as Array<{
    tick: number;
    event: Extract<GameEvent, { type: T }>;
  }>;
}

describe('createGame', () => {
  it('starts in the countdown with the generated map and its starting routes', () => {
    const state = createGame(5, 123);
    expect(state.tick).toBe(0);
    expect(state.phase).toBe('countdown');
    expect(state.layout).toEqual(generateLevel(5, 123));
    expect(state.routes).toEqual(state.layout.switches.map((sw) => sw.initialRoute));
    expect(state.trains).toEqual([]);
    expect(state.stats).toEqual({ correct: 0, arrived: 0, score: 0, streak: 0, bestStreak: 0 });
  });

  it('can start from a hand-made map', () => {
    const state = createGameFromLayout(smallLayout());
    expect(state.level).toBe(1);
    expect(state.routes).toEqual([0, 1]);
  });
});

describe('countdown and clock', () => {
  const state = createGame(1, 42);
  const log = playToEnd(state);

  it('counts down 3, 2, 1 on the first tick of each second', () => {
    expect(eventsOfType(log, 'countdown')).toEqual([
      { tick: 0, event: { type: 'countdown', secondsLeft: 3 } },
      { tick: 60, event: { type: 'countdown', secondsLeft: 2 } },
      { tick: 120, event: { type: 'countdown', secondsLeft: 1 } },
    ]);
  });

  it('starts the round once, when the countdown ends', () => {
    expect(eventsOfType(log, 'start')).toEqual([
      { tick: COUNTDOWN_TICKS - 1, event: { type: 'start' } },
    ]);
  });

  it('warns once per second during the last seconds', () => {
    const warnings = eventsOfType(log, 'timeLow');
    expect(warnings.map((w) => w.event.secondsLeft)).toEqual(
      Array.from({ length: LOW_TIME_SECONDS }, (_, i) => LOW_TIME_SECONDS - i),
    );
    for (const { tick, event } of warnings) {
      expect(state.config.totalTicks - (tick + 1)).toBe(event.secondsLeft * TICKS_PER_SECOND);
    }
  });

  it('finishes exactly at the end of the round, once', () => {
    expect(state.tick).toBe(state.config.totalTicks);
    expect(state.phase).toBe('finished');
    expect(eventsOfType(log, 'finish')).toHaveLength(1);
    expect(log[log.length - 1]?.event).toEqual({ type: 'finish' });
  });

  it('does nothing after the game has finished', () => {
    expect(step(state, [0])).toEqual([]);
    expect(state.tick).toBe(state.config.totalTicks);
  });

  it('shows the full time during the countdown, then counts down to zero', () => {
    const fresh = createGame(1, 42);
    expect(secondsLeft(fresh)).toBe(60);
    while (fresh.tick < COUNTDOWN_TICKS + 1) step(fresh);
    expect(secondsLeft(fresh)).toBe(60);
    while (fresh.tick < COUNTDOWN_TICKS + TICKS_PER_SECOND + 1) step(fresh);
    expect(secondsLeft(fresh)).toBe(59);
    while (fresh.phase !== 'finished') step(fresh);
    expect(secondsLeft(fresh)).toBe(0);
  });
});

describe('switches', () => {
  it('flips a switch and reports its new route, even during the countdown', () => {
    const state = createGameFromLayout(smallLayout());
    expect(step(state, [1])).toContainEqual({ type: 'switch', switchId: 1, route: 0 });
    expect(state.routes).toEqual([0, 0]);
    step(state, [0]);
    expect(state.routes).toEqual([1, 0]);
  });

  it('applies every flip in a tick, in order', () => {
    const state = createGameFromLayout(smallLayout());
    const events = step(state, [0, 0, 1]);
    expect(events.filter((e) => e.type === 'switch')).toEqual([
      { type: 'switch', switchId: 0, route: 1 },
      { type: 'switch', switchId: 0, route: 0 },
      { type: 'switch', switchId: 1, route: 0 },
    ]);
    expect(state.routes).toEqual([0, 0]);
  });

  it.each([-1, 2, 0.5, Number.NaN])('rejects the unknown switch %s', (switchId) => {
    const state = createGameFromLayout(smallLayout());
    expect(() => step(state, [switchId])).toThrow(RangeError);
  });
});

describe('spawning trains', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends no trains during the countdown, and the first one as the clock starts', () => {
    const state = createGame(3, 7);
    const spawns = eventsOfType(playToEnd(state), 'spawn');
    expect(spawns[0]?.tick).toBe(COUNTDOWN_TICKS);
  });

  it.each([1, 8, 14, 20])(
    'keeps the gap between trains random and at most 3 s on level %i',
    (level) => {
      const gaps = new Set<number>();
      for (const seed of [1, 2, 3]) {
        const state = createGame(level, seed);
        const ticks = eventsOfType(playToEnd(state), 'spawn').map((s) => s.tick);
        for (let i = 1; i < ticks.length; i++) {
          const gap = (ticks[i] as number) - (ticks[i - 1] as number);
          expect(gap).toBeGreaterThanOrEqual(state.config.minSpawnTicks);
          expect(gap).toBeLessThanOrEqual(MAX_SPAWN_TICKS);
          gaps.add(gap);
        }
      }
      expect(gaps.size).toBeGreaterThan(10);
    },
  );

  it('starts each train at the tunnel, with a new id', () => {
    const state = createGame(2, 5);
    while (state.trains.length < 3) step(state);
    expect(state.trains.map((t) => t.id)).toEqual([1, 2, 3]);
    for (const train of state.trains) expect(train.nodeId).toBe(state.layout.tunnelId);
  });

  it('never sends three trains of the same line in a row, and uses every line', () => {
    for (const level of [1, 5, 15]) {
      for (const seed of [11, 12, 13]) {
        const state = createGame(level, seed);
        const lines = eventsOfType(playToEnd(state), 'spawn').map((s) => s.event.lineId);
        for (let i = 2; i < lines.length; i++) {
          expect(lines[i] === lines[i - 1] && lines[i] === lines[i - 2]).toBe(false);
        }
        if (level === 1) expect(new Set(lines).size).toBe(state.config.stations);
      }
    }
  });

  it('gives the same trains at the same ticks whatever the player does', () => {
    // Train colors and timing use their own random stream, so flipping switches cannot change them.
    const quiet = playToEnd(createGame(6, 99));
    const busy = playToEnd(
      createGame(6, 99),
      new Map([
        [10, [0]],
        [500, [1, 2]],
        [900, [0]],
      ]),
    );
    expect(eventsOfType(busy, 'spawn')).toEqual(eventsOfType(quiet, 'spawn'));
  });

  it('plays the same game twice for the same seed and flips', () => {
    const flips = new Map([[200, [0]]]);
    expect(playToEnd(createGame(9, 31337), flips)).toEqual(playToEnd(createGame(9, 31337), flips));
  });

  it('never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    playToEnd(createGame(10, 1));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('pickNextLine', () => {
  const lines: LineId[] = [0, 1, 2];

  it('picks a different line after two of the same', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 500; i++) expect(pickNextLine(rng, lines, [2, 2])).not.toBe(2);
  });

  it('can repeat a line once', () => {
    const rng = new Rng(1);
    const picks = Array.from({ length: 300 }, () => pickNextLine(rng, lines, [0, 1]));
    expect(picks).toContain(1);
    expect(new Set(picks).size).toBe(3);
  });
});

describe('nextSpawnDelay', () => {
  it('stays between the minimum gap and 3 seconds, and reaches both ends', () => {
    const config = getLevelConfig(1);
    const rng = new Rng(4);
    const delays = Array.from({ length: 5000 }, () => nextSpawnDelay(rng, config));
    expect(Math.min(...delays)).toBe(config.minSpawnTicks);
    expect(Math.max(...delays)).toBe(MAX_SPAWN_TICKS);
  });
});
