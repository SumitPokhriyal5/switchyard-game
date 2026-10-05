import {
  DIRECTIONS,
  cellToIndex,
  directionBetween,
  inwardDirection,
  isCornerCell,
  isEdgeCell,
  type Cell,
  type Direction,
  type GridSize,
} from './grid.js';
import { isLineId, type LineId } from './lines.js';

/** What a track cell is used for. */
export type NodeKind = 'tunnel' | 'track' | 'switch' | 'station';

/** Which exit a switch points to: 0 for the first exit, 1 for the second. */
export type Route = 0 | 1;

/** One cell of track. The network is a tree rooted at the tunnel. */
export interface LayoutNode {
  /** Index in `Layout.nodes`. The tunnel is always 0. */
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly kind: NodeKind;
  /** The node trains arrive from, or null for the tunnel. */
  readonly parent: number | null;
  /** The side of the cell trains enter through, or null for the tunnel. */
  readonly entry: Direction | null;
  /** The sides trains leave through: 1 for tunnel and track, 2 for a switch, 0 for a station. */
  readonly exits: readonly Direction[];
  /** The node behind each exit, in the same order as `exits`. */
  readonly children: readonly number[];
  /** Cells from the tunnel: 0 for the tunnel, 1 for the cell after it, and so on. */
  readonly depth: number;
  /** Set on switches only. Switch ids start at 0 and follow reading order. */
  readonly switchId: number | null;
  /** Set on stations only. */
  readonly lineId: LineId | null;
}

export interface LayoutSwitch {
  readonly id: number;
  readonly nodeId: number;
  /** The route the switch is set to when the level starts. */
  readonly initialRoute: Route;
}

export interface LayoutStation {
  readonly nodeId: number;
  readonly lineId: LineId;
}

/** A complete level map. Plain data only, so it can be logged, compared and sent as JSON. */
export interface Layout extends GridSize {
  readonly level: number;
  readonly seed: number;
  /** Track cells. Ordered so a parent always comes before its children. */
  readonly nodes: readonly LayoutNode[];
  /** Node id for each cell in row-major order, or null for an empty cell. */
  readonly grid: readonly (number | null)[];
  readonly tunnelId: 0;
  /** Sorted by switch id. */
  readonly switches: readonly LayoutSwitch[];
  /** Sorted by line id. */
  readonly stations: readonly LayoutStation[];
}

/** Input for `buildLayout`: the track cells and how they connect. */
export interface TrackCellSpec {
  readonly x: number;
  readonly y: number;
  /** The neighboring cell trains arrive from. Leave out for the tunnel only. */
  readonly from?: Cell;
  /** Required on dead ends, and only allowed there: the line of this station. */
  readonly lineId?: LineId;
  /** Only allowed on switches: the route at the start of the level. Defaults to 0. */
  readonly initialRoute?: Route;
}

export interface LayoutSpec extends GridSize {
  readonly level: number;
  readonly seed: number;
  readonly cells: readonly TrackCellSpec[];
}

/**
 * Turns a list of connected cells into a Layout and checks that the network is valid:
 * one tunnel on an edge pointing inward, every cell reachable from it, at most two exits
 * per cell, and a station with its own line at every dead end.
 * Throws a RangeError describing the first problem it finds.
 */
export function buildLayout(spec: LayoutSpec): Layout {
  const size: GridSize = { cols: spec.cols, rows: spec.rows };
  const cellCount = spec.cols * spec.rows;
  const specAt = new Array<TrackCellSpec | undefined>(cellCount);
  const kids: number[][] = Array.from({ length: cellCount }, () => []);
  let tunnelIndex: number | null = null;

  for (const cell of spec.cells) {
    const index = cellToIndex(size, cell);
    if (specAt[index]) throw new RangeError(`Cell (${cell.x}, ${cell.y}) is listed twice`);
    specAt[index] = cell;
    if (!cell.from) {
      if (tunnelIndex !== null) throw new RangeError('The layout has more than one tunnel');
      tunnelIndex = index;
    }
  }
  if (tunnelIndex === null) throw new RangeError('The layout has no tunnel');

  for (const cell of spec.cells) {
    if (!cell.from) continue;
    directionBetween(cell, cell.from); // throws if the two cells are not neighbors
    const parentIndex = cellToIndex(size, cell.from);
    if (!specAt[parentIndex]) {
      throw new RangeError(`Cell (${cell.x}, ${cell.y}) comes from a cell that is not track`);
    }
    kids[parentIndex]?.push(cellToIndex(size, cell));
  }

  const tunnel = specAt[tunnelIndex] as TrackCellSpec;
  if (!isEdgeCell(size, tunnel) || isCornerCell(size, tunnel)) {
    throw new RangeError('The tunnel must be on an edge cell that is not a corner');
  }
  const tunnelKids = kids[tunnelIndex] ?? [];
  const first = tunnelKids[0];
  if (
    tunnelKids.length !== 1 ||
    first === undefined ||
    directionBetween(tunnel, specAt[first] as TrackCellSpec) !== inwardDirection(size, tunnel)
  ) {
    throw new RangeError('The tunnel must have exactly one track, pointing into the grid');
  }

  // Walk the tree breadth-first from the tunnel. Exits are sorted N, E, S, W so the
  // node order and the meaning of route 0 and 1 never depend on the input order.
  const grid: (number | null)[] = new Array(cellCount).fill(null);
  const order: number[] = [tunnelIndex];
  const depthOf = new Map<number, number>([[tunnelIndex, 0]]);
  for (let i = 0; i < order.length; i++) {
    const index = order[i] as number;
    const cell = specAt[index] as TrackCellSpec;
    grid[index] = i;
    const sorted = (kids[index] ?? []).slice().sort((a, b) => {
      const da = DIRECTIONS.indexOf(directionBetween(cell, specAt[a] as TrackCellSpec));
      const db = DIRECTIONS.indexOf(directionBetween(cell, specAt[b] as TrackCellSpec));
      return da - db;
    });
    kids[index] = sorted;
    for (const child of sorted) {
      depthOf.set(child, (depthOf.get(index) ?? 0) + 1);
      order.push(child);
    }
  }
  if (order.length !== spec.cells.length) {
    throw new RangeError('Some track cells are not connected to the tunnel');
  }

  // Switch ids follow reading order (top row first, then left to right), so key 1 is the
  // switch nearest the top-left of the board.
  const switchCells = order
    .filter((index) => (kids[index]?.length ?? 0) === 2)
    .sort((a, b) => a - b);
  const switchIdAt = new Map(switchCells.map((index, i) => [index, i]));

  const nodes: LayoutNode[] = [];
  const usedLines = new Set<LineId>();
  for (const index of order) {
    const cell = specAt[index] as TrackCellSpec;
    const children = kids[index] ?? [];
    if (children.length > 2) {
      throw new RangeError(`Cell (${cell.x}, ${cell.y}) has more than two exits`);
    }

    const isTunnel = index === tunnelIndex;
    const kind: NodeKind = isTunnel
      ? 'tunnel'
      : children.length === 0
        ? 'station'
        : children.length === 2
          ? 'switch'
          : 'track';

    if (kind === 'station') {
      if (cell.lineId === undefined || !isLineId(cell.lineId)) {
        throw new RangeError(`Dead end (${cell.x}, ${cell.y}) needs a valid lineId`);
      }
      if (usedLines.has(cell.lineId)) {
        throw new RangeError(`Line ${cell.lineId} has more than one station`);
      }
      usedLines.add(cell.lineId);
    } else if (cell.lineId !== undefined) {
      throw new RangeError(
        `Cell (${cell.x}, ${cell.y}) is not a dead end, so it cannot be a station`,
      );
    }
    if (kind !== 'switch' && cell.initialRoute !== undefined) {
      throw new RangeError(`Cell (${cell.x}, ${cell.y}) is not a switch, so it has no route`);
    }

    nodes.push({
      id: nodes.length,
      x: cell.x,
      y: cell.y,
      kind,
      parent: cell.from ? (grid[cellToIndex(size, cell.from)] ?? null) : null,
      entry: cell.from ? directionBetween(cell, cell.from) : null,
      exits: children.map((child) => directionBetween(cell, specAt[child] as TrackCellSpec)),
      children: children.map((child) => grid[child] as number),
      depth: depthOf.get(index) ?? 0,
      switchId: switchIdAt.get(index) ?? null,
      lineId: kind === 'station' ? (cell.lineId as LineId) : null,
    });
  }

  const switches: LayoutSwitch[] = switchCells.map((index, id) => ({
    id,
    nodeId: grid[index] as number,
    initialRoute: specAt[index]?.initialRoute ?? 0,
  }));

  const stations: LayoutStation[] = nodes
    .filter((node) => node.kind === 'station')
    .map((node) => ({ nodeId: node.id, lineId: node.lineId as LineId }))
    .sort((a, b) => a.lineId - b.lineId);

  return {
    level: spec.level,
    seed: spec.seed,
    cols: spec.cols,
    rows: spec.rows,
    nodes,
    grid,
    tunnelId: 0,
    switches,
    stations,
  };
}

/** The node with this id. Throws if there is none. */
export function getNode(layout: Layout, nodeId: number): LayoutNode {
  const node = layout.nodes[nodeId];
  if (!node) throw new RangeError(`No node with id ${nodeId}`);
  return node;
}

/** The node in a cell, or null if the cell has no track. */
export function nodeAt(layout: Layout, cell: Cell): LayoutNode | null {
  const id = layout.grid[cellToIndex(layout, cell)];
  return id === null || id === undefined ? null : getNode(layout, id);
}

/** The switch node for a switch id. Throws if there is none. */
export function getSwitchNode(layout: Layout, switchId: number): LayoutNode {
  const sw = layout.switches[switchId];
  if (!sw) throw new RangeError(`No switch with id ${switchId}`);
  return getNode(layout, sw.nodeId);
}

/** The station node for a line. Throws if the line has no station in this level. */
export function getStationNode(layout: Layout, lineId: LineId): LayoutNode {
  const station = layout.stations.find((s) => s.lineId === lineId);
  if (!station) throw new RangeError(`Line ${lineId} has no station in this level`);
  return getNode(layout, station.nodeId);
}

/** Node ids from the tunnel to the given node, both included. */
export function pathToNode(layout: Layout, nodeId: number): number[] {
  const path: number[] = [];
  let current: LayoutNode | null = getNode(layout, nodeId);
  while (current) {
    path.push(current.id);
    current = current.parent === null ? null : getNode(layout, current.parent);
  }
  return path.reverse();
}

export interface SwitchSetting {
  readonly switchId: number;
  readonly route: Route;
}

/** The route every switch on the way must be set to for a train to reach this node. */
export function routeToNode(layout: Layout, nodeId: number): SwitchSetting[] {
  const path = pathToNode(layout, nodeId);
  const settings: SwitchSetting[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const node = getNode(layout, path[i] as number);
    if (node.switchId === null) continue;
    const route = node.children.indexOf(path[i + 1] as number);
    settings.push({ switchId: node.switchId, route: route === 1 ? 1 : 0 });
  }
  return settings;
}

/** The route every switch on the way must be set to for a train of this line to get home. */
export function routeToStation(layout: Layout, lineId: LineId): SwitchSetting[] {
  return routeToNode(layout, getStationNode(layout, lineId).id);
}

/**
 * Draws the layout as text, for tests and debugging.
 * T = tunnel, 1-9 = switch keys, A-J = stations of lines 0-9 (A = red, B = blue, ...),
 * # = plain track, . = empty.
 */
export function layoutToAscii(layout: Layout): string {
  const lines: string[][] = Array.from({ length: layout.rows * 2 - 1 }, () =>
    new Array<string>(layout.cols * 2 - 1).fill(' '),
  );
  for (let y = 0; y < layout.rows; y++) {
    for (let x = 0; x < layout.cols; x++) (lines[y * 2] as string[])[x * 2] = '.';
  }
  for (const node of layout.nodes) {
    const symbol =
      node.kind === 'tunnel'
        ? 'T'
        : node.kind === 'switch'
          ? String((node.switchId ?? 0) + 1)
          : node.kind === 'station'
            ? String.fromCharCode(65 + (node.lineId ?? 0))
            : '#';
    (lines[node.y * 2] as string[])[node.x * 2] = symbol;
    if (node.parent !== null) {
      const p = getNode(layout, node.parent);
      (lines[node.y + p.y] as string[])[node.x + p.x] = p.y === node.y ? '-' : '|';
    }
  }
  return lines.map((line) => line.join('').trimEnd()).join('\n');
}
