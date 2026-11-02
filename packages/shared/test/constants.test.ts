import { describe, expect, it } from 'vitest';
import { TICK_MS, TICK_SECONDS } from '../src/constants.ts';
import { MOVEMENT } from '../src/simulation/movement-tuning.ts';

describe('constants', () => {
  it('derives the tick duration from 60 Hz', () => {
    expect(TICK_MS).toBeCloseTo(16.6667, 4);
  });

  it('moves 4.5 px per tick at run speed', () => {
    expect(MOVEMENT.runSpeed * TICK_SECONDS).toBe(4.5);
  });
});
