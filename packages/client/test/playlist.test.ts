import { describe, expect, test } from 'vitest';
import { MAX_PLAYLIST_LENGTH } from '@bng/shared';
import {
  defaultPlaylist,
  moveItem,
  removeAt,
  toggleLevel,
  type PlaylistItem,
} from '../src/ui/level-picker/playlist.ts';

const a: PlaylistItem = { id: 'a', name: 'A' };
const b: PlaylistItem = { id: 'b', name: 'B' };
const c: PlaylistItem = { id: 'c', name: 'C' };

describe('toggleLevel', () => {
  test('adds a level, and removes it on a second toggle', () => {
    const added = toggleLevel([a], b);
    expect(added).toEqual([a, b]);
    expect(toggleLevel(added, b)).toEqual([a]);
  });

  test('removes every copy of a repeated level', () => {
    expect(toggleLevel([a, b, a], a)).toEqual([b]);
  });

  test('does not grow past the maximum', () => {
    const full = Array.from({ length: MAX_PLAYLIST_LENGTH }, (_, i) => ({
      id: `l${i}`,
      name: 'L',
    }));
    expect(toggleLevel(full, a)).toEqual(full);
  });
});

test('moveItem reorders, and ignores indexes out of range', () => {
  expect(moveItem([a, b, c], 0, 2)).toEqual([b, c, a]);
  expect(moveItem([a, b, c], 2, 0)).toEqual([c, a, b]);
  expect(moveItem([a, b, c], 3, 0)).toEqual([a, b, c]);
  expect(moveItem([a, b, c], 0, -1)).toEqual([a, b, c]);
});

test('removeAt removes one item', () => {
  expect(removeAt([a, b, c], 1)).toEqual([a, c]);
});

test('the default playlist is the three classics', () => {
  expect(defaultPlaylist()).toEqual([
    { id: 'classic-1', name: 'Classic 1' },
    { id: 'classic-2', name: 'Classic 2' },
    { id: 'classic-3', name: 'Classic 3' },
  ]);
});
