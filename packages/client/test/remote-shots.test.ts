import { describe, expect, it } from 'vitest';
import type { BulletState, Snapshot } from '@bng/shared';
import { RemoteShotTracker } from '../src/net/remote-shots.ts';

const shot = (owner: string, seq: number): BulletState => ({
  id: `${owner}:${seq}`,
  ownerId: owner,
  x: 0,
  y: 0,
  vx: 600,
});
const snap = (shots: BulletState[], levelIndex = 0): Snapshot => ({
  tick: 0,
  levelIndex,
  ackSeq: 0,
  players: [],
  bullets: [],
  shots,
  ammoPickupIds: [],
  coinIds: [],
});

describe('RemoteShotTracker', () => {
  it('releases each remote shot once, when the render clock reaches its snapshot', () => {
    const t = new RemoteShotTracker('me', 0);
    t.push(snap([shot('other', 1), shot('other', 2)]), 100);
    expect(t.takeDue(99)).toBe(0);
    expect(t.takeDue(100)).toBe(2);
    expect(t.takeDue(500)).toBe(0);
  });

  it('dedupes by id across snapshots', () => {
    const t = new RemoteShotTracker('me', 0);
    t.push(snap([shot('other', 1)]), 0);
    t.push(snap([shot('other', 1), shot('other', 2)]), 50);
    expect(t.takeDue(1000)).toBe(2);
  });

  it('ignores own shots and other levels', () => {
    const t = new RemoteShotTracker('me', 0);
    t.push(snap([shot('me', 1)]), 0);
    t.push(snap([shot('other', 1)], 1), 0);
    expect(t.takeDue(1000)).toBe(0);
  });

  it('releases in arrival order', () => {
    const t = new RemoteShotTracker('me', 0);
    t.push(snap([shot('other', 1)]), 0);
    t.push(snap([shot('other', 2)]), 50);
    expect(t.takeDue(25)).toBe(1);
    expect(t.takeDue(75)).toBe(1);
  });
});
