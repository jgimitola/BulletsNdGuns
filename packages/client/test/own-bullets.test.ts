import { describe, expect, it } from 'vitest';
import { BULLET_SPEED, TICK_SECONDS, type BulletState, type Snapshot } from '@bng/shared';
import { OwnBulletTracker } from '../src/net/own-bullets.ts';

const bullet = (owner: string, seq: number, x = 100): BulletState => ({
  id: `${owner}:${seq}`,
  ownerId: owner,
  x,
  y: 100,
  vx: BULLET_SPEED,
});
const snap = (ackSeq: number, bullets: BulletState[], levelIndex = 0): Snapshot => ({
  tick: 0,
  levelIndex,
  ackSeq,
  players: [],
  bullets,
  shots: [],
  ammoPickupIds: [],
  coinIds: [],
});

describe('OwnBulletTracker', () => {
  it('only tracks own bullets and steps them', () => {
    const t = new OwnBulletTracker('me', 0);
    t.spawn(bullet('me', 1));
    t.spawn(bullet('other', 2));
    expect(t.bullets).toHaveLength(1);
    t.step();
    expect(t.bullets[0]?.x).toBeCloseTo(100 + BULLET_SPEED * TICK_SECONDS);
  });

  it('drops bullets that leave the world on step', () => {
    const t = new OwnBulletTracker('me', 0);
    t.spawn(bullet('me', 1, 1e9));
    t.step();
    expect(t.bullets).toHaveLength(0);
  });

  it('drops acked bullets missing from server, keeps the rest', () => {
    const t = new OwnBulletTracker('me', 0);
    for (const seq of [1, 2, 3, 4]) t.spawn(bullet('me', seq));
    // ack 3: me:1 absent (dropped), me:2 present (kept), me:3 absent (dropped), me:4 unacked (kept).
    t.reconcile(snap(3, [bullet('me', 2)]));
    expect(t.bullets.map((b) => b.id)).toEqual(['me:2', 'me:4']);
  });

  it('ignores snapshots of other levels', () => {
    const t = new OwnBulletTracker('me', 0);
    t.spawn(bullet('me', 1));
    t.reconcile(snap(5, [], 1));
    expect(t.bullets).toHaveLength(1);
  });
});
