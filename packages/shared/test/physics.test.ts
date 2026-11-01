import { expect, test } from 'vitest';
import level1Map from '../src/levels/maps/level-1.json' with { type: 'json' };
import level2Map from '../src/levels/maps/level-2.json' with { type: 'json' };
import { overlaps } from '../src/geometry.ts';
import { decodeLayer } from '../src/physics/tiled.ts';
import { buildTileGrid, tilesWithin } from '../src/physics/tile-grid.ts';
import { clampToBounds, integrate, type ArcadeBody } from '../src/physics/arcade-body.ts';
import { collideWithTiles, touchesSolidTile } from '../src/physics/collide.ts';

const level1Grid = buildTileGrid(level1Map, 'Plataformas');

function body(
  init: Partial<ArcadeBody> & Pick<ArcadeBody, 'x' | 'y' | 'width' | 'height'>,
): ArcadeBody {
  return {
    vx: 0,
    vy: 0,
    prevX: init.x,
    prevY: init.y,
    blocked: { up: false, down: false, left: false, right: false },
    ...init,
  };
}

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

test('faces: interior shared edge is not a face, map edge is', () => {
  const t = buildTileGrid(level1Map, 'Plataformas').tile(0, 18)!;
  expect(t.faceTop).toBe(true);
  expect(t.faceRight).toBe(false);
  expect(t.faceLeft).toBe(true);
});

test('free fall integrates semi-implicitly', () => {
  const b = body({ x: 100, y: 100, width: 10, height: 10 });
  integrate(b, 1500, 1 / 60);
  expect(b.vy).toBe(25);
  expect(b.y).toBeCloseTo(100 + 25 / 60, 10);
});

test('body overlapping floor and left bound settles on floor (Phaser parity)', () => {
  // player spawn L1 left, after integrate: box x -13.45 → clamp to 0, bottom 540.8667 → pushed to 540
  const b = body({ x: -13.45, y: 505.95, width: 27.6, height: 34.5 });
  integrate(b, 1500, 1 / 60);
  clampToBounds(b, 800, 600);
  collideWithTiles(b, level1Grid);
  expect(b.x).toBeCloseTo(0, 6);
  expect(b.y + b.height).toBeCloseTo(540, 6);
  expect(b.vy).toBe(0);
  expect(b.blocked.down).toBe(true);
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

test('clampToBounds clamps each axis and sets blocked, zeroing velocity', () => {
  const b = body({ x: 790, y: -5, width: 20, height: 10, vx: 100, vy: -50 });
  clampToBounds(b, 800, 600);
  expect([b.x, b.y, b.vx, b.vy]).toEqual([780, 0, 0, 0]);
  expect(b.blocked).toEqual({ up: true, down: false, left: false, right: true });
  expect(Object.is(b.vx, -0)).toBe(false);
});

test('landing on the floor from a fall resolves Y and stops', () => {
  // bottom 539.5 → 539.5 + 325/60 ≈ 544.92: penetrates the floor top (540) by less than TILE_BIAS
  const b = body({ x: 300, y: 505, width: 27.6, height: 34.5, vy: 300 });
  integrate(b, 1500, 1 / 60);
  clampToBounds(b, 800, 600);
  collideWithTiles(b, level1Grid);
  expect(b.y + b.height).toBeCloseTo(540, 10);
  expect(b.vy).toBe(0);
  expect(b.blocked.down).toBe(true);
});

test('walking into a wall resolves X (blocked.right)', () => {
  // level 1 tile (7,16) is solid; approach its left face (x=224) from the left while standing on row 17 air.
  const g = level1Grid;
  expect(g.isSolid(7, 16)).toBe(true);
  expect(g.isSolid(6, 16)).toBe(false);
  const b = body({ x: 224 - 10 - 2, y: 16 * 30 + 5, width: 10, height: 10, vx: 270 });
  integrate(b, 0, 1 / 60);
  collideWithTiles(b, g);
  expect(b.x + b.width).toBe(224);
  expect(b.vx).toBe(0);
  expect(b.blocked.right).toBe(true);
});

test('separation larger than TILE_BIAS is ignored', () => {
  // Deep inside the floor moving down by more than the bias: Phaser lets it pass.
  const b = body({ x: 300, y: 540 - 34.5 + 20, width: 27.6, height: 34.5, prevY: 540 - 34.5 + 19 });
  b.prevX = b.x;
  collideWithTiles(b, level1Grid);
  expect(b.y).toBe(540 - 34.5 + 20);
  expect(b.blocked.down).toBe(false);
});
