/** Symbols drawn on trains and stations, so the game works without color vision. */
export type LineSymbol =
  | 'circle'
  | 'square'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'plus'
  | 'hexagon'
  | 'ring'
  | 'x'
  | 'bars';

export interface LineDef {
  /** Position in the order of introduction, 0-9. */
  readonly id: number;
  /** Stable name the web app uses to look up the line's color, e.g. "red". */
  readonly key: string;
  /** Name shown to the player. */
  readonly name: string;
  readonly symbol: LineSymbol;
}

/**
 * The 10 train lines, in the order they are introduced. A level with n stations uses the
 * first n lines. Colors live in the web app's theme, not here: the engine only needs to know
 * which line a train belongs to.
 */
export const LINES = [
  { id: 0, key: 'red', name: 'Red', symbol: 'circle' },
  { id: 1, key: 'blue', name: 'Blue', symbol: 'square' },
  { id: 2, key: 'yellow', name: 'Yellow', symbol: 'triangle' },
  { id: 3, key: 'green', name: 'Green', symbol: 'diamond' },
  { id: 4, key: 'purple', name: 'Purple', symbol: 'star' },
  { id: 5, key: 'orange', name: 'Orange', symbol: 'plus' },
  { id: 6, key: 'teal', name: 'Teal', symbol: 'hexagon' },
  { id: 7, key: 'pink', name: 'Pink', symbol: 'ring' },
  { id: 8, key: 'brown', name: 'Brown', symbol: 'x' },
  { id: 9, key: 'graphite', name: 'Graphite', symbol: 'bars' },
] as const satisfies readonly LineDef[];

/** A line's id, 0-9. */
export type LineId = (typeof LINES)[number]['id'];
/** A line's key, e.g. "red". */
export type LineKey = (typeof LINES)[number]['key'];

export function isLineId(value: unknown): value is LineId {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < LINES.length;
}

export function getLine(id: LineId): (typeof LINES)[LineId] {
  return LINES[id];
}
