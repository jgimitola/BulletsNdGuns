import { expect, test } from 'vitest';
import { overlaps } from '../src/geometry.ts';
import { CLASSIC_PLAYLIST } from '../src/levels/classic-levels.ts';
import { tilesWithin } from '../src/physics/tile-grid.ts';
import { touchesSolidTile } from '../src/physics/tile-collision.ts';

const level1Grid = CLASSIC_PLAYLIST[0]!.grid;

test('level 1 grid: floor row and a platform', () => {
  const g = level1Grid;
  expect([g.cols, g.rows, g.tileWidth, g.tileHeight]).toEqual([25, 20, 32, 30]);
  for (let c = 0; c < 25; c++) expect(g.isSolid(c, 18)).toBe(true);
  expect(g.isSolid(0, 17)).toBe(false);
  expect(g.isSolid(7, 16)).toBe(true);
});

test('level 2 grid: top-left decoration is solid', () => {
  const g = CLASSIC_PLAYLIST[1]!.grid;
  expect(g.isSolid(0, 0)).toBe(true);
  expect(g.isSolid(2, 0)).toBe(false);
});

test('touchesSolidTile', () => {
  expect(touchesSolidTile({ x: 10, y: 535, width: 6, height: 6 }, level1Grid)).toBe(true);
  expect(touchesSolidTile({ x: 10, y: 515, width: 6, height: 6 }, level1Grid)).toBe(false);
});

// Extra coverage beyond the brief.

test('overlaps is strict (touching edges do not overlap)', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  expect(overlaps(a, { x: 9, y: 9, width: 10, height: 10 })).toBe(true);
  expect(overlaps(a, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  expect(overlaps(a, { x: 0, y: 10, width: 10, height: 10 })).toBe(false);
});

test('tilesWithin uses GetTilesWithinWorldXY rounding, row-major order, solid tiles only', () => {
  // x 10..42 → cols 0..1 (ceil(42/32)=2); y 535..575 → rows 17..19 (floor(535/30)=17, ceil(575/30)=20)
  const tiles = tilesWithin(level1Grid, { x: 10, y: 535, width: 32, height: 40 });
  const coords = tiles.map((t) => [t.col, t.row]);
  for (const [c, r] of coords) expect(level1Grid.isSolid(c!, r!)).toBe(true);
  expect(coords.slice(0, 2)).toEqual([
    [0, 18],
    [1, 18],
  ]);
  // Edge exactly on a tile boundary does not include the next column (ceil(64/32)=2).
  expect(
    tilesWithin(level1Grid, { x: 32, y: 540, width: 32, height: 30 }).map((t) => t.col),
  ).toEqual([1]);
  // Clipped to the map.
  expect(tilesWithin(level1Grid, { x: -100, y: 590, width: 50, height: 100 })).toEqual([]);
});
