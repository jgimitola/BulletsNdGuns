import { describe, expect, it } from 'vitest';
import {
  createPlayer,
  getLevel,
  type BulletState,
  type PlayerState,
  type Snapshot,
} from '@bng/shared';
import { SnapshotBuffer } from '../src/net/snapshot-buffer.ts';

const base = createPlayer('a', 'left', getLevel(0));
const player = (o: Partial<PlayerState> = {}): PlayerState => ({ ...base, ...o });
const bullet = (id: string, x: number): BulletState => ({ id, ownerId: 'a', x, y: 5, vx: 1 });
function snap(
  tick: number,
  players: PlayerState[],
  bullets: BulletState[] = [],
  levelIndex = 0,
): Snapshot {
  return { tick, levelIndex, ackSeq: 0, players, bullets, ammoPickupIds: [], coinIds: [] };
}

describe('SnapshotBuffer', () => {
  it('interpolates halfway', () => {
    const b = new SnapshotBuffer(0);
    b.push(snap(1, [player({ x: 0, y: 0 })]), 0);
    b.push(snap(4, [player({ x: 10, y: 20 })]), 50);
    const s = b.sample(25);
    expect(s?.players[0]?.x).toBe(5);
    expect(s?.players[0]?.y).toBe(10);
  });

  it('takes discrete fields from the older snapshot', () => {
    const b = new SnapshotBuffer(0);
    b.push(snap(1, [player({ x: 0, anim: 'idle', facing: 'right', ammo: 3, score: 1 })]), 0);
    b.push(snap(4, [player({ x: 10, anim: 'run', facing: 'left', ammo: 2, score: 2 })]), 50);
    const p = b.sample(40)?.players[0];
    expect(p).toMatchObject({ anim: 'idle', facing: 'right', ammo: 3, score: 1 });
    expect(p?.x).toBe(8);
  });

  it('interpolates bullets, keeps new ones, drops vanished ones', () => {
    const b = new SnapshotBuffer(0);
    b.push(snap(1, [], [bullet('a:1', 0), bullet('a:2', 100)]), 0);
    b.push(snap(4, [], [bullet('a:1', 10), bullet('a:3', 7)]), 50);
    const bs = b.sample(25)?.bullets ?? [];
    expect(bs.map((x) => x.id).sort()).toEqual(['a:1', 'a:3']);
    expect(bs.find((x) => x.id === 'a:1')?.x).toBe(5);
    expect(bs.find((x) => x.id === 'a:3')?.x).toBe(7);
  });

  it('players only in the newer snapshot appear at newer position, older-only dropped', () => {
    const b = new SnapshotBuffer(0);
    b.push(snap(1, [player({ id: 'old', x: 1 })]), 0);
    b.push(snap(4, [player({ id: 'new', x: 9 })]), 50);
    const ps = b.sample(25)?.players ?? [];
    expect(ps.map((p) => p.id)).toEqual(['new']);
    expect(ps[0]?.x).toBe(9);
  });

  it('clamps to newest and oldest, and latest is newest', () => {
    const b = new SnapshotBuffer(0);
    b.push(snap(1, [player({ x: 0 })]), 100);
    b.push(snap(4, [player({ x: 10 })]), 150);
    expect(b.sample(1000)?.players[0]?.x).toBe(10);
    expect(b.sample(0)?.players[0]?.x).toBe(0);
    expect(b.sample(125)?.latest.tick).toBe(4);
  });

  it('ignores other levels', () => {
    const b = new SnapshotBuffer(1);
    b.push(snap(1, [player()], [], 0), 0);
    expect(b.sample(0)).toBeNull();
  });

  it('returns null when empty', () => {
    expect(new SnapshotBuffer(0).sample(0)).toBeNull();
  });

  it('drops history older than 1 s', () => {
    const b = new SnapshotBuffer(0);
    b.push(snap(1, [player({ x: 0 })]), 0);
    b.push(snap(2, [player({ x: 5 })]), 500);
    b.push(snap(3, [player({ x: 10 })]), 1200);
    // The t=0 entry is older than 1200 - 1000, so sampling before the oldest returns t=500.
    expect(b.sample(0)?.players[0]?.x).toBe(5);
  });
});
