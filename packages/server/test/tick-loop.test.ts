import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { TICK_MS } from '@bng/shared';
import { TickLoop } from '../src/rooms/tick-loop.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});
afterEach(() => {
  vi.useRealTimers();
});

test('runs onTick about once per TICK_MS and stops on stop()', () => {
  const loop = new TickLoop();
  let n = 0;
  loop.start(() => n++);
  vi.advanceTimersByTime(TICK_MS * 10 + 1);
  expect(n).toBeGreaterThanOrEqual(9);
  expect(n).toBeLessThanOrEqual(10);
  loop.stop();
  const after = n;
  vi.advanceTimersByTime(1000);
  expect(n).toBe(after);
});

test('survives an onTick throw and keeps ticking', () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const loop = new TickLoop();
  let n = 0;
  loop.start(() => {
    n++;
    if (n === 2) throw new Error('boom');
  });
  vi.advanceTimersByTime(TICK_MS * 6 + 1);
  expect(n).toBeGreaterThanOrEqual(5);
  expect(errors).toHaveBeenCalledTimes(1);
  loop.stop();
  errors.mockRestore();
});
