import { expect, test } from 'vitest';
import {
  isPlayable,
  levelDataSchema,
  parseLevelData,
  tilesFromRows,
  tilesToRows,
  type LevelData,
} from '../src/levels/level-data.ts';

const empty = (): LevelData => ({
  cols: 25,
  rows: 20,
  tiles: Array<number>(500).fill(0),
  spawns: { left: { x: 13, y: 514 }, right: { x: 803, y: 514 } },
  portal: { x: 704, y: 60 },
  coins: [{ x: 704, y: 540 }],
  ammo: [],
});

test('parseLevelData accepts a valid level and returns a fresh copy without extra fields', () => {
  const raw = { ...empty(), extra: 1 };
  const parsed = parseLevelData(raw);
  expect(parsed).toEqual(empty());
  expect(parsed).not.toBe(raw);
  expect(parsed!.tiles).not.toBe(raw.tiles);
  expect(parsed!.coins[0]).not.toBe(raw.coins[0]);
});

test('parseLevelData accepts drafts without spawns or portal', () => {
  const draft = { ...empty(), spawns: { left: null, right: null }, portal: null };
  expect(parseLevelData(draft)).toEqual(draft);
  expect(isPlayable(parseLevelData(draft)!)).toBe(false);
  expect(isPlayable({ ...empty(), spawns: { left: { x: 1, y: 1 }, right: null } })).toBe(false);
  expect(isPlayable(empty())).toBe(true);
});

test.each([
  ['null', null],
  ['array', []],
  ['wrong cols', { ...empty(), cols: 26 }],
  ['wrong rows', { ...empty(), rows: 19 }],
  ['short tiles', { ...empty(), tiles: Array<number>(499).fill(0) }],
  ['tiles not an array', { ...empty(), tiles: '0'.repeat(500) }],
  ['tile id 9', { ...empty(), tiles: [9, ...Array<number>(499).fill(0)] }],
  ['negative tile id', { ...empty(), tiles: [-1, ...Array<number>(499).fill(0)] }],
  ['fractional tile', { ...empty(), tiles: [1.5, ...Array<number>(499).fill(0)] }],
  ['NaN coordinate', { ...empty(), portal: { x: NaN, y: 0 } }],
  ['Infinity coordinate', { ...empty(), coins: [{ x: Infinity, y: 0 }] }],
  ['string coordinate', { ...empty(), coins: [{ x: '1', y: 0 }] }],
  ['x beyond margin', { ...empty(), spawns: { left: null, right: { x: 817, y: 514 } } }],
  ['y beyond margin', { ...empty(), portal: { x: 10, y: -16 } }],
  ['too many coins', { ...empty(), coins: Array(101).fill({ x: 0, y: 0 }) }],
  ['too many ammo', { ...empty(), ammo: Array(10_000).fill({ x: 0, y: 0 }) }],
  ['spawns missing', { ...empty(), spawns: undefined }],
  ['portal missing', { ...empty(), portal: undefined }],
  ['coins not an array', { ...empty(), coins: {} }],
])('parseLevelData rejects %s', (_name, raw) => {
  expect(parseLevelData(raw)).toBeNull();
});

test('positions on the margin edge are accepted (level 1 right spawn is x = 803)', () => {
  const edges = {
    ...empty(),
    coins: [
      { x: 816, y: 615 },
      { x: -16, y: -15 },
    ],
  };
  expect(parseLevelData(edges)).toEqual(edges);
});

test('tilesFromRows and tilesToRows round-trip', () => {
  const rows = Array.from({ length: 20 }, (_, r) =>
    r === 0 ? '12345678' + '.'.repeat(17) : '.'.repeat(25),
  );
  const tiles = tilesFromRows(rows);
  expect(tiles).toHaveLength(500);
  expect(tiles.slice(0, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 0]);
  expect(tilesToRows(tiles)).toEqual(rows);
  expect(() => tilesFromRows(rows.slice(1))).toThrow();
  expect(() => tilesFromRows(['9' + '.'.repeat(24), ...rows.slice(1)])).toThrow();
  expect(() => tilesFromRows(['.'.repeat(24), ...rows.slice(1)])).toThrow();
});

test('levelDataSchema refuses a huge coins array without accepting it', () => {
  const coins = Array.from({ length: 1_000_000 }, () => ({ x: 0, y: 0 }));
  expect(levelDataSchema.safeParse({ ...empty(), coins }).success).toBe(false);
  expect(parseLevelData({ ...empty(), coins })).toBeNull();
});
