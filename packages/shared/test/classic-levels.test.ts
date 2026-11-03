import { expect, test } from 'vitest';
import { CLASSIC_LEVELS, CLASSIC_PLAYLIST } from '../src/levels/classic-levels.ts';
import { parseLevelData } from '../src/levels/level-data.ts';
import { ammoPickupRect, coinRect, portalRect } from '../src/levels/level.ts';

test('classic levels keep their solid tile counts', () => {
  expect(CLASSIC_LEVELS.map((l) => l.data.tiles.filter((t) => t !== 0).length)).toEqual([
    109, 136, 131,
  ]);
});

test('classic levels are valid level data', () => {
  for (const l of CLASSIC_LEVELS) expect(parseLevelData(l.data)).toEqual(l.data);
});

test('classic slugs, names and playlist', () => {
  expect(CLASSIC_LEVELS.map((l) => [l.slug, l.name])).toEqual([
    ['classic-1', 'Classic 1'],
    ['classic-2', 'Classic 2'],
    ['classic-3', 'Classic 3'],
  ]);
  expect(CLASSIC_PLAYLIST).toHaveLength(3);
  expect(CLASSIC_PLAYLIST.map((l) => l.data)).toEqual(CLASSIC_LEVELS.map((l) => l.data));
});

test('buildLevel numbers pickups by index and builds a solid grid from tiles', () => {
  const level = CLASSIC_PLAYLIST[0]!;
  expect(level.coins.map((c) => c.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  expect(level.ammoPickups[0]).toEqual({ id: 0, x: 416, y: 540 });
  expect(level.spawns).toEqual(level.data.spawns);
  expect(level.portal).toEqual(level.data.portal);
  expect(level.grid.isSolid(0, 18)).toBe(true);
  expect(level.grid.isSolid(0, 0)).toBe(false);
  expect(level.grid.isSolid(-1, 0)).toBe(false);
  expect(level.grid.isSolid(25, 18)).toBe(false);
  expect(level.grid.tile(11, 0)).toEqual({ col: 11, row: 0 });
  expect([level.grid.cols, level.grid.rows, level.grid.tileWidth, level.grid.tileHeight]).toEqual([
    25, 20, 32, 30,
  ]);
});

test('pickup and portal rects keep their formulas', () => {
  expect(ammoPickupRect({ id: 0, x: 416, y: 540 })).toEqual({
    x: 427,
    y: 510,
    width: 10,
    height: 30,
  });
  expect(coinRect({ id: 0, x: 100, y: 200 })).toEqual({ x: 104, y: 174, width: 25, height: 23 });
  expect(portalRect(CLASSIC_PLAYLIST[0]!)).toEqual({ x: 682, y: 30, width: 44, height: 60 });
});
