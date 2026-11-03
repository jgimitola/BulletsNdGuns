import { describe, expect, test } from 'vitest';
import {
  bodyBox,
  buildLevel,
  CLASSIC_LEVELS,
  createPlayer,
  isPlayable,
  MAX_PICKUPS_PER_KIND,
  parseLevelData,
  type LevelData,
} from '@bng/shared';
import { EditHistory } from '../src/editor/edit-history.ts';
import {
  applyTool,
  cellAt,
  cellsOnLine,
  emptyLevel,
  objectCell,
  snapObject,
  type Cell,
} from '../src/editor/level-edits.ts';
import type { Tool } from '../src/editor/tools.ts';

const coin: Tool = { kind: 'object', object: 'coin' };
const ammo: Tool = { kind: 'object', object: 'ammo' };
const portal: Tool = { kind: 'object', object: 'portal' };
const spawnLeft: Tool = { kind: 'object', object: 'spawnLeft' };
const spawnRight: Tool = { kind: 'object', object: 'spawnRight' };
const eraser: Tool = { kind: 'eraser' };
const tile = (id: number): Tool => ({ kind: 'tile', id });

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

function place(data: LevelData, ...steps: [Tool, Cell][]): LevelData {
  return steps.reduce((level, [tool, cell]) => applyTool(level, tool, cell), data);
}

describe('placement', () => {
  test('an empty level is valid but not playable', () => {
    const level = emptyLevel();
    expect(parseLevelData(level)).toEqual(level);
    expect(isPlayable(level)).toBe(false);
  });

  test('cellAt maps world pixels to cells inside the level only', () => {
    expect(cellAt(0, 0)).toEqual({ col: 0, row: 0 });
    expect(cellAt(799, 599)).toEqual({ col: 24, row: 19 });
    expect(cellAt(800, 10)).toBeNull();
    expect(cellAt(-1, 10)).toBeNull();
    expect(cellAt(10, 600)).toBeNull();
  });

  test('objects snap the way the classic levels place them', () => {
    expect(snapObject('coin', { col: 12, row: 17 })).toEqual({ x: 384, y: 540 });
    expect(snapObject('ammo', { col: 12, row: 17 })).toEqual({ x: 384, y: 540 });
    expect(snapObject('portal', { col: 21, row: 1 })).toEqual({ x: 704, y: 60 });
  });

  test('a placed spawn stands on the floor of its cell', () => {
    for (const side of ['left', 'right'] as const) {
      const data = place(
        emptyLevel(),
        [spawnLeft, side === 'left' ? { col: 5, row: 10 } : { col: 1, row: 1 }],
        [spawnRight, side === 'right' ? { col: 5, row: 10 } : { col: 20, row: 1 }],
        [portal, { col: 12, row: 1 }],
      );
      if (!isPlayable(data)) throw new Error('not playable');
      const box = bodyBox(createPlayer('p', side, buildLevel(data)));
      expect(box.y + box.height).toBeLessThanOrEqual(330);
      expect(box.y + box.height).toBeGreaterThan(300);
      expect(box.x).toBeGreaterThanOrEqual(5 * 32);
      expect(box.x + box.width).toBeLessThanOrEqual(6 * 32);
    }
  });

  test('a tile sets exactly its cell', () => {
    const next = applyTool(emptyLevel(), tile(3), { col: 4, row: 2 });
    expect(next.tiles[2 * 25 + 4]).toBe(3);
    expect(next.tiles.filter((t) => t !== 0)).toHaveLength(1);
  });

  test('the portal and each spawn are single: placing again moves them', () => {
    const data = place(
      emptyLevel(),
      [portal, { col: 1, row: 1 }],
      [portal, { col: 10, row: 5 }],
      [spawnLeft, { col: 1, row: 1 }],
      [spawnLeft, { col: 2, row: 2 }],
      [spawnRight, { col: 3, row: 3 }],
      [spawnRight, { col: 4, row: 4 }],
    );
    expect(data.portal).toEqual(snapObject('portal', { col: 10, row: 5 }));
    expect(data.spawns.left).toEqual(snapObject('spawnLeft', { col: 2, row: 2 }));
    expect(data.spawns.right).toEqual(snapObject('spawnRight', { col: 4, row: 4 }));
  });

  test('a second coin in the same cell is not added', () => {
    const once = applyTool(emptyLevel(), coin, { col: 3, row: 3 });
    expect(applyTool(once, coin, { col: 3, row: 3 })).toBe(once);
    expect(once.coins).toHaveLength(1);
  });

  test('the 101st coin is refused and the level stays valid', () => {
    let data = emptyLevel();
    for (let i = 0; i < MAX_PICKUPS_PER_KIND; i++) {
      data = applyTool(data, coin, { col: i % 25, row: Math.floor(i / 25) });
    }
    expect(data.coins).toHaveLength(MAX_PICKUPS_PER_KIND);
    expect(applyTool(data, coin, { col: 0, row: 10 })).toBe(data);
    expect(parseLevelData(data)).not.toBeNull();
  });
});

describe('erasing', () => {
  test('the eraser clears the tile and every object in its cell, and nothing else', () => {
    const cell = { col: 6, row: 8 };
    const data = place(
      emptyLevel(),
      [tile(2), cell],
      [coin, cell],
      [ammo, cell],
      [portal, cell],
      [spawnLeft, cell],
      [spawnRight, cell],
      [coin, { col: 7, row: 8 }],
    );
    const erased = applyTool(data, eraser, cell);
    expect(erased.tiles[8 * 25 + 6]).toBe(0);
    expect(erased.ammo).toEqual([]);
    expect(erased.portal).toBeNull();
    expect(erased.spawns).toEqual({ left: null, right: null });
    expect(erased.coins).toEqual([snapObject('coin', { col: 7, row: 8 })]);
  });

  test('the eraser reaches off-grid classic objects through their cell', () => {
    const classic = CLASSIC_LEVELS[0]!.data;
    const right = classic.spawns.right!;
    expect(right).toEqual({ x: 803, y: 514 });
    const erased = applyTool(classic, eraser, objectCell('spawnRight', right));
    expect(erased.spawns.right).toBeNull();
    expect(erased.spawns.left).toEqual(classic.spawns.left);
  });

  test('the eraser on an empty cell changes nothing', () => {
    const data = emptyLevel();
    expect(applyTool(data, eraser, { col: 0, row: 0 })).toBe(data);
  });

  test('edits never mutate their input', () => {
    const data = deepFreeze(place(emptyLevel(), [coin, { col: 1, row: 1 }]));
    expect(() =>
      place(
        data,
        [tile(1), { col: 1, row: 1 }],
        [coin, { col: 2, row: 1 }],
        [portal, { col: 3, row: 3 }],
        [spawnLeft, { col: 4, row: 4 }],
        [eraser, { col: 1, row: 1 }],
      ),
    ).not.toThrow();
  });
});

test('a stroke that leaves the level paints only cells inside it', () => {
  const history = new EditHistory(emptyLevel());
  history.beginStroke();
  for (const [x, y] of [
    [-50, 10],
    [10, 10],
    [900, 10],
  ] as const) {
    const cell = cellAt(x, y);
    if (cell) history.apply(applyTool(history.current, tile(1), cell));
  }
  history.endStroke();
  expect(history.current.tiles[0]).toBe(1);
  expect(history.current.tiles.filter((t) => t !== 0)).toHaveLength(1);
  expect(history.undo()).toBe(true);
  expect(history.current.tiles.every((t) => t === 0)).toBe(true);
});

describe('cellsOnLine', () => {
  test('walks every cell between two cells, ends included', () => {
    expect(cellsOnLine({ col: 0, row: 0 }, { col: 4, row: 0 })).toEqual(
      [0, 1, 2, 3, 4].map((col) => ({ col, row: 0 })),
    );
    expect(cellsOnLine({ col: 2, row: 5 }, { col: 2, row: 2 })).toEqual(
      [5, 4, 3, 2].map((row) => ({ col: 2, row })),
    );
  });

  test('a diagonal leaves no gap', () => {
    const cells = cellsOnLine({ col: 0, row: 0 }, { col: 6, row: 3 });
    expect(cells[0]).toEqual({ col: 0, row: 0 });
    expect(cells.at(-1)).toEqual({ col: 6, row: 3 });
    for (let i = 1; i < cells.length; i++) {
      expect(Math.abs(cells[i]!.col - cells[i - 1]!.col)).toBeLessThanOrEqual(1);
      expect(Math.abs(cells[i]!.row - cells[i - 1]!.row)).toBeLessThanOrEqual(1);
    }
  });

  test('a single cell is itself', () => {
    expect(cellsOnLine({ col: 3, row: 3 }, { col: 3, row: 3 })).toEqual([{ col: 3, row: 3 }]);
  });
});
