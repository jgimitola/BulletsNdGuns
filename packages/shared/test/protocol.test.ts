import { expect, test } from 'vitest';
import { parseInput, toSnapshot } from '../src/protocol/messages.ts';
import { createWorld } from '../src/simulation/world.ts';

const ok = { left: false, right: false, jump: false, shoot: false };

test.each([
  null,
  undefined,
  1,
  'x',
  [],
  {},
  { seq: 1 },
  { seq: -1, ...ok },
  { seq: 0, ...ok },
  { seq: 1.5, ...ok },
  { seq: NaN, ...ok },
  { seq: Infinity, ...ok },
  { seq: 2 ** 53, ...ok },
  { seq: '1', ...ok },
  { seq: 1, ...ok, left: 'yes' },
  { seq: 1, ...ok, jump: 1 },
])('parseInput rejects %j', (raw) => expect(parseInput(raw)).toBeNull());

test('parseInput accepts and strips extras', () => {
  const raw = { seq: 3, left: true, right: false, jump: false, shoot: true, x: 999 };
  const out = parseInput(raw);
  expect(out).toEqual({ seq: 3, left: true, right: false, jump: false, shoot: true });
  expect(out).not.toBe(raw);
  expect(Object.keys(out!)).toHaveLength(5);
});

test('toSnapshot maps pickups to ids and carries ack', () => {
  const world = createWorld([
    { id: 'a', side: 'left' },
    { id: 'b', side: 'right' },
  ]);
  const snap = toSnapshot(world, 7);
  expect(snap.coinIds).toHaveLength(12);
  expect(snap.ammoPickupIds).toHaveLength(6);
  expect(snap.ackSeq).toBe(7);
  expect(snap.levelIndex).toBe(0);
  expect(snap.tick).toBe(0);
  expect(snap.players).toHaveLength(2);
  expect(snap.players).not.toBe(world.players);
  expect(snap.bullets).not.toBe(world.bullets);
});
