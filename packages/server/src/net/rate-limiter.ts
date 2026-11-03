export interface RateLimiter {
  /** Records one event; false once the limit is reached inside the window. */
  hit(): boolean;
}

/**
 * Counts accepted events in a rolling window; `hit()` returns false once the limit is reached.
 * Refused events aren't counted, so a client that keeps retrying slowly gets back in once its
 * accepted ones leave the window, and the record never grows past the limit.
 */
export function rateLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
): RateLimiter {
  const times: number[] = [];
  return {
    hit(): boolean {
      const t = now();
      while (times.length > 0 && (times[0] as number) <= t - windowMs) times.shift();
      if (times.length >= limit) return false;
      times.push(t);
      return true;
    },
  };
}
