import { describe, expect, test } from 'vitest';
import { CLASSIC_LEVELS } from '../src/levels/classic-levels.ts';
import type { LevelData } from '../src/levels/level-data.ts';
import {
  DEFAULT_PLAYLIST,
  MAX_PLAYLIST_LENGTH,
  parseLevelQuery,
  parseLevelWrite,
} from '../src/protocol/levels.ts';
import { parseCreateRoom } from '../src/protocol/rooms.ts';

const draft: LevelData = {
  cols: 25,
  rows: 20,
  tiles: Array<number>(500).fill(0),
  spawns: { left: null, right: null },
  portal: null,
  coins: [],
  ammo: [],
};

describe('parseLevelWrite', () => {
  test('trims the name, keeps the data and drops extra fields', () => {
    expect(parseLevelWrite({ name: ' Torre ', data: draft, extra: 1 })).toEqual({
      name: 'Torre',
      data: draft,
    });
  });

  test('refuses a long name or invalid data', () => {
    expect(parseLevelWrite({ name: 'x'.repeat(25), data: draft })).toBeNull();
    expect(parseLevelWrite({ name: 'Torre', data: { ...draft, cols: 3 } })).toBeNull();
    expect(parseLevelWrite({ name: 'Torre' })).toBeNull();
  });
});

describe('parseLevelQuery', () => {
  test('defaults to everything from the start', () => {
    expect(parseLevelQuery({})).toEqual({ search: '', mine: false, offset: 0 });
  });

  test('reads the query string', () => {
    expect(parseLevelQuery({ search: ' ab ', mine: '1', offset: '40' })).toEqual({
      search: 'ab',
      mine: true,
      offset: 40,
    });
    expect(parseLevelQuery({ mine: '0' })?.mine).toBe(false);
  });

  test.each([{ offset: '-1' }, { offset: '10001' }, { offset: '1.5' }, { search: 'x'.repeat(41) }])(
    'refuses %j',
    (raw) => {
      expect(parseLevelQuery(raw)).toBeNull();
    },
  );
});

test('the default playlist is the three classics', () => {
  expect(DEFAULT_PLAYLIST).toEqual(['classic-1', 'classic-2', 'classic-3']);
  expect(DEFAULT_PLAYLIST).toEqual(CLASSIC_LEVELS.map((l) => l.slug));
});

describe('createRoom playlists', () => {
  test('keeps the level ids, duplicates included', () => {
    expect(parseCreateRoom({ name: 'Sala', levelIds: ['a', 'a'] })).toEqual({
      name: 'Sala',
      levelIds: ['a', 'a'],
    });
  });

  test('leaves them out when none are sent', () => {
    expect(parseCreateRoom({ name: 'Sala' })).toEqual({ name: 'Sala' });
  });

  test.each([[[]], [Array<string>(MAX_PLAYLIST_LENGTH + 1).fill('a')], [[3]], [['']]])(
    'refuses levelIds %j',
    (levelIds) => {
      expect(parseCreateRoom({ name: 'Sala', levelIds })).toBeNull();
    },
  );
});
