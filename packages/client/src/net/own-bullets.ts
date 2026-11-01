import {
  getLevel,
  stepBullet,
  type BulletState,
  type Level,
  type PlayerId,
  type Snapshot,
} from '@bng/shared';

/** The local player's own bullets, flown locally so shots appear instantly. */
export class OwnBulletTracker {
  private readonly playerId: PlayerId;
  private readonly levelIndex: number;
  private readonly level: Level;
  private list: BulletState[] = [];

  constructor(playerId: PlayerId, levelIndex: number) {
    this.playerId = playerId;
    this.levelIndex = levelIndex;
    this.level = getLevel(levelIndex);
  }

  get bullets(): readonly BulletState[] {
    return this.list;
  }

  spawn(bullet: BulletState): void {
    if (bullet.ownerId === this.playerId) this.list.push(bullet);
  }

  step(): void {
    const next: BulletState[] = [];
    for (const b of this.list) {
      const n = stepBullet(b, this.level);
      if (n) next.push(n);
    }
    this.list = next;
  }

  /** A bullet the server has acknowledged firing but no longer reports has hit something. */
  reconcile(snapshot: Snapshot): void {
    if (snapshot.levelIndex !== this.levelIndex) return;
    const live = new Set(snapshot.bullets.map((b) => b.id));
    this.list = this.list.filter((b) => {
      const seq = Number(b.id.slice(b.id.lastIndexOf(':') + 1));
      return !(seq <= snapshot.ackSeq && !live.has(b.id));
    });
  }
}
