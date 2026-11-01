/** How often the client measures its round trip to the server. */
export const LATENCY_PROBE_MS = 2000;
/** A probe without an answer by then counts as lost. */
export const LATENCY_TIMEOUT_MS = 5000;
/** Samples averaged for display, so one slow packet does not make the number jump. */
const WINDOW = 5;

export type LatencyQuality = 'good' | 'fair' | 'poor';

/** Below 80 ms play feels instant; above 150 ms players start to notice. */
export function latencyQuality(ms: number): LatencyQuality {
  if (ms < 80) return 'good';
  if (ms < 150) return 'fair';
  return 'poor';
}

/** Rolling average of the last few round trips, in whole milliseconds. */
export class LatencyTracker {
  private readonly samples: number[] = [];

  add(ms: number): number {
    this.samples.push(ms);
    if (this.samples.length > WINDOW) this.samples.shift();
    return this.value as number;
  }

  /** A lost probe empties the window: the old average no longer describes the link. */
  reset(): void {
    this.samples.length = 0;
  }

  get value(): number | null {
    if (this.samples.length === 0) return null;
    const sum = this.samples.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.samples.length);
  }
}

/**
 * Measures the round trip every LATENCY_PROBE_MS and reports the rolling average, or null after a
 * lost probe. Returns a function that stops it.
 */
export function startLatencyMonitor(
  measure: () => Promise<number | null>,
  onChange: (ms: number | null) => void,
): () => void {
  const tracker = new LatencyTracker();
  let inFlight = false;
  const probe = async () => {
    // A slow link must not pile up probes.
    if (inFlight) return;
    inFlight = true;
    const ms = await measure();
    inFlight = false;
    if (ms === null) {
      tracker.reset();
      onChange(null);
    } else {
      onChange(tracker.add(ms));
    }
  };
  void probe();
  const timer = setInterval(() => void probe(), LATENCY_PROBE_MS);
  return () => clearInterval(timer);
}
