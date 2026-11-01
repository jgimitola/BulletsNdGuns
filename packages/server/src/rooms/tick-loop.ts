import { TICK_MS } from '@bng/shared';
import type { TickScheduler } from './room.ts';

const MAX_CATCH_UP_TICKS = 5;

/** Fixed-step scheduler: setTimeout loop with a time accumulator. */
export class TickLoop implements TickScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  start(onTick: () => void): void {
    this.stop();
    this.running = true;
    let last = performance.now();
    let accumulator = 0;
    const wake = (): void => {
      if (!this.running) return;
      const now = performance.now();
      accumulator += now - last;
      last = now;
      let steps = 0;
      while (accumulator >= TICK_MS && steps < MAX_CATCH_UP_TICKS) {
        accumulator -= TICK_MS;
        steps++;
        onTick();
        if (!this.running) return;
      }
      // Drop backlog beyond the catch-up cap instead of spiralling.
      if (accumulator >= TICK_MS) accumulator = 0;
      this.timer = setTimeout(wake, Math.max(0, TICK_MS - accumulator));
    };
    this.timer = setTimeout(wake, TICK_MS);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
