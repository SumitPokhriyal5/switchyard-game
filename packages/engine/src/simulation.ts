import {
  COUNTDOWN_TICKS,
  LOW_TIME_SECONDS,
  SPAWN_GAP_UNITS,
  TICKS_PER_SECOND,
} from './constants.js';
import { generateLevel } from './generator.js';
import type { Layout, Route } from './layout.js';
import { getLevelConfig, type LevelConfig } from './levels.js';
import type { LineId } from './lines.js';
import { Rng, deriveSeed } from './rng.js';

export type Phase = 'countdown' | 'running' | 'finished';

export interface Train {
  readonly id: number;
  readonly lineId: LineId;
  /** The node the train is on. */
  nodeId: number;
  /** The exit the train will leave its node by. Fixed the moment it enters a switch. */
  exitIndex: number;
  /** Distance travelled along the current node's piece, in units. */
  progressUnits: number;
  /** Distance travelled since leaving the tunnel, in units. */
  travelledUnits: number;
}

export interface GameStats {
  correct: number;
  arrived: number;
  score: number;
  streak: number;
  bestStreak: number;
}

/**
 * Everything about a game in progress. `step` changes it in place, so the browser can keep
 * one object in a ref and the server can replay a run without creating thousands of copies.
 */
export interface GameState {
  readonly level: number;
  readonly seed: number;
  readonly config: LevelConfig;
  readonly layout: Layout;
  /** Ticks since the start of the countdown. */
  tick: number;
  phase: Phase;
  /** The current route of each switch, indexed by switch id. */
  readonly routes: Route[];
  /** Trains on the board, oldest first. */
  trains: Train[];
  nextTrainId: number;
  /** The earliest tick the next train may leave the tunnel. */
  nextSpawnTick: number;
  /** The lines of the last two trains, oldest first. */
  readonly recentLines: LineId[];
  readonly stats: GameStats;
  /** Random numbers for train colors and spawn times. Separate from the layout's stream. */
  readonly rng: Rng;
}

/** Things that happened during one tick. The web app turns these into sounds and animations. */
export type GameEvent =
  | { readonly type: 'countdown'; readonly secondsLeft: number }
  | { readonly type: 'start' }
  | { readonly type: 'switch'; readonly switchId: number; readonly route: Route }
  | { readonly type: 'spawn'; readonly trainId: number; readonly lineId: LineId }
  | {
      readonly type: 'arrival';
      readonly trainId: number;
      readonly lineId: LineId;
      readonly stationNodeId: number;
      readonly correct: boolean;
      readonly points: number;
      readonly streak: number;
    }
  | { readonly type: 'timeLow'; readonly secondsLeft: number }
  | { readonly type: 'finish' };

/** Starts a game on a level map that is already built. Used by tests with hand-made maps. */
export function createGameFromLayout(layout: Layout): GameState {
  const config = getLevelConfig(layout.level);
  return {
    level: layout.level,
    seed: layout.seed,
    config,
    layout,
    tick: 0,
    phase: 'countdown',
    routes: layout.switches.map((sw) => sw.initialRoute),
    trains: [],
    nextTrainId: 1,
    nextSpawnTick: COUNTDOWN_TICKS,
    recentLines: [],
    stats: { correct: 0, arrived: 0, score: 0, streak: 0, bestStreak: 0 },
    rng: new Rng(deriveSeed(layout.seed, 'trains')),
  };
}

/** Starts a game: builds the level map from the seed and sets the countdown going. */
export function createGame(level: number, seed: number): GameState {
  return createGameFromLayout(generateLevel(level, seed));
}

/**
 * The line of the next train: random, but never three of the same line in a row.
 * `recent` holds the lines of the last two trains.
 */
export function pickNextLine(
  rng: Rng,
  lineIds: readonly LineId[],
  recent: readonly LineId[],
): LineId {
  const line = rng.pick(lineIds);
  const [a, b] = recent;
  if (recent.length === 2 && a === line && b === line) {
    const others = lineIds.filter((id) => id !== line);
    if (others.length > 0) return rng.pick(others);
  }
  return line;
}

/** Ticks until the next train may leave: anywhere from the minimum gap up to 3 seconds. */
export function nextSpawnDelay(rng: Rng, config: LevelConfig): number {
  return config.minSpawnTicks + rng.int(config.maxSpawnTicks - config.minSpawnTicks + 1);
}

function flipSwitch(state: GameState, switchId: number, events: GameEvent[]): void {
  if (!Number.isInteger(switchId) || switchId < 0 || switchId >= state.routes.length) {
    throw new RangeError(`Level ${state.level} has no switch ${switchId}`);
  }
  const route: Route = state.routes[switchId] === 0 ? 1 : 0;
  state.routes[switchId] = route;
  events.push({ type: 'switch', switchId, route });
}

function trySpawn(state: GameState, events: GameEvent[]): void {
  if (state.tick < state.nextSpawnTick) return;
  // Keep a gap behind the previous train, so trains never overlap at the tunnel.
  const newest = state.trains[state.trains.length - 1];
  if (newest && newest.travelledUnits < SPAWN_GAP_UNITS) return;

  const lineId = pickNextLine(state.rng, state.config.lineIds, state.recentLines);
  state.recentLines.push(lineId);
  if (state.recentLines.length > 2) state.recentLines.shift();

  const train: Train = {
    id: state.nextTrainId++,
    lineId,
    nodeId: state.layout.tunnelId,
    exitIndex: 0,
    progressUnits: 0,
    travelledUnits: 0,
  };
  state.trains.push(train);
  state.nextSpawnTick = state.tick + nextSpawnDelay(state.rng, state.config);
  events.push({ type: 'spawn', trainId: train.id, lineId });
}

function moveTrains(state: GameState): void {
  for (const train of state.trains) train.travelledUnits += state.config.speedUnitsPerTick;
}

/**
 * Advances the game by one tick (1/60 of a second) and returns what happened.
 * `switchIds` are the switches the player flipped during this tick, in order.
 * Flips are allowed during the countdown too, so the player can set up before the first train.
 * Calling `step` after the game has finished does nothing.
 */
export function step(state: GameState, switchIds: readonly number[] = []): GameEvent[] {
  if (state.phase === 'finished') return [];
  const events: GameEvent[] = [];

  if (state.phase === 'countdown' && state.tick % TICKS_PER_SECOND === 0) {
    events.push({
      type: 'countdown',
      secondsLeft: (COUNTDOWN_TICKS - state.tick) / TICKS_PER_SECOND,
    });
  }

  for (const switchId of switchIds) flipSwitch(state, switchId, events);

  if (state.phase === 'running') {
    trySpawn(state, events);
    moveTrains(state);
  }

  state.tick++;

  if (state.phase === 'countdown' && state.tick >= COUNTDOWN_TICKS) {
    state.phase = 'running';
    events.push({ type: 'start' });
  }

  const ticksLeft = state.config.totalTicks - state.tick;
  if (
    state.phase === 'running' &&
    ticksLeft > 0 &&
    ticksLeft <= LOW_TIME_SECONDS * TICKS_PER_SECOND &&
    ticksLeft % TICKS_PER_SECOND === 0
  ) {
    events.push({ type: 'timeLow', secondsLeft: ticksLeft / TICKS_PER_SECOND });
  }

  if (ticksLeft <= 0) {
    state.phase = 'finished';
    events.push({ type: 'finish' });
  }
  return events;
}

/** Whole seconds left on the round clock, for the HUD. Stays full during the countdown. */
export function secondsLeft(state: GameState): number {
  const ticks = state.config.totalTicks - Math.max(state.tick, COUNTDOWN_TICKS);
  return Math.max(0, Math.ceil(ticks / TICKS_PER_SECOND));
}
