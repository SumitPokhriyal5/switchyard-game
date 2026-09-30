/**
 * Grid helpers. Cells are addressed by column (x) and row (y), starting at the top-left.
 * y grows downward, the same as screen coordinates, so "N" means up on the screen.
 */

export type Direction = 'N' | 'E' | 'S' | 'W';

/** All four directions, in a fixed order. Loops use this order so results are deterministic. */
export const DIRECTIONS = ['N', 'E', 'S', 'W'] as const satisfies readonly Direction[];

export interface GridSize {
  readonly cols: number;
  readonly rows: number;
}

export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** How x and y change when moving one cell in each direction. */
export const DIRECTION_VECTORS: Readonly<Record<Direction, { dx: number; dy: number }>> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

const OPPOSITE: Readonly<Record<Direction, Direction>> = { N: 'S', E: 'W', S: 'N', W: 'E' };

export function oppositeOf(direction: Direction): Direction {
  return OPPOSITE[direction];
}

export function isInsideGrid(size: GridSize, cell: Cell): boolean {
  return (
    Number.isInteger(cell.x) &&
    Number.isInteger(cell.y) &&
    cell.x >= 0 &&
    cell.y >= 0 &&
    cell.x < size.cols &&
    cell.y < size.rows
  );
}

/** Row-major index of a cell: 0 is top-left, then left to right, then row by row. */
export function cellToIndex(size: GridSize, cell: Cell): number {
  if (!isInsideGrid(size, cell)) {
    throw new RangeError(`Cell (${cell.x}, ${cell.y}) is outside a ${size.cols}x${size.rows} grid`);
  }
  return cell.y * size.cols + cell.x;
}

export function indexToCell(size: GridSize, index: number): Cell {
  if (!Number.isInteger(index) || index < 0 || index >= size.cols * size.rows) {
    throw new RangeError(`Index ${index} is outside a ${size.cols}x${size.rows} grid`);
  }
  return { x: index % size.cols, y: Math.floor(index / size.cols) };
}

/** The cell one step away in a direction. Does not check the grid bounds. */
export function offsetCell(cell: Cell, direction: Direction): Cell {
  const { dx, dy } = DIRECTION_VECTORS[direction];
  return { x: cell.x + dx, y: cell.y + dy };
}

/** The neighbor in a direction, or null if it would be outside the grid. */
export function neighborCell(size: GridSize, cell: Cell, direction: Direction): Cell | null {
  const next = offsetCell(cell, direction);
  return isInsideGrid(size, next) ? next : null;
}

/** All neighbors inside the grid, in N, E, S, W order. */
export function neighborCells(
  size: GridSize,
  cell: Cell,
): Array<{ direction: Direction; cell: Cell }> {
  const result: Array<{ direction: Direction; cell: Cell }> = [];
  for (const direction of DIRECTIONS) {
    const next = neighborCell(size, cell, direction);
    if (next) result.push({ direction, cell: next });
  }
  return result;
}

/** The direction from one cell to a cell that shares a side with it. */
export function directionBetween(from: Cell, to: Cell): Direction {
  for (const direction of DIRECTIONS) {
    const { dx, dy } = DIRECTION_VECTORS[direction];
    if (to.x - from.x === dx && to.y - from.y === dy) return direction;
  }
  throw new RangeError(`Cells (${from.x}, ${from.y}) and (${to.x}, ${to.y}) are not neighbors`);
}

/** Steps needed to walk between two cells without moving diagonally. */
export function manhattanDistance(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Like Manhattan distance, but a diagonal step counts as 1. Two cells touch when this is 1. */
export function chebyshevDistance(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function isEdgeCell(size: GridSize, cell: Cell): boolean {
  return (
    isInsideGrid(size, cell) &&
    (cell.x === 0 || cell.y === 0 || cell.x === size.cols - 1 || cell.y === size.rows - 1)
  );
}

export function isCornerCell(size: GridSize, cell: Cell): boolean {
  return (
    isInsideGrid(size, cell) &&
    (cell.x === 0 || cell.x === size.cols - 1) &&
    (cell.y === 0 || cell.y === size.rows - 1)
  );
}

/** For an edge cell that is not a corner, the direction pointing into the grid. */
export function inwardDirection(size: GridSize, cell: Cell): Direction {
  if (!isEdgeCell(size, cell) || isCornerCell(size, cell)) {
    throw new RangeError(`Cell (${cell.x}, ${cell.y}) is not a non-corner edge cell`);
  }
  if (cell.y === 0) return 'S';
  if (cell.y === size.rows - 1) return 'N';
  if (cell.x === 0) return 'E';
  return 'W';
}

/**
 * Every edge cell except the corners, in a fixed order: top row, right column, bottom row,
 * left column. These are the places the tunnel can go.
 */
export function edgeCells(size: GridSize): Cell[] {
  const cells: Cell[] = [];
  for (let x = 1; x < size.cols - 1; x++) cells.push({ x, y: 0 });
  for (let y = 1; y < size.rows - 1; y++) cells.push({ x: size.cols - 1, y });
  for (let x = 1; x < size.cols - 1; x++) cells.push({ x, y: size.rows - 1 });
  for (let y = 1; y < size.rows - 1; y++) cells.push({ x: 0, y });
  return cells;
}
