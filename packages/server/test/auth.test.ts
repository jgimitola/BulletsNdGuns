import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { kyselyAccountDirectory } from '../src/auth/account-directory.ts';
import { CLIENT_IP_HEADER, createAuth, type Auth } from '../src/auth/auth.ts';
import { loadConfig } from '../src/config.ts';
import { openDatabase, type Database } from '../src/db/database.ts';

let db: Database;
let auth: Auth;
const nicknameChanged = vi.fn();

beforeEach(async () => {
  nicknameChanged.mockClear();
  db = openDatabase(':memory:');
  const config = { ...loadConfig({ NODE_ENV: 'development' }), databasePath: ':memory:' };
  auth = await createAuth(db, config, { nicknameChanged });
});

afterEach(async () => {
  await db.close();
});

function register(email: string, nickname: string, password = 'password123') {
  return auth.api.signUpEmail({
    body: { email, password, name: nickname, username: nickname, displayUsername: nickname },
    returnHeaders: true,
  });
}

/** The error code better-auth refused with, or 'accepted'. */
async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'accepted';
  } catch (error) {
    return (error as { body?: { code?: string } }).body?.code ?? String(error);
  }
}

function cookieOf(headers: Headers): string {
  return (headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

describe('registering', () => {
  test('stores the nickname as typed and its key, and reports it', async () => {
    const { response } = await register('a@b.co', 'Ñandú');
    expect(response.user).toMatchObject({ username: 'ñandú', displayUsername: 'Ñandú' });
    expect(nicknameChanged).toHaveBeenCalledWith(response.user.id, 'Ñandú');
  });

  test('refuses a nickname another account has, whatever the case or width', async () => {
    await register('a@b.co', 'ana');
    expect(await refusal(register('c@d.co', 'ANA'))).toBe('USERNAME_IS_ALREADY_TAKEN');
    expect(await refusal(register('e@f.co', 'Ａｎａ'))).toBe('USERNAME_IS_ALREADY_TAKEN');
  });

  test.each([
    ['the reserved nickname', 'BulletsNdGuns'],
    ['13 characters', 'x'.repeat(13)],
    ['a control character', 'An\u0007a'],
  ])('refuses %s', async (_name, nickname) => {
    expect(await refusal(register('a@b.co', nickname))).not.toBe('accepted');
  });

  test('refuses a display name that is not the nickname', async () => {
    const attempt = auth.api.signUpEmail({
      body: {
        email: 'a@b.co',
        password: 'password123',
        name: 'Admin',
        username: 'x',
        displayUsername: 'Admin',
      },
    });
    expect(await refusal(attempt)).not.toBe('accepted');
  });
});

describe('account directory', () => {
  test('knows registered nicknames by key', async () => {
    await register('a@b.co', 'ana');
    const directory = kyselyAccountDirectory(db);
    expect(await directory.isNicknameRegistered('ANA')).toBe(true);
    expect(await directory.isNicknameRegistered('beto')).toBe(false);
  });
});

describe('sessions', () => {
  test('sessionAccount reads the account from the cookie', async () => {
    const { headers, response } = await register('a@b.co', 'Ñandú');
    expect(await auth.sessionAccount({ cookie: cookieOf(headers) })).toEqual({
      id: response.user.id,
      nickname: 'Ñandú',
    });
  });

  test('sessionAccount is null for a forged cookie or none', async () => {
    expect(await auth.sessionAccount({ cookie: 'better-auth.session_token=forged' })).toBeNull();
    expect(await auth.sessionAccount({})).toBeNull();
  });
});

describe('profile', () => {
  test('renaming reports the new nickname', async () => {
    const { headers } = await register('a@b.co', 'Ana');
    nicknameChanged.mockClear();
    const cookie = new Headers({ cookie: cookieOf(headers) });
    await auth.api.updateUser({
      headers: cookie,
      body: { username: 'Zed', displayUsername: 'Zed' },
    });
    expect(nicknameChanged).toHaveBeenCalledWith(expect.any(String), 'Zed');
  });

  test('a changed password signs in', async () => {
    const { headers } = await register('a@b.co', 'Ana');
    const cookie = new Headers({ cookie: cookieOf(headers) });
    await auth.api.changePassword({
      headers: cookie,
      body: { currentPassword: 'password123', newPassword: 'password456' },
    });
    const signedIn = await auth.api.signInEmail({
      body: { email: 'a@b.co', password: 'password456' },
    });
    expect(signedIn.user.email).toBe('a@b.co');
  });
});

describe('rate limits', () => {
  test('count sign-in attempts per client address, from the header the app sets', async () => {
    const config = {
      ...loadConfig({ NODE_ENV: 'development' }),
      databasePath: ':memory:',
      authRateLimit: true,
    };
    const limited = await createAuth(db, config, { nicknameChanged });
    const attempt = (ip: string) =>
      limited.handler.handler(
        new Request(`${config.authUrl}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', [CLIENT_IP_HEADER]: ip },
          body: JSON.stringify({ email: 'a@b.co', password: 'wrong-password' }),
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await attempt('10.0.0.1')).status);
    expect(statuses.at(-1)).toBe(429);
    // Another player is not locked out by the first one's attempts.
    expect((await attempt('10.0.0.2')).status).not.toBe(429);
  });
});

describe('look-alike nicknames', () => {
  test('an invisible character does not make a new nickname', async () => {
    await register('a@b.co', 'Ana');
    expect(await refusal(register('c@d.co', 'An​a'))).toBe('USERNAME_IS_ALREADY_TAKEN');
  });

  test('a name with a combining accent first can register', async () => {
    expect(await refusal(register('a@b.co', '´Ana'))).toBe('accepted');
  });
});
