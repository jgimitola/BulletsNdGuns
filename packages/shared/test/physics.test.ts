import { expect, test } from 'vitest';
import level1Map from '../src/levels/maps/level-1.json' with { type: 'json' };
import level2Map from '../src/levels/maps/level-2.json' with { type: 'json' };
import { overlaps } from '../src/geometry.ts';
import { decodeLayer } from '../src/physics/tiled.ts';
import { buildTileGrid, tilesWithin } from '../src/physics/tile-grid.ts';
import { touchesSolidTile } from '../src/physics/tile-collision.ts';

const level1Grid = buildTileGrid(level1Map, 'Plataformas');

test('decodes base64 level 1 floor row', () => {
  const g = buildTileGrid(level1Map, 'Plataformas');
  expect([g.cols, g.rows, g.tileWidth, g.tileHeight]).toEqual([25, 20, 32, 30]);
  for (let c = 0; c < 25; c++) expect(g.isSolid(c, 18)).toBe(true);
  expect(g.isSolid(0, 17)).toBe(false);
  expect(g.isSolid(7, 16)).toBe(true);
});

test('decodes array-encoded level 2', () => {
  const g = buildTileGrid(level2Map, 'Plataformas');
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

test('decodeLayer: base64 and array encodings agree on gids; flip bits are masked; compression throws', () => {
  const data = [1, 0, 0x80000002, 3];
  const base64 = 'AQAAAAAAAAACAACAAwAAAA=='; // the same four gids as little-endian uint32
  const map = (layer: object) => ({
    width: 4,
    height: 1,
    tilewidth: 32,
    tileheight: 30,
    tilesets: [{ name: 't', firstgid: 1 }],
    layers: [{ name: 'L', type: 'tilelayer', ...layer }],
  });
  expect([...decodeLayer(map({ data }), 'L')]).toEqual([1, 0, 2, 3]);
  expect([...decodeLayer(map({ data: base64, encoding: 'base64' }), 'L')]).toEqual([1, 0, 2, 3]);
  expect(() =>
    decodeLayer(map({ data: base64, encoding: 'base64', compression: 'zlib' }), 'L'),
  ).toThrow();
  expect(() => decodeLayer(map({ data }), 'Missing')).toThrow();
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
