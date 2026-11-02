import { describe, expect, test } from 'vitest';
import type { Rect } from '../src/geometry.ts';
import { buildTileGrid, type TileGrid } from '../src/physics/tile-grid.ts';
import { moveBox, NO_ASSISTS, type CornerAssists, type MoveResult } from '../src/physics/tile-collision.ts';

/** `#` is a solid tile (gid 1), anything else is empty. Tiles are 32 x 30 like the levels. */
function gridFromRows(rows: string[]): TileGrid {
  const cols = rows[0]!.length;
  const data = rows.flatMap((row) => [...row].map((c) => (c === '#' ? 1 : 0)));
  return buildTileGrid(
    {
      width: cols,
      height: rows.length,
      tilewidth: 32,
      tileheight: 30,
      layers: [{ name: 'L', type: 'tilelayer', data }],
      tilesets: [{ name: 't', firstgid: 1 }],
    },
    'L',
  );
}

const DT = 1 / 60;

function step(box: Rect, vx: number, vy: number, grid: TileGrid): MoveResult {
  return moveBox(box, vx, vy, DT, grid, NO_ASSISTS);
}

describe('moveBox', () => {
  test('falls and lands flush on a floor', () => {
    const grid = gridFromRows(['.....', '.....', '.....', '.....', '#####']);
    const floorTop = 4 * 30;
    let box: Rect = { x: 50, y: 10, width: 27.6, height: 34.5 };
    let last!: MoveResult;
    // Constant downward velocity each step stands in for gravity re-applying it every frame.
    for (let i = 0; i < 120; i++) {
      last = step(box, 0, 300, grid);
      box = last.box;
    }
    expect(box.y + box.height).toBeCloseTo(floorTop, 9);
    expect(last.vy).toBe(0);
    expect(last.contacts.down).toBe(true);
  });

  test('long fall onto a one-tile platform does not tunnel', () => {
    const grid = gridFromRows([
      '.....',
      '.....',
      '.....',
      '.....',
      '.....',
      '.....',
      '..#..',
      '.....',
      '.....',
    ]);
    const top = 6 * 30;
    let box: Rect = { x: 60, y: 0, width: 27.6, height: 34.5 };
    let vy = 1400;
    for (let i = 0; i < 30; i++) {
      const r = step(box, 0, vy, grid);
      box = r.box;
      vy = r.vy;
      expect(box.y + box.height).toBeLessThanOrEqual(top + 1e-9);
    }
    expect(box.y + box.height).toBeCloseTo(top, 9);
  });

  test('walking into a wall stops flush', () => {
    const grid = gridFromRows(['.....#', '.....#', '######']);
    let box: Rect = { x: 10, y: 60 - 34.5, width: 27.6, height: 34.5 };
    let last!: MoveResult;
    for (let i = 0; i < 60; i++) {
      last = step(box, 270, 0, grid);
      box = last.box;
    }
    expect(last.contacts.right).toBe(true);
    expect(last.vx).toBe(0);
    expect(box.x + box.width).toBeCloseTo(5 * 32, 9);
  });

  test('rising into a ceiling stops flush', () => {
    const grid = gridFromRows(['#####', '.....', '.....', '.....']);
    let box: Rect = { x: 50, y: 60, width: 27.6, height: 34.5 };
    let last!: MoveResult;
    for (let i = 0; i < 30; i++) {
      last = step(box, 0, -400, grid);
      box = last.box;
    }
    expect(last.contacts.up).toBe(true);
    expect(last.vy).toBe(0);
    expect(box.y).toBeCloseTo(30, 9);
  });

  test('slides along a multi-tile floor without snagging', () => {
    const grid = gridFromRows([
      '....................',
      '....................',
      '....................',
      '####################',
    ]);
    const y = 90 - 34.5;
    let box: Rect = { x: 5, y, width: 27.6, height: 34.5 };
    for (let i = 0; i < 60; i++) {
      const r = step(box, 270, 0, grid);
      expect(r.contacts.left).toBe(false);
      expect(r.contacts.right).toBe(false);
      expect(r.box.y).toBe(y);
      expect(r.box.x).toBeGreaterThan(box.x);
      box = r.box;
    }
    expect(box.x).toBeCloseTo(5 + 270, 9);
  });

  describe('world bounds', () => {
    const grid = gridFromRows(['....', '....', '....']);
    const box: Rect = { x: 50, y: 30, width: 20, height: 20 };

    test('left', () => {
      const r = step(box, -10000, 0, grid);
      expect(r.box.x).toBe(0);
      expect(r.contacts.left).toBe(true);
    });
    test('right', () => {
      const r = step(box, 10000, 0, grid);
      expect(r.box.x + r.box.width).toBe(128);
      expect(r.contacts.right).toBe(true);
    });
    test('top', () => {
      const r = step(box, 0, -10000, grid);
      expect(r.box.y).toBe(0);
      expect(r.contacts.up).toBe(true);
    });
    test('bottom', () => {
      const r = step(box, 0, 10000, grid);
      expect(r.box.y + r.box.height).toBe(90);
      expect(r.contacts.down).toBe(true);
    });
  });

  test('box starting outside the left bound is clamped in even with no velocity', () => {
    const grid = gridFromRows(['....', '....']);
    const r = step({ x: -8, y: 10, width: 20, height: 20 }, 0, 0, grid);
    expect(r.box.x).toBe(0);
    expect(r.contacts.left).toBe(true);
  });

  test('a box sunk into the floor while falling is lifted back on top of it', () => {
    // Level 1's converted spawn starts 0.45 px inside the floor; falling must not sink it further.
    const grid = gridFromRows(['....', '....', '....', '####', '####']);
    const floorTop = 3 * 30;
    const r = step({ x: 40, y: floorTop - 34.5 + 0.45, width: 27.6, height: 34.5 }, 0, 25, grid);
    expect(r.box.y + r.box.height).toBeCloseTo(floorTop, 9);
    expect(r.contacts.down).toBe(true);
    expect(r.vy).toBe(0);
  });

  test('a box sunk into a ceiling while rising is pushed back below it', () => {
    const grid = gridFromRows(['####', '....', '....', '....']);
    const r = step({ x: 40, y: 30 - 0.45, width: 27.6, height: 34.5 }, 0, -100, grid);
    expect(r.box.y).toBeCloseTo(30, 9);
    expect(r.contacts.up).toBe(true);
    expect(r.vy).toBe(0);
  });

  test('does not mutate its input', () => {
    const grid = gridFromRows(['....', '....']);
    const box: Rect = { x: 10, y: 10, width: 20, height: 20 };
    step(box, 100, 100, grid);
    expect(box).toEqual({ x: 10, y: 10, width: 20, height: 20 });
  });
});

describe('corner assists', () => {
  const ASSISTS: CornerAssists = { headNudgeMaxPx: 12, ledgeCatchMaxPx: 8 };
  const W = 27.6;
  const H = 34.5;
  const gapLeft = 4 * 32;

  describe('head nudge', () => {
    // Ceiling row 0 with a single one-tile gap at column 4.
    const ceiling = '####.####';
    const rise = (grid: TileGrid, offLeft: number): MoveResult =>
      moveBox({ x: gapLeft - offLeft, y: 32, width: W, height: H }, 0, -400, DT, grid, ASSISTS);

    test('slides through a one-tile gap', () => {
      const r = rise(gridFromRows([ceiling, '.........', '.........', '.........']), 10);
      expect(r.box.y).toBeLessThan(30);
      expect(r.box.x).toBeCloseTo(gapLeft, 6);
      expect(r.vy).toBeLessThan(0);
      expect(r.contacts.up).toBe(false);
    });

    test('beyond the limit stops', () => {
      const r = rise(gridFromRows([ceiling, '.........', '.........', '.........']), 14);
      expect(r.contacts.up).toBe(true);
      expect(r.vy).toBe(0);
      expect(r.box.x).toBe(gapLeft - 14);
    });

    test('never moves into a solid tile', () => {
      // The nudged box would overlap the tile at column 4, row 2.
      const r = rise(gridFromRows([ceiling, '.........', '....#....', '.........']), 10);
      expect(r.contacts.up).toBe(true);
      expect(r.vy).toBe(0);
      expect(r.box.x).toBe(gapLeft - 10);
    });
  });

  describe('ledge catch', () => {
    // Ledge top is y = 90. Feet sit `above` px below it.
    const ledgeTop = 90;
    const grid = gridFromRows(['..........', '..........', '..........', '.....#####', '##########']);
    const walk = (above: number, vy: number, g: TileGrid = grid, assists = ASSISTS): MoveResult =>
      moveBox({ x: 130, y: ledgeTop + above - H, width: W, height: H }, 270, vy, DT, g, assists);

    test('steps onto a ledge 6 px above the feet', () => {
      const r = walk(6, 100);
      expect(r.box.y + r.box.height).toBe(ledgeTop);
      expect(r.contacts.down).toBe(true);
      expect(r.contacts.right).toBe(false);
      expect(r.vx).toBe(270);
      expect(r.box.x).toBeCloseTo(130 + 270 * DT, 9);
    });

    test('a ledge 10 px above the feet is a wall', () => {
      const r = walk(10, 100);
      expect(r.contacts.right).toBe(true);
      expect(r.vx).toBe(0);
    });

    test('no catch while rising', () => {
      expect(walk(6, -200).contacts.right).toBe(true);
    });

    test('no catch when a tile above the ledge blocks the continued move', () => {
      const low = gridFromRows(['..........', '.....#....', '..........', '.....#####', '##########']);
      expect(walk(6, 100, low).contacts.right).toBe(true);
    });

    test('no catch when the raised box would overlap a ceiling tile', () => {
      const low = gridFromRows(['..........', '....#.....', '..........', '.....#####', '##########']);
      expect(walk(6, 100, low).contacts.right).toBe(true);
    });

    test('NO_ASSISTS keeps plain behaviour', () => {
      expect(walk(6, 100, grid, NO_ASSISTS).contacts.right).toBe(true);
    });
  });
});
