import { expect, test } from 'vitest';
import { rateLimiter } from '../src/net/rate-limiter.ts';

test('refused hits do not count, so a client retrying slowly gets back in', () => {
  let now = 0;
  const limit = rateLimiter(2, 1000, () => now);
  expect([limit.hit(), limit.hit()]).toEqual([true, true]);
  now = 400;
  expect(limit.hit()).toBe(false);
  now = 800;
  expect(limit.hit()).toBe(false);
  // The two accepted hits have left the window; the refused ones never entered it.
  now = 1200;
  expect(limit.hit()).toBe(true);
});
