import { describe, expect, test } from 'vitest';
import { MAX_PLAYLIST_LENGTH } from '@bng/shared';
import {
  defaultPlaylist,
  moveItem,
  removeAt,
  toggleLevel,
  type PlaylistItem,
} from '../src/ui/level-picker/playlist.ts';

const a = { id: 'a', name: 'A' };
const b = { id: 'b', name: 'B' };
const c = { id: 'c', name: 'C' };
const ids = (list: readonly PlaylistItem[]) => list.map((item) => item.id);
const build = (...levels: { id: string; name: string }[]) =>
  levels.reduce<PlaylistItem[]>((list, level) => toggleLevel(list, level), []);

describe('toggleLevel', () => {
  test('adds a level, and removes it on a second toggle', () => {
    const added = toggleLevel(build(a), b);
    expect(ids(added)).toEqual(['a', 'b']);
    expect(ids(toggleLevel(added, b))).toEqual(['a']);
  });

  test('removes every copy of a repeated level', () => {
    const repeated = [...build(a, b), ...build(a)];
    expect(ids(toggleLevel(repeated, a))).toEqual(['b']);
  });

  test('does not grow past the maximum', () => {
    const full = build(
      ...Array.from({ length: MAX_PLAYLIST_LENGTH }, (_, i) => ({ id: `l${i}`, name: 'L' })),
    );
    expect(toggleLevel(full, a)).toEqual(full);
  });
});

test('every chip has its own key, kept when it moves', () => {
  const list = [...defaultPlaylist(), ...build(a, b)];
  const keys = list.map((item) => item.key);
  expect(new Set(keys).size).toBe(keys.length);
  const moved = moveItem(list, 0, 2);
  expect(moved[2]!.key).toBe(list[0]!.key);
});

test('moveItem reorders, and ignores indexes out of range', () => {
  const list = build(a, b, c);
  expect(ids(moveItem(list, 0, 2))).toEqual(['b', 'c', 'a']);
  expect(ids(moveItem(list, 2, 0))).toEqual(['c', 'a', 'b']);
  expect(ids(moveItem(list, 3, 0))).toEqual(['a', 'b', 'c']);
  expect(ids(moveItem(list, 0, -1))).toEqual(['a', 'b', 'c']);
});

test('removeAt removes one item', () => {
  expect(ids(removeAt(build(a, b, c), 1))).toEqual(['a', 'c']);
});

test('the default playlist is the three classics', () => {
  expect(defaultPlaylist().map(({ id, name }) => ({ id, name }))).toEqual([
    { id: 'classic-1', name: 'Classic 1' },
    { id: 'classic-2', name: 'Classic 2' },
    { id: 'classic-3', name: 'Classic 3' },
  ]);
});
