import { describe, expect, it } from 'vitest';
import {
  buildLayout,
  getNode,
  getStationNode,
  getSwitchNode,
  nodeAt,
  pathToNode,
  routeToStation,
  type Layout,
  type LayoutSpec,
  type TrackCellSpec,
} from '../src/layout.js';
import type { LineId } from '../src/lines.js';
import { SMALL_SPEC, smallLayout } from './helpers/layouts.js';

/** SMALL_SPEC with its cell list replaced. */
function withCells(cells: TrackCellSpec[]): LayoutSpec {
  return { ...SMALL_SPEC, cells };
}

/** Follows the switch settings from the tunnel and returns the node the train ends on. */
function drive(layout: Layout, lineId: LineId): number {
  const routes = new Map(routeToStation(layout, lineId).map((s) => [s.switchId, s.route]));
  let node = getNode(layout, layout.tunnelId);
  while (node.children.length > 0) {
    const exit = node.switchId === null ? 0 : (routes.get(node.switchId) ?? 0);
    node = getNode(layout, node.children[exit] as number);
  }
  return node.id;
}

describe('buildLayout', () => {
  const layout = smallLayout();

  it('orders nodes breadth-first from the tunnel', () => {
    expect(layout.nodes.map((n) => `${n.x},${n.y} ${n.kind}`)).toEqual([
      '0,1 tunnel',
      '1,1 track',
      '2,1 switch',
      '3,1 track',
      '2,2 switch',
      '4,1 station',
      '2,3 station',
      '1,2 station',
    ]);
    layout.nodes.forEach((node, index) => expect(node.id).toBe(index));
  });

  it('records entries, exits, children and depth', () => {
    expect(getNode(layout, 0)).toMatchObject({
      entry: null,
      exits: ['E'],
      children: [1],
      depth: 0,
    });
    expect(getNode(layout, 2)).toMatchObject({
      parent: 1,
      entry: 'W',
      exits: ['E', 'S'],
      children: [3, 4],
      depth: 2,
    });
    // Exits are sorted N, E, S, W, so S comes before W here.
    expect(getNode(layout, 4)).toMatchObject({ entry: 'N', exits: ['S', 'W'], children: [6, 7] });
    expect(getNode(layout, 5)).toMatchObject({
      kind: 'station',
      exits: [],
      children: [],
      depth: 4,
    });
  });

  it('puts every parent before its children', () => {
    for (const node of layout.nodes) {
      for (const child of node.children) {
        expect(child).toBeGreaterThan(node.id);
        expect(getNode(layout, child).parent).toBe(node.id);
        expect(getNode(layout, child).depth).toBe(node.depth + 1);
      }
    }
  });

  it('maps each cell to its node', () => {
    expect(layout.grid).toHaveLength(20);
    expect(layout.grid.filter((id) => id !== null)).toHaveLength(8);
    expect(nodeAt(layout, { x: 2, y: 2 })?.id).toBe(4);
    expect(nodeAt(layout, { x: 0, y: 0 })).toBeNull();
  });

  it('numbers switches in reading order and keeps their starting routes', () => {
    expect(layout.switches).toEqual([
      { id: 0, nodeId: 2, initialRoute: 0 },
      { id: 1, nodeId: 4, initialRoute: 1 },
    ]);
    expect(getNode(layout, 2).switchId).toBe(0);
    expect(getNode(layout, 3).switchId).toBeNull();
  });

  it('lists stations sorted by line', () => {
    expect(layout.stations).toEqual([
      { nodeId: 5, lineId: 0 },
      { nodeId: 6, lineId: 1 },
      { nodeId: 7, lineId: 2 },
    ]);
  });

  it('gives the same layout whatever order the cells are listed in', () => {
    const reversed = buildLayout(withCells(SMALL_SPEC.cells.slice().reverse()));
    expect(reversed).toEqual(layout);
  });

  it('survives a JSON round trip unchanged', () => {
    expect(JSON.parse(JSON.stringify(layout))).toEqual(layout);
  });
});

describe('buildLayout rejects broken networks', () => {
  const cells = SMALL_SPEC.cells;
  const tunnel = cells[0] as TrackCellSpec;
  const rest = cells.slice(1);

  it.each<[string, TrackCellSpec[], RegExp]>([
    ['no tunnel', rest, /no tunnel/],
    ['two tunnels', [...cells, { x: 0, y: 0 }], /more than one tunnel/],
    ['a cell listed twice', [...cells, { x: 3, y: 1, from: { x: 2, y: 1 } }], /listed twice/],
    [
      'a link between cells that do not touch',
      [...cells, { x: 3, y: 3, from: { x: 2, y: 1 } }],
      /not neighbors/,
    ],
    [
      'a link from a cell with no track',
      [...cells, { x: 4, y: 3, from: { x: 4, y: 2 } }],
      /not track/,
    ],
    [
      'a tunnel in a corner',
      [
        { x: 0, y: 0 },
        { x: 1, y: 0, from: { x: 0, y: 0 }, lineId: 0 },
      ],
      /not a corner/,
    ],
    [
      'a tunnel whose track does not point inward',
      [
        { x: 0, y: 1 },
        { x: 0, y: 2, from: { x: 0, y: 1 }, lineId: 0 },
      ],
      /pointing into the grid/,
    ],
    [
      'a cell with three exits',
      [
        tunnel,
        { x: 1, y: 1, from: { x: 0, y: 1 } },
        { x: 1, y: 0, from: { x: 1, y: 1 }, lineId: 0 },
        { x: 2, y: 1, from: { x: 1, y: 1 }, lineId: 1 },
        { x: 1, y: 2, from: { x: 1, y: 1 }, lineId: 2 },
      ],
      /more than two exits/,
    ],
    [
      'a dead end with no line',
      cells.map((c) => (c.x === 4 && c.y === 1 ? { x: 4, y: 1, from: { x: 3, y: 1 } } : c)),
      /needs a valid lineId/,
    ],
    [
      'two stations on the same line',
      cells.map((c) => (c.x === 1 && c.y === 2 ? { ...c, lineId: 0 as const } : c)),
      /more than one station/,
    ],
    [
      'a line on a cell that is not a dead end',
      cells.map((c) => (c.x === 3 && c.y === 1 ? { ...c, lineId: 5 as const } : c)),
      /not a dead end/,
    ],
    [
      'a starting route on a cell that is not a switch',
      cells.map((c) => (c.x === 3 && c.y === 1 ? { ...c, initialRoute: 1 as const } : c)),
      /not a switch/,
    ],
    [
      'a loop that is not connected to the tunnel',
      [...cells, { x: 3, y: 3, from: { x: 4, y: 3 } }, { x: 4, y: 3, from: { x: 3, y: 3 } }],
      /not connected/,
    ],
  ])('%s', (_name, badCells, message) => {
    expect(() => buildLayout(withCells(badCells))).toThrow(message);
  });
});

describe('lookups', () => {
  const layout = smallLayout();

  it('finds switch and station nodes', () => {
    expect(getSwitchNode(layout, 1).id).toBe(4);
    expect(getStationNode(layout, 2).id).toBe(7);
  });

  it('throws for ids that do not exist', () => {
    expect(() => getNode(layout, 99)).toThrow(RangeError);
    expect(() => getSwitchNode(layout, 2)).toThrow(RangeError);
    expect(() => getStationNode(layout, 3)).toThrow(RangeError);
  });
});

describe('paths and routes', () => {
  const layout = smallLayout();

  it('lists the path from the tunnel to a node', () => {
    expect(pathToNode(layout, 0)).toEqual([0]);
    expect(pathToNode(layout, 7)).toEqual([0, 1, 2, 4, 7]);
  });

  it('gives the switch settings for each station', () => {
    expect(routeToStation(layout, 0)).toEqual([{ switchId: 0, route: 0 }]);
    expect(routeToStation(layout, 1)).toEqual([
      { switchId: 0, route: 1 },
      { switchId: 1, route: 0 },
    ]);
    expect(routeToStation(layout, 2)).toEqual([
      { switchId: 0, route: 1 },
      { switchId: 1, route: 1 },
    ]);
  });

  it('sends a train to its own station when the switches are set as given', () => {
    for (const station of layout.stations) {
      expect(drive(layout, station.lineId)).toBe(station.nodeId);
    }
  });
});
