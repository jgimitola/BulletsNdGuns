import { expect, test } from 'vitest';
import { EditHistory } from '../src/editor/edit-history.ts';
import { applyTool, emptyLevel } from '../src/editor/level-edits.ts';
import type { LevelData } from '@bng/shared';

const paint = (data: LevelData, col: number) =>
  applyTool(data, { kind: 'tile', id: 1 }, { col, row: 0 });

test('a stroke of five changes is one undo step', () => {
  const start = emptyLevel();
  const history = new EditHistory(start);
  history.beginStroke();
  for (let col = 0; col < 5; col++) history.apply(paint(history.current, col));
  history.endStroke();
  expect(history.current.tiles.slice(0, 5)).toEqual([1, 1, 1, 1, 1]);
  expect(history.undo()).toBe(true);
  expect(history.current).toBe(start);
  expect(history.canUndo).toBe(false);
});

test('undo then redo restores the change', () => {
  const history = new EditHistory(emptyLevel());
  const painted = paint(history.current, 3);
  history.apply(painted);
  history.undo();
  expect(history.canRedo).toBe(true);
  expect(history.redo()).toBe(true);
  expect(history.current).toBe(painted);
});

test('a change after an undo clears redo', () => {
  const history = new EditHistory(emptyLevel());
  history.apply(paint(history.current, 1));
  history.undo();
  history.apply(paint(history.current, 2));
  expect(history.canRedo).toBe(false);
  expect(history.redo()).toBe(false);
});

test('a fresh history has nothing to undo or redo', () => {
  const history = new EditHistory(emptyLevel());
  expect(history.undo()).toBe(false);
  expect(history.redo()).toBe(false);
});

test('an unchanged level adds no step', () => {
  const history = new EditHistory(emptyLevel());
  history.apply(history.current);
  history.beginStroke();
  history.endStroke();
  expect(history.canUndo).toBe(false);
});

test('the limit drops the oldest steps', () => {
  const history = new EditHistory(emptyLevel(), 3);
  for (let col = 0; col < 5; col++) history.apply(paint(history.current, col));
  let undone = 0;
  while (history.undo()) undone++;
  expect(undone).toBe(3);
  expect(history.current.tiles.slice(0, 5)).toEqual([1, 1, 0, 0, 0]);
});
