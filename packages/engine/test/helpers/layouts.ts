import { buildLayout, type Layout, type LayoutSpec } from '../../src/layout.js';

/**
 * A small hand-made network on a 5x4 board, used by several test files.
 *
 *       x: 0   1   2   3   4
 *   y=0    .   .   .   .   .
 *   y=1    T - . - A - . - R      T = tunnel, A and B = switches
 *                  |              R = red station (line 0)
 *   y=2    .   Y - B   .   .      U = blue station (line 1)
 *                  |              Y = yellow station (line 2)
 *   y=3    .   .   U   .   .
 */
export const SMALL_SPEC: LayoutSpec = {
  level: 1,
  seed: 1,
  cols: 5,
  rows: 4,
  cells: [
    { x: 0, y: 1 },
    { x: 1, y: 1, from: { x: 0, y: 1 } },
    { x: 2, y: 1, from: { x: 1, y: 1 } },
    { x: 3, y: 1, from: { x: 2, y: 1 } },
    { x: 4, y: 1, from: { x: 3, y: 1 }, lineId: 0 },
    { x: 2, y: 2, from: { x: 2, y: 1 }, initialRoute: 1 },
    { x: 2, y: 3, from: { x: 2, y: 2 }, lineId: 1 },
    { x: 1, y: 2, from: { x: 2, y: 2 }, lineId: 2 },
  ],
};

export function smallLayout(): Layout {
  return buildLayout(SMALL_SPEC);
}
