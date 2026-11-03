import { describe, expect, test } from 'vitest';
import { nicknameKey } from '@bng/shared';
import type { AccountDirectory } from '../src/auth/account-directory.ts';
import { NicknameRegistry } from '../src/nicknames/nickname-registry.ts';

function directory(registered: string[] = []): AccountDirectory {
  const keys = new Set(registered.map(nicknameKey));
  return { isNicknameRegistered: async (nickname) => keys.has(nicknameKey(nickname)) };
}

describe('guest claims', () => {
  test('a guest claims a trimmed nickname', async () => {
    const registry = new NicknameRegistry(directory());
    expect(await registry.claimGuest('g1', ' Ana ')).toEqual({ ok: true, nickname: 'Ana' });
    expect(registry.nicknameOf('g1')).toBe('Ana');
    expect(registry.accountOf('g1')).toBeNull();
  });

  test('another guest cannot take the same name in another case', async () => {
    const registry = new NicknameRegistry(directory());
    await registry.claimGuest('g1', 'Ana');
    expect(await registry.claimGuest('g2', 'ANA')).toEqual({ ok: false, error: 'taken' });
    expect(registry.nicknameOf('g2')).toBeNull();
  });

  test('a registered account name is taken', async () => {
    const registry = new NicknameRegistry(directory(['ana']));
    expect(await registry.claimGuest('g1', 'Ａｎａ')).toEqual({ ok: false, error: 'taken' });
  });

  test('the reserved name and an empty one are refused', async () => {
    const registry = new NicknameRegistry(directory());
    expect((await registry.claimGuest('g1', 'BulletsNdGuns')).ok).toBe(false);
    expect(await registry.claimGuest('g1', '  ')).toEqual({ ok: false, error: 'invalid' });
    expect(await registry.claimGuest('g1', 42)).toEqual({ ok: false, error: 'invalid' });
  });

  test('a guest may claim their own name again, and a new name frees the old one', async () => {
    const registry = new NicknameRegistry(directory());
    await registry.claimGuest('g1', 'Ana');
    expect(await registry.claimGuest('g1', 'ana')).toEqual({ ok: true, nickname: 'ana' });
    await registry.claimGuest('g1', 'Beto');
    expect(await registry.claimGuest('g2', 'Ana')).toEqual({ ok: true, nickname: 'Ana' });
  });

  test('a failed claim keeps the name the guest had', async () => {
    const registry = new NicknameRegistry(directory());
    await registry.claimGuest('g1', 'Ana');
    await registry.claimGuest('g2', 'Beto');
    await registry.claimGuest('g1', 'Beto');
    expect(registry.nicknameOf('g1')).toBe('Ana');
  });

  test('two guests claiming the same name at once: exactly one gets it', async () => {
    let answer: (registered: boolean) => void = () => {};
    const slow: AccountDirectory = {
      isNicknameRegistered: () => new Promise<boolean>((resolve) => (answer = resolve)),
    };
    const registry = new NicknameRegistry(slow);
    const first = registry.claimGuest('g1', 'Ana');
    const firstAnswer = answer;
    const second = registry.claimGuest('g2', 'ana');
    answer(false);
    firstAnswer(false);
    const results = await Promise.all([first, second]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  test('release frees the name', async () => {
    const registry = new NicknameRegistry(directory());
    await registry.claimGuest('g1', 'Ana');
    registry.release('g1');
    expect(registry.nicknameOf('g1')).toBeNull();
    expect((await registry.claimGuest('g2', 'Ana')).ok).toBe(true);
  });
});

describe('accounts', () => {
  test('an online account blocks a guest claim of its name', async () => {
    const registry = new NicknameRegistry(directory());
    registry.connectAccount('s1', 'acc1', 'Ana');
    expect(registry.nicknameOf('s1')).toBe('Ana');
    expect(registry.accountOf('s1')).toBe('acc1');
    expect(await registry.claimGuest('g1', 'ana')).toEqual({ ok: false, error: 'taken' });
  });

  test('an account taking a name revokes it from the guest holding it', async () => {
    const registry = new NicknameRegistry(directory());
    await registry.claimGuest('g1', 'ana');
    registry.connectAccount('s1', 'acc1', 'Zed');
    registry.connectAccount('s2', 'acc1', 'Zed');
    expect(registry.accountNicknameChanged('acc1', 'Ana')).toEqual([
      { socketId: 'g1', nickname: 'ana' },
    ]);
    expect(registry.nicknameOf('g1')).toBeNull();
    expect(registry.nicknameOf('s1')).toBe('Ana');
    expect(registry.nicknameOf('s2')).toBe('Ana');
    // The old name is free again.
    expect((await registry.claimGuest('g2', 'Zed')).ok).toBe(true);
  });

  test('an account taking a free name revokes nobody', async () => {
    const registry = new NicknameRegistry(directory());
    await registry.claimGuest('g1', 'Beto');
    expect(registry.accountNicknameChanged('acc1', 'Ana')).toEqual([]);
    expect(registry.nicknameOf('g1')).toBe('Beto');
  });
});
