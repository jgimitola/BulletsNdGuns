import { describe, expect, test } from 'vitest';
import {
  parseCreateRoom,
  parseJoinRoom,
  parseNickname,
  parseRoomName,
  nicknameSchema,
} from '../src/protocol/rooms.ts';

describe('parseNickname', () => {
  test('trims and accepts 1..12 characters', () => {
    expect(parseNickname('  Ana ')).toBe('Ana');
    expect(parseNickname('a')).toBe('a');
    expect(parseNickname('x'.repeat(12))).toBe('x'.repeat(12));
  });

  test('counts an emoji as one character', () => {
    expect(parseNickname('🔫'.repeat(12))).toBe('🔫'.repeat(12));
  });

  test.each([
    null,
    undefined,
    12,
    {},
    [],
    '',
    '   ',
    'x'.repeat(13),
    'a\nb',
    'a\u0000b',
    'a\u009fb',
  ])('rejects %j', (raw) => {
    expect(parseNickname(raw)).toBeNull();
  });
});

describe('parseRoomName', () => {
  test('accepts up to 24 characters', () => {
    expect(parseRoomName(' Sala de Ana ')).toBe('Sala de Ana');
    expect(parseRoomName('x'.repeat(24))).toBe('x'.repeat(24));
    expect(parseRoomName('x'.repeat(25))).toBeNull();
    expect(parseRoomName('')).toBeNull();
  });
});

describe('parseCreateRoom', () => {
  test('returns a fresh, trimmed request', () => {
    const raw = { name: ' Sala ', nickname: ' Ana ', extra: true };
    expect(parseCreateRoom(raw)).toEqual({ name: 'Sala', nickname: 'Ana' });
  });

  test.each([
    null,
    'x',
    [],
    {},
    { name: 'Sala' },
    { nickname: 'Ana' },
    { name: '', nickname: 'A' },
  ])('rejects %j', (raw) => {
    expect(parseCreateRoom(raw)).toBeNull();
  });
});

describe('parseJoinRoom', () => {
  test('returns a fresh request', () => {
    expect(parseJoinRoom({ roomId: 'r1', nickname: 'Ana' })).toEqual({
      roomId: 'r1',
      nickname: 'Ana',
    });
  });

  test.each([
    null,
    {},
    { roomId: 'r1' },
    { roomId: '', nickname: 'Ana' },
    { roomId: 1, nickname: 'Ana' },
    { roomId: 'x'.repeat(65), nickname: 'Ana' },
    { roomId: 'r1', nickname: '' },
  ])('rejects %j', (raw) => {
    expect(parseJoinRoom(raw)).toBeNull();
  });
});

describe('nicknameSchema', () => {
  test('counts code points, not UTF-16 units', () => {
    expect(nicknameSchema.safeParse('🐢'.repeat(12)).success).toBe(true);
    expect(nicknameSchema.safeParse('🐢'.repeat(13)).success).toBe(false);
  });
});
