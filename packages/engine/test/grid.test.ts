import { describe, expect, it } from 'vitest';
import {
  DIRECTIONS,
  cellToIndex,
  chebyshevDistance,
  directionBetween,
  edgeCells,
  indexToCell,
  inwardDirection,
  isCornerCell,
  isEdgeCell,
  isInsideGrid,
  manhattanDistance,
  neighborCell,
  neighborCells,
  offsetCell,
  oppositeOf,
  type Cell,
  type GridSize,
} from '../src/grid.js';

const SIZE: GridSize = { cols: 5, rows: 4 };
const BIG: GridSize = { cols: 9, rows: 7 };

/** Every cell of a grid, in row-major order. */
function allCells(size: GridSize): Cell[] {
  return Array.from({ length: size.cols * size.rows }, (_, i) => indexToCell(size, i));
}

describe('directions', () => {
  it('lists the four directions in N, E, S, W order', () => {
    expect(DIRECTIONS).toEqual(['N', 'E', 'S', 'W']);
  });

  it('pairs each direction with its opposite', () => {
    expect(oppositeOf('N')).toBe('S');
    expect(oppositeOf('E')).toBe('W');
    for (const d of DIRECTIONS) expect(oppositeOf(oppositeOf(d))).toBe(d);
  });

  it('moves one cell and back again', () => {
    const start = { x: 2, y: 2 };
    for (const d of DIRECTIONS) {
      expect(offsetCell(offsetCell(start, d), oppositeOf(d))).toEqual(start);
    }
  });

  it('treats N as up on the screen (y goes down)', () => {
    expect(offsetCell({ x: 2, y: 2 }, 'N')).toEqual({ x: 2, y: 1 });
    expect(offsetCell({ x: 2, y: 2 }, 'E')).toEqual({ x: 3, y: 2 });
  });
});

describe('cell indexes', () => {
  it('round-trips every cell of a 9x7 grid', () => {
    allCells(BIG).forEach((cell, index) => {
      expect(cellToIndex(BIG, cell)).toBe(index);
    });
  });

  it('numbers cells row by row', () => {
    expect(cellToIndex(SIZE, { x: 0, y: 0 })).toBe(0);
    expect(cellToIndex(SIZE, { x: 4, y: 0 })).toBe(4);
    expect(cellToIndex(SIZE, { x: 0, y: 1 })).toBe(5);
    expect(indexToCell(SIZE, 19)).toEqual({ x: 4, y: 3 });
  });

  it.each([
    { x: -1, y: 0 },
    { x: 5, y: 0 },
    { x: 0, y: 4 },
    { x: 1.5, y: 1 },
  ])('rejects the cell %o', (cell) => {
    expect(isInsideGrid(SIZE, cell)).toBe(false);
    expect(() => cellToIndex(SIZE, cell)).toThrow(RangeError);
  });

  it.each([-1, 20, 2.5])('rejects the index %s', (index) => {
    expect(() => indexToCell(SIZE, index)).toThrow(RangeError);
  });
});

describe('neighbors', () => {
  it('has 2 neighbors in a corner, 3 on an edge and 4 in the middle', () => {
    expect(neighborCells(SIZE, { x: 0, y: 0 })).toHaveLength(2);
    expect(neighborCells(SIZE, { x: 2, y: 0 })).toHaveLength(3);
    expect(neighborCells(SIZE, { x: 2, y: 2 })).toHaveLength(4);
  });

  it('returns neighbors in N, E, S, W order', () => {
    expect(neighborCells(SIZE, { x: 2, y: 2 }).map((n) => n.direction)).toEqual([
      'N',
      'E',
      'S',
      'W',
    ]);
  });

  it('returns null outside the grid', () => {
    expect(neighborCell(SIZE, { x: 0, y: 0 }, 'N')).toBeNull();
    expect(neighborCell(SIZE, { x: 0, y: 0 }, 'W')).toBeNull();
    expect(neighborCell(SIZE, { x: 0, y: 0 }, 'E')).toEqual({ x: 1, y: 0 });
  });
});

describe('directionBetween', () => {
  it('finds the direction to each neighbor', () => {
    const from = { x: 2, y: 2 };
    for (const d of DIRECTIONS) expect(directionBetween(from, offsetCell(from, d))).toBe(d);
  });

  it.each([
    [
      { x: 1, y: 1 },
      { x: 1, y: 1 },
    ],
    [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ],
    [
      { x: 1, y: 1 },
      { x: 3, y: 1 },
    ],
  ])('rejects %o and %o, which do not share a side', (a, b) => {
    expect(() => directionBetween(a, b)).toThrow(RangeError);
  });
});

describe('distances', () => {
  it.each([
    // a, b, manhattan, chebyshev
    [{ x: 0, y: 0 }, { x: 0, y: 0 }, 0, 0],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, 1, 1],
    [{ x: 0, y: 0 }, { x: 1, y: 1 }, 2, 1],
    [{ x: 1, y: 2 }, { x: 4, y: 0 }, 5, 3],
  ])('%o to %o: manhattan %i, chebyshev %i', (a, b, m, c) => {
    expect(manhattanDistance(a, b)).toBe(m);
    expect(manhattanDistance(b, a)).toBe(m);
    expect(chebyshevDistance(a, b)).toBe(c);
    expect(chebyshevDistance(b, a)).toBe(c);
  });
});

describe('edges and corners', () => {
  it('finds exactly 4 corners', () => {
    expect(allCells(BIG).filter((c) => isCornerCell(BIG, c))).toEqual([
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 0, y: 6 },
      { x: 8, y: 6 },
    ]);
  });

  it('counts edge cells correctly', () => {
    const edges = allCells(BIG).filter((c) => isEdgeCell(BIG, c));
    expect(edges).toHaveLength(2 * BIG.cols + 2 * BIG.rows - 4);
  });

  it('lists every non-corner edge cell once, in a fixed order', () => {
    const cells = edgeCells(SIZE);
    expect(cells).toHaveLength(2 * (SIZE.cols - 2) + 2 * (SIZE.rows - 2));
    expect(new Set(cells.map((c) => cellToIndex(SIZE, c))).size).toBe(cells.length);
    for (const c of cells) {
      expect(isEdgeCell(SIZE, c)).toBe(true);
      expect(isCornerCell(SIZE, c)).toBe(false);
    }
    expect(cells.slice(0, 4)).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 1 },
    ]);
  });

  it('points inward from every non-corner edge cell', () => {
    for (const cell of edgeCells(BIG)) {
      const inside = offsetCell(cell, inwardDirection(BIG, cell));
      expect(isInsideGrid(BIG, inside)).toBe(true);
      expect(isEdgeCell(BIG, inside)).toBe(false);
    }
  });

  it.each([
    { x: 0, y: 0 },
    { x: 2, y: 2 },
    { x: 9, y: 0 },
  ])('has no inward direction for %o', (cell) => {
    expect(() => inwardDirection(BIG, cell)).toThrow(RangeError);
  });
});
