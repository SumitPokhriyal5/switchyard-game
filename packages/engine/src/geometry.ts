import { UNITS_PER_CELL } from './constants.js';
import { oppositeOf, type Direction } from './grid.js';
import { getNode, type Layout, type LayoutNode } from './layout.js';

/**
 * Track geometry. Inside a cell, track runs between the midpoints of the cell's sides:
 * a straight line between opposite sides, or a quarter circle around the corner shared by
 * two neighboring sides. The tunnel's piece runs from the cell center out to one side, and a
 * station's piece runs from one side in to the center.
 *
 * Positions are in cells, with (0, 0) at the top-left of the cell (or board) and y going down.
 * Angles are in radians, in the direction of travel: 0 = east, PI/2 = south, PI = west.
 */

/** Length of a quarter-circle piece in distance units: round(6000 x PI / 4). */
export const CURVE_LENGTH_UNITS = 4712;
/** Length of the tunnel and station pieces, which only cover half a cell. */
export const HALF_PIECE_LENGTH_UNITS = UNITS_PER_CELL / 2;

/** One piece of track inside a cell. Null means the cell center. */
export interface TrackPiece {
  /** The side trains come in through, or null for the tunnel (trains start at the center). */
  readonly entry: Direction | null;
  /** The side trains leave through, or null for a station (trains stop at the center). */
  readonly exit: Direction | null;
}

export type PieceShape = 'straight' | 'curve' | 'half';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A position plus the direction of travel there. */
export interface Pose extends Point {
  readonly angle: number;
}

const SIDE_MIDPOINTS: Readonly<Record<Direction, Point>> = {
  N: { x: 0.5, y: 0 },
  E: { x: 1, y: 0.5 },
  S: { x: 0.5, y: 1 },
  W: { x: 0, y: 0.5 },
};
const CENTER: Point = { x: 0.5, y: 0.5 };

/** The midpoint of a cell side, in cell coordinates. */
export function sideMidpoint(side: Direction): Point {
  return SIDE_MIDPOINTS[side];
}

export function pieceShape(piece: TrackPiece): PieceShape {
  if (piece.entry === null && piece.exit === null) {
    throw new RangeError('A track piece needs an entry, an exit, or both');
  }
  if (piece.entry === null || piece.exit === null) return 'half';
  if (piece.entry === piece.exit) {
    throw new RangeError(`A track piece cannot enter and leave through side ${piece.entry}`);
  }
  return oppositeOf(piece.entry) === piece.exit ? 'straight' : 'curve';
}

/**
 * Length of a piece in distance units. These are whole numbers, because the simulation
 * moves trains with integer math.
 */
export function pieceLengthUnits(piece: TrackPiece): number {
  const shape = pieceShape(piece);
  if (shape === 'half') return HALF_PIECE_LENGTH_UNITS;
  return shape === 'straight' ? UNITS_PER_CELL : CURVE_LENGTH_UNITS;
}

/**
 * The position and travel direction at fraction `t` of the way along a piece (0 = start,
 * 1 = end), in cell coordinates. `t` is clamped to [0, 1].
 * This uses floating-point math and is only for drawing; the simulation never depends on it.
 */
export function pointOnPiece(piece: TrackPiece, t: number): Pose {
  const shape = pieceShape(piece);
  const f = Math.min(1, Math.max(0, t));
  const from = piece.entry === null ? CENTER : SIDE_MIDPOINTS[piece.entry];
  const to = piece.exit === null ? CENTER : SIDE_MIDPOINTS[piece.exit];

  if (shape !== 'curve') {
    return {
      x: from.x + (to.x - from.x) * f,
      y: from.y + (to.y - from.y) * f,
      angle: Math.atan2(to.y - from.y, to.x - from.x),
    };
  }

  // Quarter circle of radius 0.5 around the corner the two sides share.
  const sides = [piece.entry, piece.exit];
  const cx = sides.includes('E') ? 1 : 0;
  const cy = sides.includes('S') ? 1 : 0;
  const start = Math.atan2(from.y - cy, from.x - cx);
  let sweep = Math.atan2(to.y - cy, to.x - cx) - start;
  if (sweep > Math.PI) sweep -= 2 * Math.PI;
  if (sweep < -Math.PI) sweep += 2 * Math.PI;

  const a = start + sweep * f;
  return {
    x: cx + 0.5 * Math.cos(a),
    y: cy + 0.5 * Math.sin(a),
    // The tangent of the circle, pointing the way the train is going.
    angle: Math.atan2(Math.cos(a) * sweep, -Math.sin(a) * sweep),
  };
}

/** The pieces drawn in a node's cell: two for a switch, one for everything else. */
export function nodePieces(node: LayoutNode): TrackPiece[] {
  if (node.kind === 'station') return [{ entry: node.entry, exit: null }];
  return node.exits.map((exit) => ({ entry: node.entry, exit }));
}

/**
 * The piece a train is on: the given exit of a switch, the only exit of tunnel and track
 * cells, or the half piece into a station (where `exitIndex` is ignored).
 */
export function pieceForTrain(node: LayoutNode, exitIndex: number): TrackPiece {
  if (node.kind === 'station') return { entry: node.entry, exit: null };
  const exit = node.exits[node.kind === 'switch' ? exitIndex : 0];
  if (exit === undefined) {
    throw new RangeError(`Node ${node.id} has no exit ${exitIndex}`);
  }
  return { entry: node.entry, exit };
}

/**
 * Where a train is on the board, in board coordinates (cells from the top-left of the board),
 * given the node it is on, the exit it is heading for, and how far into the piece it is.
 */
export function trainPose(
  layout: Layout,
  nodeId: number,
  exitIndex: number,
  progressUnits: number,
): Pose {
  const node = getNode(layout, nodeId);
  const piece = pieceForTrain(node, exitIndex);
  const local = pointOnPiece(piece, progressUnits / pieceLengthUnits(piece));
  return { x: node.x + local.x, y: node.y + local.y, angle: local.angle };
}
