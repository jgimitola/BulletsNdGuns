import { expect, test } from 'vitest';
import { sameTool, TOOLS, toolForKey } from '../src/editor/tools.ts';

test('keys pick the tools', () => {
  expect(toolForKey('1')).toEqual({ kind: 'tile', id: 1 });
  expect(toolForKey('8')).toEqual({ kind: 'tile', id: 8 });
  expect(toolForKey('9')).toEqual({ kind: 'object', object: 'coin' });
  expect(toolForKey('0')).toEqual({ kind: 'object', object: 'ammo' });
  expect(toolForKey('P')).toEqual({ kind: 'object', object: 'portal' });
  expect(toolForKey('l')).toEqual({ kind: 'object', object: 'spawnLeft' });
  expect(toolForKey('r')).toEqual({ kind: 'object', object: 'spawnRight' });
  expect(toolForKey('e')).toEqual({ kind: 'eraser' });
});

test('other keys pick nothing', () => {
  expect(toolForKey('x')).toBeNull();
  expect(toolForKey('Enter')).toBeNull();
});

test('there are 14 tools, each with its own key', () => {
  expect(TOOLS).toHaveLength(14);
  for (const tool of TOOLS) {
    expect(TOOLS.filter((other) => sameTool(tool, other))).toHaveLength(1);
  }
});
