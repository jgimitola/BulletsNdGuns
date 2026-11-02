import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../src/constants.ts';
import { MOVEMENT } from '../src/simulation/movement-tuning.ts';

describe('constants', () => {
  it('derives the tick duration from 60 Hz', () => {
    expect(TICK_MS).toBeCloseTo(16.6667, 4);
  });
});

describe('movement tuning', () => {
  // The ONLY test that hardcodes the feel numbers. When you retune MOVEMENT on purpose, update
  // the values here; every other test derives its expectations from MOVEMENT.
  it('pins the shipped default feel (update this when retuning on purpose)', () => {
    expect(MOVEMENT).toEqual({
      runSpeed: 270,
      groundAccelTicks: 6,
      groundDecelTicks: 4,
      airAccelTicks: 9,
      airDecelTicks: 15,
      jumpBufferTicks: 6,
      coyoteTicks: 6,
      headNudgeMaxPx: 12,
      ledgeCatchMaxPx: 8,
      shotPoseTicks: 12,
    });
  });
});
