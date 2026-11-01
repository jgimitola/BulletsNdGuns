import type { PlayerId, Snapshot } from '@bng/shared';

/**
 * Other players' shots, taken from each snapshot's `shots` (so a bullet that dies between snapshots
 * is still heard) and released once the delayed render clock reaches that snapshot, in step with
 * the interpolated bullets. Each shot id is released at most once.
 */
export class RemoteShotTracker {
  private readonly playerId: PlayerId;
  private readonly levelIndex: number;
  private readonly seen = new Set<string>();
  /** Arrival time of each shot not yet released, oldest first. */
  private pending: number[] = [];

  constructor(playerId: PlayerId, levelIndex: number) {
    this.playerId = playerId;
    this.levelIndex = levelIndex;
  }

  push(snapshot: Snapshot, receivedAtMs: number): void {
    if (snapshot.levelIndex !== this.levelIndex) return;
    for (const shot of snapshot.shots) {
      if (shot.ownerId === this.playerId || this.seen.has(shot.id)) continue;
      this.seen.add(shot.id);
      this.pending.push(receivedAtMs);
    }
  }

  /** How many shots became due at `renderAtMs`; they are not returned again. */
  takeDue(renderAtMs: number): number {
    const due = this.pending.filter((t) => t <= renderAtMs).length;
    if (due > 0) this.pending = this.pending.slice(due);
    return due;
  }
}
