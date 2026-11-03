export interface RateLimiter {
  /** Records one event; false once more than the limit fall inside the window. */
  hit(): boolean;
}

/** Counts events in a rolling window; `hit()` returns false once the limit is exceeded. */
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
      times.push(t);
      return times.length <= limit;
    },
  };
}
