import { expect, test } from 'vitest';
import { tileIdAt, tileSource } from '../src/ui/level-picker/thumbnail.ts';

test('tileSource finds each tile in the 4 x 2 tile sheet', () => {
  expect(tileSource(1)).toEqual({ x: 0, y: 0, width: 32, height: 30 });
  expect(tileSource(4)).toEqual({ x: 96, y: 0, width: 32, height: 30 });
  expect(tileSource(5)).toEqual({ x: 0, y: 30, width: 32, height: 30 });
  expect(tileSource(8)).toEqual({ x: 96, y: 30, width: 32, height: 30 });
});

test('tileIdAt reads the tile characters', () => {
  expect(tileIdAt('.3', 0)).toBe(0);
  expect(tileIdAt('.3', 1)).toBe(3);
  expect(tileIdAt('.3', 5)).toBe(0);
});
