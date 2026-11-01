import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LATENCY_PROBE_MS,
  LatencyTracker,
  latencyQuality,
  startLatencyMonitor,
} from '../src/net/latency.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('latencyQuality', () => {
  it('splits at 80 and 150 ms', () => {
    expect(latencyQuality(0)).toBe('good');
    expect(latencyQuality(79)).toBe('good');
    expect(latencyQuality(80)).toBe('fair');
    expect(latencyQuality(149)).toBe('fair');
    expect(latencyQuality(150)).toBe('poor');
  });
});

describe('LatencyTracker', () => {
  it('averages the last five samples, rounded', () => {
    const tracker = new LatencyTracker();
    expect(tracker.value).toBeNull();
    expect(tracker.add(10.4)).toBe(10);
    expect(tracker.add(21)).toBe(16);
    for (const ms of [30, 30, 30, 30, 30]) tracker.add(ms);
    // 10.4 and 21 have dropped out of the window.
    expect(tracker.value).toBe(30);
  });

  it('reset forgets every sample', () => {
    const tracker = new LatencyTracker();
    tracker.add(50);
    tracker.reset();
    expect(tracker.value).toBeNull();
  });
});

describe('startLatencyMonitor', () => {
  it('probes at once and then every interval, reporting the rolling average', async () => {
    vi.useFakeTimers();
    const results: (number | null)[] = [40, 60, null, 100];
    const measure = vi.fn(async () => results.shift() as number | null);
    const seen: (number | null)[] = [];
    const stop = startLatencyMonitor(measure, (ms) => seen.push(ms));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(LATENCY_PROBE_MS * 3);
    // A lost probe reports null and restarts the average.
    expect(seen).toEqual([40, 50, null, 100]);
    stop();
    await vi.advanceTimersByTimeAsync(LATENCY_PROBE_MS * 3);
    expect(measure).toHaveBeenCalledTimes(4);
  });

  it('never has two probes in flight', async () => {
    vi.useFakeTimers();
    let answer: ((ms: number) => void) | undefined;
    const measure = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          answer = resolve;
        }),
    );
    const stop = startLatencyMonitor(measure, () => {});
    await vi.advanceTimersByTimeAsync(LATENCY_PROBE_MS * 3);
    expect(measure).toHaveBeenCalledTimes(1);
    answer?.(20);
    await vi.advanceTimersByTimeAsync(LATENCY_PROBE_MS);
    expect(measure).toHaveBeenCalledTimes(2);
    stop();
  });
});
