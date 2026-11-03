/** How long a correction stays on the panel: one second, so a 50 ms blip is still readable. */
export const CORRECTION_WINDOW_TICKS = 60;
/**
 * Corrections larger than two tiles are not mispredictions: a respawn or a level reset reached
 * the client. Counting them would bury the real ones.
 */
export const RESET_THRESHOLD_PX = 64;

interface Entry {
  px: number;
  reset: boolean;
  age: number;
}

/**
 * Tracks the prediction error reconcile reports. Snapshots arrive at 20 Hz and most correct
 * nothing, so the latest value alone would read 0 almost always; the peak over a window does not.
 */
export class CorrectionMeter {
  private entries: Entry[] = [];

  record(distancePx: number): void {
    this.entries.push({ px: distancePx, reset: distancePx > RESET_THRESHOLD_PX, age: 0 });
  }

  tick(): void {
    for (const e of this.entries) e.age++;
    this.entries = this.entries.filter((e) => e.age < CORRECTION_WINDOW_TICKS);
  }

  get peakPx(): number {
    return this.entries.reduce((peak, e) => (e.reset ? peak : Math.max(peak, e.px)), 0);
  }

  get resetInWindow(): boolean {
    return this.entries.some((e) => e.reset);
  }
}
