import { indexToCell, manhattanDistance, type Cell } from './grid.js';
import { buildLayout, type Layout, type Route, type TrackCellSpec } from './layout.js';
import { getLevelConfig, type LevelConfig } from './levels.js';
import type { LineId } from './lines.js';
import { Rng, deriveSeed } from './rng.js';
import {
  MIN_SWITCH_DEPTH,
  NO_CELL,
  deadEnds,
  growTrackTree,
  treeCells,
  type SwitchGap,
  type TrackTree,
} from './tree.js';

/** Settings for one round of attempts. Later passes are looser. */
export interface GeneratorPass {
  /** Stations must be at least this many cells from the tunnel. */
  readonly minStationDepth: number;
  /** Stations must be at most round((cols + rows) x this) cells from the tunnel. */
  readonly maxDepthMultiplier: number;
  readonly switchGap: SwitchGap;
}

/**
 * Passes, strictest first. Each pass gets ATTEMPTS_PER_PASS tries before the next one starts.
 * Following the spec, each later pass raises the max-depth multiplier by 0.3 and allows
 * stations at depth 2. From the third pass, switches may also touch diagonally.
 */
export const GENERATOR_PASSES: readonly GeneratorPass[] = [
  { minStationDepth: 3, maxDepthMultiplier: 1.3, switchGap: 'touching' },
  { minStationDepth: 2, maxDepthMultiplier: 1.6, switchGap: 'touching' },
  { minStationDepth: 2, maxDepthMultiplier: 1.9, switchGap: 'sideBySide' },
  { minStationDepth: 2, maxDepthMultiplier: 2.2, switchGap: 'sideBySide' },
  { minStationDepth: 2, maxDepthMultiplier: 2.5, switchGap: 'sideBySide' },
];

export const ATTEMPTS_PER_PASS = 300;

/** How many of the farthest candidates the next station is picked from. */
const FARTHEST_CHOICES = 3;

export interface GenerationResult {
  readonly layout: Layout;
  /** Index in GENERATOR_PASSES of the pass that succeeded. */
  readonly pass: number;
  /** Total trees grown, across all passes, including the successful one. */
  readonly attempts: number;
}

/**
 * Picks `count` dead ends to become stations, or returns null if the tree has too few
 * suitable ones. The first is random. Each next one is picked at random from the few
 * candidates farthest from the stations already chosen, which spreads stations out.
 * Two stations are never side by side.
 */
export function pickStations(
  rng: Rng,
  tree: TrackTree,
  count: number,
  minDepth: number,
  maxDepth: number,
): number[] | null {
  const candidates = deadEnds(tree).filter((cell) => {
    const depth = tree.depth[cell] ?? NO_CELL;
    return depth >= minDepth && depth <= maxDepth;
  });
  if (candidates.length < count) return null;

  const cellOf = (index: number): Cell => indexToCell(tree, index);
  const first = rng.pick(candidates);
  const chosen = [first];
  let remaining = candidates.filter((cell) => cell !== first);

  while (chosen.length < count) {
    const scored = remaining
      .map((cell) => ({
        cell,
        distance: Math.min(...chosen.map((c) => manhattanDistance(cellOf(cell), cellOf(c)))),
      }))
      .filter((s) => s.distance >= 2);
    if (scored.length === 0) return null;

    // Array.prototype.sort is stable, so equal distances keep their (deterministic) order.
    scored.sort((a, b) => b.distance - a.distance);
    const pick = rng.pick(scored.slice(0, FARTHEST_CHOICES)).cell;
    chosen.push(pick);
    remaining = remaining.filter((cell) => cell !== pick);
  }
  return chosen;
}

/**
 * Keeps only the track on the way to the chosen stations, gives each station a line and
 * each switch a random starting route, and builds the final Layout.
 */
function assembleLayout(
  rng: Rng,
  tree: TrackTree,
  stations: readonly number[],
  config: LevelConfig,
  seed: number,
): Layout {
  // Mark every cell on the path from each station back to the tunnel.
  const kept = new Set<number>();
  for (const station of stations) {
    let cell = station;
    while (cell !== NO_CELL && !kept.has(cell)) {
      kept.add(cell);
      cell = tree.parent[cell] ?? NO_CELL;
    }
  }

  const lineAt = new Map<number, LineId>();
  rng.shuffle(config.lineIds).forEach((lineId, i) => lineAt.set(stations[i] as number, lineId));

  // A cell is a switch when both of its children are kept. Routes are drawn in cell order
  // (reading order), which is the same order as the switch ids.
  const routeAt = new Map<number, Route>();
  const keptCells = treeCells(tree).filter((cell) => kept.has(cell));
  for (const cell of keptCells.slice().sort((a, b) => a - b)) {
    const keptKids = (tree.children[cell] ?? []).filter((kid) => kept.has(kid));
    if (keptKids.length === 2) routeAt.set(cell, rng.int(2) === 1 ? 1 : 0);
  }

  const cells: TrackCellSpec[] = keptCells.map((cell) => {
    const parent = tree.parent[cell] ?? NO_CELL;
    const lineId = lineAt.get(cell);
    const initialRoute = routeAt.get(cell);
    return {
      ...indexToCell(tree, cell),
      ...(parent !== NO_CELL && { from: indexToCell(tree, parent) }),
      ...(lineId !== undefined && { lineId }),
      ...(initialRoute !== undefined && { initialRoute }),
    };
  });

  return buildLayout({ level: config.level, seed, cols: config.cols, rows: config.rows, cells });
}

/**
 * Generates the level map for a level and seed, plus how many passes and attempts it took.
 * The same level and seed always give the same result. Throws only if every pass fails,
 * which the tests check never happens in practice.
 */
export function generateLevelWithStats(level: number, seed: number): GenerationResult {
  const config = getLevelConfig(level);
  const rng = new Rng(deriveSeed(seed, 'layout'));
  let attempts = 0;

  for (let pass = 0; pass < GENERATOR_PASSES.length; pass++) {
    const rules = GENERATOR_PASSES[pass] as GeneratorPass;
    const maxDepth = Math.round((config.cols + config.rows) * rules.maxDepthMultiplier);

    for (let attempt = 0; attempt < ATTEMPTS_PER_PASS; attempt++) {
      attempts++;
      const tree = growTrackTree(rng, config, {
        minSwitchDepth: MIN_SWITCH_DEPTH,
        switchGap: rules.switchGap,
      });
      const stations = pickStations(rng, tree, config.stations, rules.minStationDepth, maxDepth);
      if (stations) {
        return { layout: assembleLayout(rng, tree, stations, config, seed), pass, attempts };
      }
    }
  }
  throw new Error(`Could not generate level ${level} for seed ${seed}`);
}

/** Generates the level map for a level and seed. Same input, same map, on every machine. */
export function generateLevel(level: number, seed: number): Layout {
  return generateLevelWithStats(level, seed).layout;
}
