import { describe, expect, it } from 'vitest';
import { UNITS_PER_CELL } from '../src/constants.js';
import { generateLevel } from '../src/generator.js';
import {
  CURVE_LENGTH_UNITS,
  HALF_PIECE_LENGTH_UNITS,
  nodePieces,
  pieceForTrain,
  pieceLengthUnits,
  pieceShape,
  pointOnPiece,
  sideMidpoint,
  trainPose,
  type Pose,
  type TrackPiece,
} from '../src/geometry.js';
import { DIRECTIONS, oppositeOf, type Direction } from '../src/grid.js';
import { getNode } from '../src/layout.js';
import { smallLayout } from './helpers/layouts.js';

const EPSILON = 1e-9;

/** Travel angle when moving toward a side: E = 0, S = PI/2, W = PI, N = -PI/2. */
const HEADING: Record<Direction, number> = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 };

/** True when two angles point the same way (so PI and -PI count as equal). */
function sameAngle(a: number, b: number): boolean {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-9;
}

function expectSamePose(a: Pose, b: Pose): void {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  expect(sameAngle(a.angle, b.angle)).toBe(true);
}

/** Every piece that joins two different sides: 4 straights and 8 curves. */
const TWO_SIDED: TrackPiece[] = DIRECTIONS.flatMap((entry) =>
  DIRECTIONS.filter((exit) => exit !== entry).map((exit) => ({ entry, exit })),
);
const HALF_PIECES: TrackPiece[] = DIRECTIONS.flatMap((side) => [
  { entry: null, exit: side },
  { entry: side, exit: null },
]);

describe('piece shapes and lengths', () => {
  it('finds 4 straights and 8 curves among the two-sided pieces', () => {
    const shapes = TWO_SIDED.map(pieceShape);
    expect(shapes.filter((s) => s === 'straight')).toHaveLength(4);
    expect(shapes.filter((s) => s === 'curve')).toHaveLength(8);
  });

  it('uses whole-number lengths for every piece', () => {
    expect(pieceLengthUnits({ entry: 'W', exit: 'E' })).toBe(UNITS_PER_CELL);
    expect(pieceLengthUnits({ entry: 'W', exit: 'S' })).toBe(CURVE_LENGTH_UNITS);
    expect(pieceLengthUnits({ entry: null, exit: 'N' })).toBe(HALF_PIECE_LENGTH_UNITS);
    expect(pieceLengthUnits({ entry: 'E', exit: null })).toBe(HALF_PIECE_LENGTH_UNITS);
    for (const piece of [...TWO_SIDED, ...HALF_PIECES]) {
      expect(Number.isInteger(pieceLengthUnits(piece))).toBe(true);
    }
  });

  it('matches the real length of a quarter circle to within one unit', () => {
    const piece: TrackPiece = { entry: 'N', exit: 'W' };
    let length = 0;
    let prev = pointOnPiece(piece, 0);
    for (let i = 1; i <= 10_000; i++) {
      const next = pointOnPiece(piece, i / 10_000);
      length += Math.hypot(next.x - prev.x, next.y - prev.y);
      prev = next;
    }
    expect(Math.abs(length * UNITS_PER_CELL - CURVE_LENGTH_UNITS)).toBeLessThan(1);
  });

  it('rejects pieces that make no sense', () => {
    expect(() => pieceShape({ entry: null, exit: null })).toThrow(RangeError);
    expect(() => pieceShape({ entry: 'N', exit: 'N' })).toThrow(RangeError);
  });
});

describe('pointOnPiece', () => {
  it.each(TWO_SIDED)('runs $entry -> $exit between the side midpoints', (piece) => {
    const start = pointOnPiece(piece, 0);
    const end = pointOnPiece(piece, 1);
    expect(start.x).toBeCloseTo(sideMidpoint(piece.entry as Direction).x, 9);
    expect(start.y).toBeCloseTo(sideMidpoint(piece.entry as Direction).y, 9);
    expect(end.x).toBeCloseTo(sideMidpoint(piece.exit as Direction).x, 9);
    expect(end.y).toBeCloseTo(sideMidpoint(piece.exit as Direction).y, 9);

    // A train enters heading away from the entry side and leaves heading toward the exit side.
    expect(sameAngle(start.angle, HEADING[oppositeOf(piece.entry as Direction)])).toBe(true);
    expect(sameAngle(end.angle, HEADING[piece.exit as Direction])).toBe(true);
  });

  it.each(TWO_SIDED)('keeps $entry -> $exit inside the cell at a steady speed', (piece) => {
    const steps: number[] = [];
    let prev = pointOnPiece(piece, 0);
    for (let i = 1; i <= 100; i++) {
      const next = pointOnPiece(piece, i / 100);
      expect(next.x).toBeGreaterThanOrEqual(-EPSILON);
      expect(next.x).toBeLessThanOrEqual(1 + EPSILON);
      expect(next.y).toBeGreaterThanOrEqual(-EPSILON);
      expect(next.y).toBeLessThanOrEqual(1 + EPSILON);
      steps.push(Math.hypot(next.x - prev.x, next.y - prev.y));
      prev = next;
    }
    // Equal steps in t give equal distances, so trains don't speed up or slow down on a piece.
    expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(1.000001);
  });

  it('runs half pieces between the center and a side', () => {
    expectSamePose(pointOnPiece({ entry: null, exit: 'N' }, 0), {
      x: 0.5,
      y: 0.5,
      angle: -Math.PI / 2,
    });
    expectSamePose(pointOnPiece({ entry: null, exit: 'N' }, 1), {
      x: 0.5,
      y: 0,
      angle: -Math.PI / 2,
    });
    expectSamePose(pointOnPiece({ entry: 'E', exit: null }, 0), { x: 1, y: 0.5, angle: Math.PI });
    expectSamePose(pointOnPiece({ entry: 'E', exit: null }, 1), { x: 0.5, y: 0.5, angle: Math.PI });
  });

  it('passes through the expected middle point of a curve', () => {
    const mid = pointOnPiece({ entry: 'W', exit: 'S' }, 0.5);
    expect(mid.x).toBeCloseTo(0.5 * Math.SQRT1_2, 9);
    expect(mid.y).toBeCloseTo(1 - 0.5 * Math.SQRT1_2, 9);
    expect(mid.angle).toBeCloseTo(Math.PI / 4, 9);
  });

  it('clamps t to the ends of the piece', () => {
    const piece: TrackPiece = { entry: 'W', exit: 'E' };
    expectSamePose(pointOnPiece(piece, -1), pointOnPiece(piece, 0));
    expectSamePose(pointOnPiece(piece, 2), pointOnPiece(piece, 1));
  });
});

describe('pieces of a node', () => {
  const layout = smallLayout();

  it('gives the tunnel and stations one half piece, and a switch two pieces', () => {
    expect(nodePieces(getNode(layout, 0))).toEqual([{ entry: null, exit: 'E' }]);
    expect(nodePieces(getNode(layout, 2))).toEqual([
      { entry: 'W', exit: 'E' },
      { entry: 'W', exit: 'S' },
    ]);
    expect(nodePieces(getNode(layout, 5))).toEqual([{ entry: 'W', exit: null }]);
  });

  it('uses the exit index only on switches', () => {
    expect(pieceForTrain(getNode(layout, 2), 1)).toEqual({ entry: 'W', exit: 'S' });
    expect(pieceForTrain(getNode(layout, 1), 1)).toEqual({ entry: 'W', exit: 'E' });
    expect(pieceForTrain(getNode(layout, 5), 1)).toEqual({ entry: 'W', exit: null });
    expect(() => pieceForTrain(getNode(layout, 2), 2)).toThrow(RangeError);
  });
});

describe('trainPose', () => {
  const layout = smallLayout();

  it('starts a train at the center of the tunnel cell', () => {
    expectSamePose(trainPose(layout, 0, 0, 0), { x: 0.5, y: 1.5, angle: 0 });
  });

  it('places a train halfway round a switch curve', () => {
    // Node 2 is the switch at (2, 1); exit 1 curves from W down to S.
    const pose = trainPose(layout, 2, 1, CURVE_LENGTH_UNITS / 2);
    expect(pose.x).toBeCloseTo(2 + 0.5 * Math.SQRT1_2, 9);
    expect(pose.y).toBeCloseTo(2 - 0.5 * Math.SQRT1_2, 9);
    expect(pose.angle).toBeCloseTo(Math.PI / 4, 9);
  });

  it('joins every piece smoothly to the next one on generated levels', () => {
    for (const level of [1, 5, 10, 15, 20]) {
      for (const seed of [1, 2, 3]) {
        const levelLayout = generateLevel(level, seed);
        for (const node of levelLayout.nodes) {
          node.children.forEach((childId, exitIndex) => {
            const piece = pieceForTrain(node, exitIndex);
            const end = trainPose(levelLayout, node.id, exitIndex, pieceLengthUnits(piece));
            // Every piece in the child cell starts at the same point, so exit 0 is enough.
            expectSamePose(trainPose(levelLayout, childId, 0, 0), end);
          });
        }
      }
    }
  });
});
