import { describe, expect, it } from 'vitest';
import { formatHudCount } from '../src/ui/hud-format.ts';

describe('formatHudCount', () => {
  it('pads to two digits with an x prefix', () => {
    expect(formatHudCount(3)).toBe('x03');
    expect(formatHudCount(12)).toBe('x12');
    expect(formatHudCount(0)).toBe('x00');
    expect(formatHudCount(120)).toBe('x120');
  });
});
