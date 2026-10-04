import {
  chebyshevDistance,
  directionBetween,
  edgeCells,
  indexToCell,
  inwardDirection,
  manhattanDistance,
  neighborCells,
  cellToIndex,
  offsetCell,
  type GridSize,
} from './grid.js';
import type { Rng } from './rng.js';

/** Used in the tree arrays for "no cell", e.g. the tunnel's parent. */
export const NO_CELL = -1;

/**
 * A switch must be at least this many cells from the tunnel. With the tunnel at depth 0,
 * depth 4 leaves 3 plain track cells before the first switch, so the player has time to think.
 */
export const MIN_SWITCH_DEPTH = 4;

/** How often growth continues from the newest cell instead of a random one. */
const EXTEND_NEWEST_CHANCE = 0.65;
/**
 * How often a cell that already has one exit stops growing. Limits branching.
 * The original spec used 0.55, but the switch spacing rules already block many splits,
 * so 0.3 is used to keep enough dead ends for the stations.
 */
const STOP_BRANCHING_CHANCE = 0.3;
/** How often the track keeps going straight when it can. */
const GO_STRAIGHT_CHANCE = 0.45;

/**
 * How far apart two switches must be.
 * - 'touching': not in neighboring cells, diagonals included.
 * - 'sideBySide': not in cells that share a side. Diagonal neighbors are allowed.
 */
export type SwitchGap = 'touching' | 'sideBySide';

export interface GrowthRules {
  /** Smallest depth (cells from the tunnel) at which the track may split. */
  readonly minSwitchDepth: number;
  readonly switchGap: SwitchGap;
}

/** The strictest rules. The generator loosens switchGap only when a level cannot fit them. */
export const DEFAULT_GROWTH_RULES: GrowthRules = {
  minSwitchDepth: MIN_SWITCH_DEPTH,
  switchGap: 'touching',
};

/**
 * A tree of track grown from the tunnel. All arrays are indexed by cell index
 * (row-major, see cellToIndex). Cells with no track have depth NO_CELL.
 */
export interface TrackTree extends GridSize {
  /** Cell index of the tunnel. */
  readonly tunnel: number;
  /** Parent cell index, or NO_CELL for the tunnel and for empty cells. */
  readonly parent: readonly number[];
  /** Child cell indexes, in the order they were grown. At most 2; the tunnel has exactly 1. */
  readonly children: readonly (readonly number[])[];
  /** Cells from the tunnel, or NO_CELL for empty cells. */
  readonly depth: readonly number[];
}

/** True when two switch cells are far enough apart under the given rule. */
export function switchesFarEnough(size: GridSize, a: number, b: number, gap: SwitchGap): boolean {
  const ca = indexToCell(size, a);
  const cb = indexToCell(size, b);
  return gap === 'touching' ? chebyshevDistance(ca, cb) >= 2 : manhattanDistance(ca, cb) >= 2;
}

/**
 * Grows a random tree of track across the grid, starting from a tunnel on an edge.
 *
 * Growth keeps an "active" list of cells that may still get new track:
 * - Most of the time it extends the newest active cell, which makes long winding lines.
 *   Otherwise it extends a random one, which starts side branches.
 * - A cell with one exit stops growing with some chance. It also stops if a split there
 *   would break the switch rules, so every cell with two exits is a valid switch spot.
 * - When going straight is possible, the track does so with some chance, which makes
 *   the network look less twisty.
 *
 * Only `rng` is used for randomness, so the same seed always grows the same tree.
 */
export function growTrackTree(
  rng: Rng,
  size: GridSize,
  rules: GrowthRules = DEFAULT_GROWTH_RULES,
): TrackTree {
  const cellCount = size.cols * size.rows;
  const parent: number[] = new Array(cellCount).fill(NO_CELL);
  const children: number[][] = Array.from({ length: cellCount }, () => []);
  const depth: number[] = new Array(cellCount).fill(NO_CELL);

  // 1. The tunnel goes on a random edge cell (not a corner). Its one track points inward.
  const tunnelCell = rng.pick(edgeCells(size));
  const tunnel = cellToIndex(size, tunnelCell);
  const first = cellToIndex(size, offsetCell(tunnelCell, inwardDirection(size, tunnelCell)));
  depth[tunnel] = 0;
  depth[first] = 1;
  parent[first] = tunnel;
  children[tunnel]?.push(first);

  const switches: number[] = [];
  const canSplit = (cell: number): boolean =>
    (depth[cell] ?? 0) >= rules.minSwitchDepth &&
    switches.every((other) => switchesFarEnough(size, cell, other, rules.switchGap));

  // 2. Grow from the active cells until none is left.
  const active: number[] = [first];
  while (active.length > 0) {
    const pos = rng.chance(EXTEND_NEWEST_CHANCE) ? active.length - 1 : rng.int(active.length);
    const cell = active[pos] as number;
    const kids = children[cell] as number[];

    if (kids.length === 1 && (rng.chance(STOP_BRANCHING_CHANCE) || !canSplit(cell))) {
      active.splice(pos, 1);
      continue;
    }

    const here = indexToCell(size, cell);
    const free = neighborCells(size, here).filter(
      (n) => depth[cellToIndex(size, n.cell)] === NO_CELL,
    );
    if (free.length === 0) {
      active.splice(pos, 1);
      continue;
    }

    const heading = directionBetween(indexToCell(size, parent[cell] as number), here);
    const straight = free.find((n) => n.direction === heading);
    const chosen = straight && rng.chance(GO_STRAIGHT_CHANCE) ? straight : rng.pick(free);
    const next = cellToIndex(size, chosen.cell);

    depth[next] = (depth[cell] ?? 0) + 1;
    parent[next] = cell;
    kids.push(next);
    active.push(next);
    if (kids.length === 2) {
      switches.push(cell);
      active.splice(pos, 1); // a cell has at most two exits
    }
  }

  return { cols: size.cols, rows: size.rows, tunnel, parent, children, depth };
}

/** Cell indexes of every cell with track, tunnel first. */
export function treeCells(tree: TrackTree): number[] {
  const cells: number[] = [];
  const queue = [tree.tunnel];
  while (queue.length > 0) {
    const cell = queue.shift() as number;
    cells.push(cell);
    queue.push(...(tree.children[cell] ?? []));
  }
  return cells;
}

/** Cell indexes of the dead ends: track cells with no exits. */
export function deadEnds(tree: TrackTree): number[] {
  return treeCells(tree).filter((cell) => (tree.children[cell]?.length ?? 0) === 0);
}

/** Cell indexes of the cells where the track splits in two. */
export function splitCells(tree: TrackTree): number[] {
  return treeCells(tree).filter((cell) => (tree.children[cell]?.length ?? 0) === 2);
}

/**
 * Draws the tree as text, for tests and debugging.
 * T = tunnel, S = split, o = dead end, # = plain track, . = empty.
 */
export function treeToAscii(tree: TrackTree): string {
  const width = tree.cols * 2 - 1;
  const lines: string[][] = Array.from({ length: tree.rows * 2 - 1 }, () =>
    new Array<string>(width).fill(' '),
  );
  for (let cell = 0; cell < tree.cols * tree.rows; cell++) {
    const { x, y } = indexToCell(tree, cell);
    const kids = tree.children[cell]?.length ?? 0;
    const symbol =
      cell === tree.tunnel
        ? 'T'
        : tree.depth[cell] === NO_CELL
          ? '.'
          : kids === 2
            ? 'S'
            : kids === 0
              ? 'o'
              : '#';
    (lines[y * 2] as string[])[x * 2] = symbol;

    const from = tree.parent[cell] ?? NO_CELL;
    if (from !== NO_CELL) {
      const p = indexToCell(tree, from);
      (lines[y + p.y] as string[])[x + p.x] = p.y === y ? '-' : '|';
    }
  }
  return lines.map((line) => line.join('').trimEnd()).join('\n');
}
