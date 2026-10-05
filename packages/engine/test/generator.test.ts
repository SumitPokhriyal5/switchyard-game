import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_LEVEL } from '../src/constants.js';
import {
  GENERATOR_PASSES,
  generateLevel,
  generateLevelWithStats,
  pickStations,
  type GeneratorPass,
} from '../src/generator.js';
import { chebyshevDistance, indexToCell, manhattanDistance } from '../src/grid.js';
import {
  getNode,
  layoutToAscii,
  routeToStation,
  type Layout,
  type LayoutNode,
} from '../src/layout.js';
import { getLevelConfig } from '../src/levels.js';
import type { LineId } from '../src/lines.js';
import { Rng } from '../src/rng.js';
import { MIN_SWITCH_DEPTH, NO_CELL, deadEnds, growTrackTree } from '../src/tree.js';
import { smallLayout } from './helpers/layouts.js';

const SEEDS_PER_LEVEL = 20;
const ALL_LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

/** A spread of seeds for a level, so each level is tested on different seeds. */
function seedsFor(level: number): number[] {
  return Array.from(
    { length: SEEDS_PER_LEVEL },
    (_, i) => (Math.imul(i + 1, 2654435761) + level) >>> 0,
  );
}

/** Follows the switch settings for a line from the tunnel. Returns the node the train ends on. */
function drive(layout: Layout, lineId: LineId): number {
  const routes = new Map(routeToStation(layout, lineId).map((s) => [s.switchId, s.route]));
  let node = getNode(layout, layout.tunnelId);
  while (node.children.length > 0) {
    const exit = node.switchId === null ? 0 : (routes.get(node.switchId) ?? 0);
    node = getNode(layout, node.children[exit] as number);
  }
  return node.id;
}

function nodesOfKind(layout: Layout, kind: LayoutNode['kind']): LayoutNode[] {
  return layout.nodes.filter((node) => node.kind === kind);
}

describe('generateLevel', () => {
  afterEach(() => vi.restoreAllMocks());

  describe.each(ALL_LEVELS)('level %i', (level) => {
    const config = getLevelConfig(level);

    it(`builds valid, playable maps for ${SEEDS_PER_LEVEL} seeds`, () => {
      for (const seed of seedsFor(level)) {
        const { layout, pass } = generateLevelWithStats(level, seed);
        const rules = GENERATOR_PASSES[pass] as GeneratorPass;

        expect(layout).toMatchObject({ level, seed, cols: config.cols, rows: config.rows });

        // One station per line in play, and one switch fewer than stations.
        const stations = nodesOfKind(layout, 'station');
        const switches = nodesOfKind(layout, 'switch');
        expect(stations).toHaveLength(config.stations);
        expect(layout.stations.map((s) => s.lineId)).toEqual(config.lineIds);
        expect(switches).toHaveLength(config.stations - 1);

        // Stations: never side by side, and within the pass's depth limits.
        const maxDepth = Math.round((config.cols + config.rows) * rules.maxDepthMultiplier);
        for (const station of stations) {
          expect(station.depth).toBeGreaterThanOrEqual(rules.minStationDepth);
          expect(station.depth).toBeLessThanOrEqual(maxDepth);
        }
        for (let i = 0; i < stations.length; i++) {
          for (let j = i + 1; j < stations.length; j++) {
            const a = stations[i] as LayoutNode;
            const b = stations[j] as LayoutNode;
            expect(manhattanDistance(a, b)).toBeGreaterThanOrEqual(2);
          }
        }

        // Switches: room to think after the tunnel, and spaced out from each other.
        for (const sw of switches) expect(sw.depth).toBeGreaterThanOrEqual(MIN_SWITCH_DEPTH);
        for (let i = 0; i < switches.length; i++) {
          for (let j = i + 1; j < switches.length; j++) {
            const a = switches[i] as LayoutNode;
            const b = switches[j] as LayoutNode;
            const distance =
              rules.switchGap === 'touching' ? chebyshevDistance(a, b) : manhattanDistance(a, b);
            expect(distance).toBeGreaterThanOrEqual(2);
          }
        }

        // Every station can be reached by setting the switches on its route.
        for (const station of layout.stations) {
          expect(drive(layout, station.lineId)).toBe(station.nodeId);
        }
      }
    });
  });

  it('gives the same map for the same level and seed', () => {
    for (const level of [1, 10, 20]) {
      expect(generateLevel(level, 777)).toEqual(generateLevel(level, 777));
    }
  });

  it('gives different maps for different seeds', () => {
    expect(generateLevel(10, 1)).not.toEqual(generateLevel(10, 2));
  });

  // Stored runs are replayed by regenerating their level, so this output must never change.
  it('matches the known map for level 1, seed 42', () => {
    const result = generateLevelWithStats(1, 42);
    expect(result.pass).toBe(0);
    expect(result.attempts).toBe(12);
    expect(layoutToAscii(result.layout)).toBe(
      [
        '#-#-#-#-#',
        '|       |',
        '#-B #-#-1',
        '    |   |',
        'T-#-# A #',
        '      | |',
        'C-#-#-2-#',
      ].join('\n'),
    );
  });

  it('shuffles station colors and starting switch routes between seeds', () => {
    const firstStationLines = new Set<number>();
    const routes = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      const layout = generateLevel(5, seed);
      firstStationLines.add(nodesOfKind(layout, 'station')[0]?.lineId ?? -1);
      for (const sw of layout.switches) routes.add(sw.initialRoute);
    }
    expect(firstStationLines.size).toBeGreaterThan(2);
    expect([...routes].sort()).toEqual([0, 1]);
  });

  it('never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    generateLevel(15, 99);
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([0, 21, 1.5])('rejects level %s', (level) => {
    expect(() => generateLevel(level, 1)).toThrow(RangeError);
  });

  it.each([-1, 2 ** 32, 0.5])('rejects seed %s', (seed) => {
    expect(() => generateLevel(1, seed)).toThrow(RangeError);
  });
});

describe('GENERATOR_PASSES', () => {
  it('starts strict and only gets looser', () => {
    expect(GENERATOR_PASSES[0]).toEqual({
      minStationDepth: 3,
      maxDepthMultiplier: 1.3,
      switchGap: 'touching',
    });
    for (let i = 1; i < GENERATOR_PASSES.length; i++) {
      const prev = GENERATOR_PASSES[i - 1];
      const next = GENERATOR_PASSES[i];
      expect(next?.minStationDepth).toBeLessThanOrEqual(prev?.minStationDepth ?? 0);
      expect(next?.maxDepthMultiplier).toBeGreaterThan(prev?.maxDepthMultiplier ?? 0);
    }
  });
});

describe('pickStations', () => {
  const size = getLevelConfig(20);

  it('picks distinct dead ends within the depth limits, never side by side', () => {
    let picked = 0;
    for (let seed = 0; seed < 100; seed++) {
      const tree = growTrackTree(new Rng(seed), size);
      const stations = pickStations(new Rng(seed), tree, 4, 3, 20);
      if (!stations) continue;
      picked++;
      const ends = new Set(deadEnds(tree));
      expect(new Set(stations).size).toBe(4);
      for (const s of stations) {
        expect(ends.has(s)).toBe(true);
        const depth = tree.depth[s] ?? NO_CELL;
        expect(depth).toBeGreaterThanOrEqual(3);
        expect(depth).toBeLessThanOrEqual(20);
      }
      for (let i = 0; i < stations.length; i++) {
        for (let j = i + 1; j < stations.length; j++) {
          const a = indexToCell(tree, stations[i] as number);
          const b = indexToCell(tree, stations[j] as number);
          expect(manhattanDistance(a, b)).toBeGreaterThanOrEqual(2);
        }
      }
    }
    expect(picked).toBeGreaterThan(20);
  });

  it('returns null when the tree has too few dead ends', () => {
    const tree = growTrackTree(new Rng(1), size);
    expect(pickStations(new Rng(1), tree, deadEnds(tree).length + 1, 0, 100)).toBeNull();
  });

  it('is deterministic for a seed', () => {
    const tree = growTrackTree(new Rng(3), size);
    expect(pickStations(new Rng(9), tree, 3, 2, 30)).toEqual(
      pickStations(new Rng(9), tree, 3, 2, 30),
    );
  });
});

describe('layoutToAscii', () => {
  it('draws the small test board', () => {
    expect(layoutToAscii(smallLayout())).toBe(
      ['. . . . .', '', 'T-#-1-#-A', '    |', '. C-2 . .', '    |', '. . B . .'].join('\n'),
    );
  });
});
