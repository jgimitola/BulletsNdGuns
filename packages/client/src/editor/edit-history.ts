import type { LevelData } from '@bng/shared';

export const HISTORY_LIMIT = 200;

/**
 * Undo and redo over immutable level snapshots. Each step is the level before a change; a stroke
 * (a drag that paints many cells) records one step for all its changes.
 */
export class EditHistory {
  private present: LevelData;
  private readonly past: LevelData[] = [];
  private future: LevelData[] = [];
  /** The level when the open stroke began, or null outside a stroke. */
  private strokeStart: LevelData | null = null;

  private readonly limit: number;

  constructor(initial: LevelData, limit = HISTORY_LIMIT) {
    this.present = initial;
    this.limit = limit;
  }

  get current(): LevelData {
    return this.present;
  }

  get canUndo(): boolean {
    return this.past.length > 0 || this.inStrokeWithChanges();
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** A stroke groups every change until `endStroke` into one undo step. */
  beginStroke(): void {
    this.endStroke();
    this.strokeStart = this.present;
  }

  /** Makes `next` the current level. Ignored when nothing changed. */
  apply(next: LevelData): void {
    if (next === this.present) return;
    if (this.strokeStart === null) this.record(this.present);
    this.present = next;
    this.future = [];
  }

  endStroke(): void {
    const start = this.strokeStart;
    this.strokeStart = null;
    if (start !== null && start !== this.present) this.record(start);
  }

  undo(): boolean {
    this.endStroke();
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push(this.present);
    this.present = previous;
    return true;
  }

  redo(): boolean {
    this.endStroke();
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.present);
    this.present = next;
    return true;
  }

  private inStrokeWithChanges(): boolean {
    return this.strokeStart !== null && this.strokeStart !== this.present;
  }

  private record(step: LevelData): void {
    this.past.push(step);
    if (this.past.length > this.limit) this.past.shift();
  }
}
