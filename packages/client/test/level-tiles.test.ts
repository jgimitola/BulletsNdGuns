import { describe, expect, it } from 'vitest';
import { CLASSIC_LEVELS } from '@bng/shared';
import { toPhaserRows } from '../src/render/level-tiles.ts';

describe('toPhaserRows', () => {
  it('maps empty to -1 and keeps tile ids', () => {
    const rows = toPhaserRows(CLASSIC_LEVELS[0]!.data);
    expect(rows).toHaveLength(20);
    expect(rows.every((r) => r.length === 25)).toBe(true);
    expect(rows[0]!.slice(9, 13)).toEqual([-1, -1, 2, -1]);
    expect(rows[0]!.slice(21, 23)).toEqual([7, 8]);
    expect(rows[18]![0]).toBe(1);
  });
});
