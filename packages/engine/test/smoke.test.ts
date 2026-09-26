import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../src/index.js';

describe('engine package', () => {
  it('loads and exposes the tick rate', () => {
    expect(TICKS_PER_SECOND).toBe(60);
  });
});