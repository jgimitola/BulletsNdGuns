import {
  REMOTE_SNAP_DISTANCE,
  type BulletState,
  type PlayerState,
  type Snapshot,
} from '@bng/shared';

const HISTORY_MS = 1000;

interface Entry {
  snapshot: Snapshot;
  receivedAt: number;
}

export interface SampledState {
  players: PlayerState[];
  bullets: BulletState[];
  latest: Snapshot;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Holds ~1 s of snapshots so other entities can be rendered slightly in the past, interpolated. */
export class SnapshotBuffer {
  private readonly levelIndex: number;
  private entries: Entry[] = [];

  constructor(levelIndex: number) {
    this.levelIndex = levelIndex;
  }

  push(snapshot: Snapshot, receivedAtMs: number): void {
    if (snapshot.levelIndex !== this.levelIndex) return;
    this.entries.push({ snapshot, receivedAt: receivedAtMs });
    const cutoff = receivedAtMs - HISTORY_MS;
    this.entries = this.entries.filter((e) => e.receivedAt >= cutoff);
  }

  sample(renderAtMs: number): SampledState | null {
    const newest = this.entries[this.entries.length - 1];
    const oldest = this.entries[0];
    if (!newest || !oldest) return null;
    const latest = newest.snapshot;
    if (renderAtMs >= newest.receivedAt) {
      return { players: latest.players, bullets: latest.bullets, latest };
    }
    if (renderAtMs <= oldest.receivedAt) {
      return { players: oldest.snapshot.players, bullets: oldest.snapshot.bullets, latest };
    }
    let i = 0;
    while (i + 2 < this.entries.length && (this.entries[i + 1] as Entry).receivedAt <= renderAtMs) {
      i++;
    }
    const a = this.entries[i] as Entry;
    const b = this.entries[i + 1] as Entry;
    const span = b.receivedAt - a.receivedAt;
    const t = span > 0 ? (renderAtMs - a.receivedAt) / span : 1;

    const olderPlayers = new Map(a.snapshot.players.map((p) => [p.id, p]));
    const players = b.snapshot.players.map((np) => {
      const op = olderPlayers.get(np.id);
      // A jump this large is a respawn: show the new position rather than gliding across the map.
      if (!op || Math.hypot(np.x - op.x, np.y - op.y) > REMOTE_SNAP_DISTANCE) return np;
      return { ...op, x: lerp(op.x, np.x, t), y: lerp(op.y, np.y, t) };
    });
    const olderBullets = new Map(a.snapshot.bullets.map((x) => [x.id, x]));
    const bullets = b.snapshot.bullets.map((nb) => {
      const ob = olderBullets.get(nb.id);
      return ob ? { ...ob, x: lerp(ob.x, nb.x, t), y: lerp(ob.y, nb.y, t) } : nb;
    });
    return { players, bullets, latest };
  }
}
