import { expect, test } from 'vitest';
import {
  LEVELS,
  ammoPickupRect,
  coinRect,
  getLevel,
  isLastLevel,
  portalRect,
} from '../src/levels/level-registry.ts';

test('three levels in order', () => {
  expect(LEVELS.map((l) => l.tilemapKey)).toEqual(['level-1', 'level-2', 'level-3']);
});

test('pickup counts match coleccionables.json (archive/original)', () => {
  expect(LEVELS.map((l) => [l.ammoPickups.length, l.coins.length])).toEqual([
    [6, 12],
    [6, 13],
    [7, 5],
  ]);
  expect(LEVELS[0]?.ammoPickups[0]).toEqual({ id: 1, x: 416, y: 540 });
});

test('rects', () => {
  expect(ammoPickupRect({ id: 1, x: 416, y: 540 })).toEqual({
    x: 427,
    y: 510,
    width: 10,
    height: 30,
  });
  expect(coinRect({ id: 1, x: 100, y: 200 })).toEqual({ x: 104, y: 174, width: 25, height: 23 });
  expect(portalRect(LEVELS[0]!)).toEqual({ x: 682, y: 30, width: 44, height: 60 });
});

test('only level 3 is last', () => {
  expect([0, 1, 2].map(isLastLevel)).toEqual([false, false, true]);
});

test('no level carries a parkour zone: the full-size body crosses every corridor', () => {
  for (const level of LEVELS) expect(level).not.toHaveProperty('parkourZone');
});

test('getLevel memoizes the grid and throws out of range', () => {
  expect(getLevel(0).grid).toBe(getLevel(0).grid);
  expect(getLevel(1).spawns.left).toEqual({ x: 96, y: 546 });
  expect(() => getLevel(3)).toThrow();
  expect(() => getLevel(-1)).toThrow();
});
