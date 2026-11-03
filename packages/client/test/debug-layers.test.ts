import { describe, expect, it, vi } from 'vitest';
import { DEBUG_LAYERS, parseDebugLayers } from '../src/debug/layers.ts';

describe('parseDebugLayers', () => {
  it.each([undefined, '', ' , '])('treats %j as off', (raw) => {
    const warn = vi.fn();
    expect(parseDebugLayers(raw, warn).size).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['all', 'ALL'])('%s enables every layer', (raw) => {
    expect([...parseDebugLayers(raw, vi.fn())].sort()).toEqual([...DEBUG_LAYERS].sort());
  });

  it('ignores case and whitespace', () => {
    expect([...parseDebugLayers(' Hitboxes , trail ', vi.fn())].sort()).toEqual([
      'hitboxes',
      'trail',
    ]);
  });

  it('warns once about unknown names, listing the valid ones, and keeps the known ones', () => {
    const warn = vi.fn();
    expect([...parseDebugLayers('hitboxes,nope,zap', warn)]).toEqual(['hitboxes']);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]![0]);
    for (const word of ['nope', 'zap', ...DEBUG_LAYERS]) expect(message).toContain(word);
  });

  it('only unknown names turns nothing on', () => {
    const warn = vi.fn();
    expect(parseDebugLayers('nope', warn).size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
