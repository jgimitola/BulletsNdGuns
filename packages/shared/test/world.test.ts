import { expect, test } from 'vitest';
import { getLevel } from '../src/levels/level-registry.ts';
import { NEUTRAL_INPUT, type InputFrame } from '../src/protocol/input.ts';
import { stepBullet } from '../src/simulation/bullet.ts';
import { matchResult } from '../src/simulation/match-result.ts';
import type { PlayerId } from '../src/simulation/player.ts';
import {
  createWorld,
  removePlayer,
  startLevel,
  stepWorld,
  type WorldEvent,
  type WorldState,
} from '../src/simulation/world.ts';

const L2 = getLevel(1);
const NONE: ReadonlyMap<PlayerId, InputFrame> = new Map();

function twoPlayers(): WorldState {
  return createWorld([
    { id: 'a', side: 'left' },
    { id: 'b', side: 'right' },
  ]);
}

function place(w: WorldState, id: PlayerId, patch: Record<string, unknown>): WorldState {
  return { ...w, players: w.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

function player(w: WorldState, id: PlayerId) {
  const p = w.players.find((q) => q.id === id);
  if (!p) throw new Error(`no player ${id}`);
  return p;
}

function settled(): WorldState {
  return stepWorld(twoPlayers(), NONE).world;
}

test('createWorld starts level 0 with full pickups', () => {
  const w = twoPlayers();
  expect(w.tick).toBe(0);
  expect(w.levelIndex).toBe(0);
  expect(w.coins).toHaveLength(12);
  expect(w.ammoPickups).toHaveLength(6);
  expect(w.bullets).toEqual([]);
});

test('stepWorld is pure and increments tick', () => {
  const w = twoPlayers();
  const snapshot = JSON.parse(JSON.stringify(w));
  const r = stepWorld(w, NONE);
  expect(w).toEqual(snapshot);
  expect(r.world.tick).toBe(1);
});

test('bullet from settled left player hits settled right player on 75th tick', () => {
  let w = settled();
  expect(player(w, 'a').x).toBeCloseTo(26.45, 6);
  expect(player(w, 'b').x).toBeCloseTo(775.85, 6);
  const events: { tick: number; e: WorldEvent }[] = [];
  for (let k = 1; k <= 80; k++) {
    const inputs = new Map<PlayerId, InputFrame>();
    if (k === 1) inputs.set('a', { ...NEUTRAL_INPUT, seq: 1, level: 0, shootPressed: true });
    const r = stepWorld(w, inputs);
    w = r.world;
    for (const e of r.events) if (e.type === 'hit') events.push({ tick: k, e });
    if (k === 75) {
      expect(player(w, 'b').x).toBe(803);
      expect(player(w, 'b').y).toBe(514);
      expect(w.bullets).toEqual([]);
    }
  }
  expect(events).toEqual([{ tick: 75, e: { type: 'hit', shooterId: 'a', victimId: 'b' } }]);
});

test('shot and jumped events are emitted', () => {
  const w = settled();
  const r = stepWorld(
    w,
    new Map([['a', { ...NEUTRAL_INPUT, seq: 1, level: 0, shootPressed: true, jumpPressed: true }]]),
  );
  expect(r.events.map((e) => e.type)).toEqual(['jumped', 'shot']);
  expect(r.world.bullets).toHaveLength(1);
});

test('bullet never hits its owner', () => {
  const w = settled();
  const a = player(w, 'a');
  const bullet = { id: 'a:9', ownerId: 'a', x: a.x, y: a.y, vx: 0 };
  const r = stepWorld({ ...w, bullets: [bullet] }, NONE);
  expect(r.events.filter((e) => e.type === 'hit')).toEqual([]);
  expect(r.world.bullets).toHaveLength(1);
});

test('bullet removed on wall and off screen', () => {
  expect(stepBullet({ id: 'a:1', ownerId: 'a', x: 795, y: 300, vx: 600 }, getLevel(0))).toBeNull();
  expect(stepBullet({ id: 'a:1', ownerId: 'a', x: 20, y: 543, vx: 600 }, getLevel(0))).toBeNull();
  const ok = stepBullet({ id: 'a:1', ownerId: 'a', x: 100, y: 515, vx: 600 }, getLevel(0));
  expect(ok?.x).toBeCloseTo(110, 9);
});

test('coin pickup adds score and removes coin for everyone', () => {
  const w = place(settled(), 'a', { x: 720, y: 513.55 });
  const r = stepWorld(w, NONE);
  expect(r.events).toContainEqual({ type: 'pickup', kind: 'coin', pickupId: 1, playerId: 'a' });
  expect(player(r.world, 'a').score).toBe(1);
  expect(r.world.coins).toHaveLength(11);
  expect(r.world.coins.some((c) => c.id === 1)).toBe(false);
});

test('ammo pickup adds ammo', () => {
  const w = place(settled(), 'a', { x: 440, y: 513.55 });
  const r = stepWorld(w, NONE);
  expect(r.events).toContainEqual({ type: 'pickup', kind: 'ammo', pickupId: 1, playerId: 'a' });
  expect(player(r.world, 'a').ammo).toBe(3);
  expect(r.world.ammoPickups).toHaveLength(5);
});

test('same-tick coin contention goes to first joined player', () => {
  let w = settled();
  w = place(w, 'a', { x: 720, y: 513.55 });
  w = place(w, 'b', { x: 720, y: 513.55 });
  const r = stepWorld(w, NONE);
  const coinEvents = r.events.filter((e) => e.type === 'pickup');
  expect(coinEvents).toEqual([{ type: 'pickup', kind: 'coin', pickupId: 1, playerId: 'a' }]);
  expect(player(r.world, 'a').score).toBe(1);
  expect(player(r.world, 'b').score).toBe(0);
});

test('portal: first joined player wins, single event', () => {
  let w = settled();
  w = place(w, 'a', { x: 700, y: 60 });
  w = place(w, 'b', { x: 700, y: 60 });
  const r = stepWorld(w, NONE);
  expect(r.events.filter((e) => e.type === 'levelCompleted')).toEqual([
    { type: 'levelCompleted', levelIndex: 0, byPlayerId: 'a' },
  ]);
  expect(r.world.levelIndex).toBe(0);
});

/** Places `id` at (x, y) with a bullet from the other player sitting on it, so it is hit this tick. */
function shotAt(w: WorldState, id: PlayerId, x: number, y: number): WorldState {
  const placed = place(w, id, { x, y });
  const ownerId = id === 'a' ? 'b' : 'a';
  return { ...placed, bullets: [{ id: `${ownerId}:9`, ownerId, x, y, vx: 0 }] };
}

test('a player shot on a coin respawns without collecting it', () => {
  const r = stepWorld(shotAt(settled(), 'a', 720, 513.55), NONE);
  expect(r.events.map((e) => e.type)).toEqual(['hit']);
  expect(player(r.world, 'a').x).toBe(getLevel(0).spawns.left.x);
  expect(player(r.world, 'a').score).toBe(0);
  expect(r.world.coins).toHaveLength(12);
});

test('a player shot on an ammo pickup respawns without collecting it', () => {
  const r = stepWorld(shotAt(settled(), 'a', 440, 513.55), NONE);
  expect(r.events.map((e) => e.type)).toEqual(['hit']);
  expect(player(r.world, 'a').ammo).toBe(2);
  expect(r.world.ammoPickups).toHaveLength(6);
});

test('a player shot on the portal respawns without completing the level', () => {
  const r = stepWorld(shotAt(settled(), 'a', 700, 60), NONE);
  expect(r.events.filter((e) => e.type === 'hit')).toHaveLength(1);
  expect(r.events.filter((e) => e.type === 'levelCompleted')).toEqual([]);
});

test('startLevel keeps score, resets ammo, spawns, bullets, pickups', () => {
  let w = settled();
  w = place(w, 'a', { score: 5, ammo: 0 });
  w = { ...w, bullets: [{ id: 'a:1', ownerId: 'a', x: 100, y: 100, vx: 600 }] };
  const n = startLevel(w, 1);
  expect(n.levelIndex).toBe(1);
  expect(player(n, 'a').score).toBe(5);
  expect(player(n, 'a').ammo).toBe(2);
  expect(player(n, 'a').x).toBe(L2.spawns.left.x);
  expect(player(n, 'a').y).toBe(L2.spawns.left.y);
  expect(player(n, 'b').x).toBe(L2.spawns.right.x);
  expect(n.bullets).toEqual([]);
  expect(n.coins).toHaveLength(13);
  expect(n.ammoPickups).toHaveLength(6);
  expect(n.tick).toBe(w.tick);
});

test('removePlayer drops player and their bullets stay in flight', () => {
  let w = settled();
  w = { ...w, bullets: [{ id: 'a:1', ownerId: 'a', x: 100, y: 515, vx: 600 }] };
  const n = removePlayer(w, 'a');
  expect(n.players.map((p) => p.id)).toEqual(['b']);
  expect(n.bullets).toEqual(w.bullets);
  expect(w.players).toHaveLength(2);
});

test('matchResult', () => {
  expect(
    matchResult(
      [
        { id: 'a', score: 3 },
        { id: 'b', score: 1 },
      ],
      'a',
    ),
  ).toBe('win');
  expect(
    matchResult(
      [
        { id: 'a', score: 3 },
        { id: 'b', score: 1 },
      ],
      'b',
    ),
  ).toBe('lose');
  expect(
    matchResult(
      [
        { id: 'a', score: 2 },
        { id: 'b', score: 2 },
        { id: 'c', score: 1 },
      ],
      'a',
    ),
  ).toBe('tie');
  expect(
    matchResult(
      [
        { id: 'a', score: 2 },
        { id: 'b', score: 2 },
        { id: 'c', score: 1 },
      ],
      'c',
    ),
  ).toBe('lose');
  expect(matchResult([{ id: 'a', score: 0 }], 'a')).toBe('win');
});
