import { describe, expect, it } from 'vitest';
import { RUN_SPEED, TICK_MS, TICK_SECONDS } from '../src/constants.ts';

describe('constants', () => {
  it('derives the tick duration from 60 Hz', () => {
    expect(TICK_MS).toBeCloseTo(16.6667, 4);
  });

  it('moves 4.5 px per tick at run speed', () => {
    expect(RUN_SPEED * TICK_SECONDS).toBe(4.5);
  });
});
