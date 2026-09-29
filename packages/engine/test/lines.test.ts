import { describe, expect, it } from 'vitest';
import { LINES, getLine, isLineId } from '../src/lines.js';

describe('LINES', () => {
  it('has the 10 lines in the order of introduction', () => {
    expect(LINES.map((line) => `${line.key}/${line.symbol}`)).toEqual([
      'red/circle',
      'blue/square',
      'yellow/triangle',
      'green/diamond',
      'purple/star',
      'orange/plus',
      'teal/hexagon',
      'pink/ring',
      'brown/x',
      'graphite/bars',
    ]);
  });

  it('uses the array position as the id', () => {
    LINES.forEach((line, index) => expect(line.id).toBe(index));
  });

  it('gives every line its own key and symbol', () => {
    expect(new Set(LINES.map((line) => line.key)).size).toBe(LINES.length);
    expect(new Set(LINES.map((line) => line.symbol)).size).toBe(LINES.length);
  });
});

describe('isLineId', () => {
  it('accepts 0 to 9 only', () => {
    expect(isLineId(0)).toBe(true);
    expect(isLineId(9)).toBe(true);
    expect(isLineId(10)).toBe(false);
    expect(isLineId(-1)).toBe(false);
    expect(isLineId(1.5)).toBe(false);
    expect(isLineId('1')).toBe(false);
  });
});

describe('getLine', () => {
  it('returns the line for an id', () => {
    expect(getLine(4)).toEqual({ id: 4, key: 'purple', name: 'Purple', symbol: 'star' });
  });
});
