import { describe, expect, test } from 'vitest';
import {
  parseCreateRoom,
  parseJoinRoom,
  parseClaimNickname,
  parseNickname,
  parseRoomName,
  nicknameSchema,
  nicknameKey,
  isReservedNickname,
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
  test('returns a fresh, trimmed request; the nickname comes from the server', () => {
    const raw = { name: ' Sala ', nickname: ' Ana ', extra: true };
    expect(parseCreateRoom(raw)).toEqual({ name: 'Sala' });
  });

  test.each([null, 'x', [], {}, { nickname: 'Ana' }, { name: '' }])('rejects %j', (raw) => {
    expect(parseCreateRoom(raw)).toBeNull();
  });
});

describe('parseJoinRoom', () => {
  test('returns a fresh request', () => {
    expect(parseJoinRoom({ roomId: 'r1', nickname: 'Ana' })).toEqual({ roomId: 'r1' });
  });

  test.each([null, {}, { roomId: '' }, { roomId: 1 }, { roomId: 'x'.repeat(65) }])(
    'rejects %j',
    (raw) => {
      expect(parseJoinRoom(raw)).toBeNull();
    },
  );
});

describe('parseClaimNickname', () => {
  test('returns the trimmed nickname', () => {
    expect(parseClaimNickname({ nickname: ' Ana ', extra: 1 })).toEqual({ nickname: 'Ana' });
  });

  test.each([null, {}, { nickname: '' }, { nickname: 3 }])('rejects %j', (raw) => {
    expect(parseClaimNickname(raw)).toBeNull();
  });
});

describe('nicknameSchema', () => {
  test('counts code points, not UTF-16 units', () => {
    expect(nicknameSchema.safeParse('🐢'.repeat(12)).success).toBe(true);
    expect(nicknameSchema.safeParse('🐢'.repeat(13)).success).toBe(false);
  });
});

describe('nicknameKey', () => {
  test('ignores case, surrounding spaces and width', () => {
    expect(nicknameKey(' Ana ')).toBe('ana');
    expect(nicknameKey('ANA')).toBe(nicknameKey('ana'));
    expect(nicknameKey('Ａｎａ')).toBe('ana');
  });
  test('keeps letters outside ASCII', () => {
    expect(nicknameKey('Ñandú')).toBe('ñandú');
  });
});

describe('isReservedNickname', () => {
  test('reserves BulletsNdGuns in any case or width', () => {
    expect(isReservedNickname('bulletsndguns')).toBe(true);
    expect(isReservedNickname(' BULLETSNDGUNS ')).toBe(true);
    expect(isReservedNickname('Bullets')).toBe(false);
  });
});
