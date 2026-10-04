import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chebyshevDistance,
  directionBetween,
  indexToCell,
  inwardDirection,
  isCornerCell,
  isEdgeCell,
  manhattanDistance,
  type Cell,
  type GridSize,
} from '../src/grid.js';
import { getLevelConfig } from '../src/levels.js';
import { Rng } from '../src/rng.js';
import {
  DEFAULT_GROWTH_RULES,
  MIN_SWITCH_DEPTH,
  NO_CELL,
  deadEnds,
  growTrackTree,
  splitCells,
  treeCells,
  treeToAscii,
  type GrowthRules,
  type SwitchGap,
  type TrackTree,
} from '../src/tree.js';

const SEEDS_PER_SIZE = 150;
const BOARD_SIZES: GridSize[] = [
  { cols: 5, rows: 4 },
  { cols: 7, rows: 5 },
  { cols: 9, rows: 7 },
];

/** Checks every structural rule of a grown tree. Throws on the first broken rule. */
function expectValidTree(tree: TrackTree, rules: GrowthRules): void {
  const cellCount = tree.cols * tree.rows;
  const tunnel = indexToCell(tree, tree.tunnel);

  // The tunnel sits on an edge (not a corner) with one track pointing inward.
  expect(isEdgeCell(tree, tunnel) && !isCornerCell(tree, tunnel)).toBe(true);
  expect(tree.depth[tree.tunnel]).toBe(0);
  expect(tree.parent[tree.tunnel]).toBe(NO_CELL);
  const first = tree.children[tree.tunnel] ?? [];
  expect(first).toHaveLength(1);
  expect(directionBetween(tunnel, indexToCell(tree, first[0] as number))).toBe(
    inwardDirection(tree, tunnel),
  );

  let trackCount = 0;
  for (let cell = 0; cell < cellCount; cell++) {
    const kids = tree.children[cell] ?? [];
    const depth = tree.depth[cell] as number;
    if (depth === NO_CELL) {
      expect(kids).toHaveLength(0);
      expect(tree.parent[cell]).toBe(NO_CELL);
      continue;
    }
    trackCount++;
    expect(kids.length).toBeLessThanOrEqual(2);
    for (const kid of kids) {
      // Each child is a neighbor, points back to this cell and is one step deeper.
      directionBetween(indexToCell(tree, cell), indexToCell(tree, kid));
      expect(tree.parent[kid]).toBe(cell);
      expect(tree.depth[kid]).toBe(depth + 1);
    }
  }

  // Every track cell can be reached from the tunnel.
  expect(treeCells(tree)).toHaveLength(trackCount);

  // Switch rules: deep enough, and far enough from each other.
  const splits = splitCells(tree);
  for (const s of splits) expect(tree.depth[s]).toBeGreaterThanOrEqual(rules.minSwitchDepth);
  for (let i = 0; i < splits.length; i++) {
    for (let j = i + 1; j < splits.length; j++) {
      const a = indexToCell(tree, splits[i] as number);
      const b = indexToCell(tree, splits[j] as number);
      const distance =
        rules.switchGap === 'touching' ? chebyshevDistance(a, b) : manhattanDistance(a, b);
      expect(distance).toBeGreaterThanOrEqual(2);
    }
  }

  // In a tree where every split has two exits, there is always one more dead end than splits.
  expect(deadEnds(tree)).toHaveLength(splits.length + 1);
}

describe('growTrackTree', () => {
  afterEach(() => vi.restoreAllMocks());

  it('grows the same tree for the same seed', () => {
    const size = { cols: 9, rows: 7 };
    expect(growTrackTree(new Rng(123), size)).toEqual(growTrackTree(new Rng(123), size));
  });

  it('grows different trees for different seeds', () => {
    const size = { cols: 9, rows: 7 };
    expect(growTrackTree(new Rng(1), size)).not.toEqual(growTrackTree(new Rng(2), size));
  });

  // Stored runs are replayed by regrowing their level, so this output must never change.
  it('matches the known tree for seed 42', () => {
    const tree = growTrackTree(new Rng(42), { cols: 5, rows: 4 });
    expect(treeToAscii(tree)).toBe(
      [
        '#-#-#-#-#',
        '|       |',
        '# #-#-#-S',
        '| |     |',
        '# #-# o #',
        '|   | | |',
        '#-o T #-#',
      ].join('\n'),
    );
  });

  it('never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    growTrackTree(new Rng(5), { cols: 9, rows: 7 });
    expect(spy).not.toHaveBeenCalled();
  });

  describe.each<SwitchGap>(['touching', 'sideBySide'])('with switchGap "%s"', (switchGap) => {
    const rules: GrowthRules = { minSwitchDepth: MIN_SWITCH_DEPTH, switchGap };

    it.each(BOARD_SIZES)('grows valid trees on a $cols x $rows board', (size) => {
      for (let seed = 0; seed < SEEDS_PER_SIZE; seed++) {
        expectValidTree(growTrackTree(new Rng(seed), size, rules), rules);
      }
    });
  });

  it('keeps a larger minimum switch depth when asked', () => {
    const rules: GrowthRules = { minSwitchDepth: 7, switchGap: 'touching' };
    for (let seed = 0; seed < SEEDS_PER_SIZE; seed++) {
      expectValidTree(growTrackTree(new Rng(seed), { cols: 9, rows: 7 }, rules), rules);
    }
  });

  it('allows diagonal switches with the looser "sideBySide" rule', () => {
    const rules: GrowthRules = { minSwitchDepth: MIN_SWITCH_DEPTH, switchGap: 'sideBySide' };
    let diagonalPairs = 0;
    for (let seed = 0; seed < 500; seed++) {
      const tree = growTrackTree(new Rng(seed), { cols: 9, rows: 7 }, rules);
      const splits = splitCells(tree).map((s) => indexToCell(tree, s));
      for (let i = 0; i < splits.length; i++) {
        for (let j = i + 1; j < splits.length; j++) {
          if (chebyshevDistance(splits[i] as Cell, splits[j] as Cell) === 1) diagonalPairs++;
        }
      }
    }
    expect(diagonalPairs).toBeGreaterThan(0);
  });

  it('usually grows enough track and dead ends for the biggest levels', () => {
    const config = getLevelConfig(20);
    let totalCells = 0;
    let enoughDeadEnds = 0;
    for (let seed = 0; seed < 500; seed++) {
      const tree = growTrackTree(new Rng(seed), config, DEFAULT_GROWTH_RULES);
      totalCells += treeCells(tree).length;
      if (deadEnds(tree).length >= config.stations) enoughDeadEnds++;
    }
    // Trees should cover most of the board, and a fair share should fit 10 stations.
    expect(totalCells / 500).toBeGreaterThan(40);
    expect(enoughDeadEnds).toBeGreaterThan(25);
  });
});

describe('tree queries', () => {
  const tree = growTrackTree(new Rng(42), { cols: 5, rows: 4 });

  it('lists track cells with the tunnel first', () => {
    const cells = treeCells(tree);
    expect(cells[0]).toBe(tree.tunnel);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('finds the dead ends and the split', () => {
    expect(splitCells(tree).map((c) => indexToCell(tree, c))).toEqual([{ x: 4, y: 1 }]);
    expect(deadEnds(tree).map((c) => indexToCell(tree, c))).toEqual([
      { x: 3, y: 2 },
      { x: 1, y: 3 },
    ]);
  });
});
