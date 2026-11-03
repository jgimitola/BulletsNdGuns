import { createAuthClient } from 'better-auth/client';
import { usernameClient } from 'better-auth/client/plugins';
import type { Account } from '../ui/store.ts';

/** Why an account action failed, in terms the UI can explain. */
export type AuthError =
  | 'emailTaken'
  | 'emailInvalid'
  | 'nicknameTaken'
  | 'nicknameInvalid'
  | 'passwordTooShort'
  | 'passwordTooLong'
  | 'wrongCredentials'
  | 'wrongPassword'
  | 'unknown';

export type AuthResult = { ok: true } | { ok: false; error: AuthError };

const ERRORS_BY_CODE: Readonly<Record<string, AuthError>> = {
  USER_ALREADY_EXISTS: 'emailTaken',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'emailTaken',
  INVALID_EMAIL: 'emailInvalid',
  USERNAME_IS_ALREADY_TAKEN: 'nicknameTaken',
  INVALID_USERNAME: 'nicknameInvalid',
  USERNAME_TOO_SHORT: 'nicknameInvalid',
  USERNAME_TOO_LONG: 'nicknameInvalid',
  INVALID_DISPLAY_USERNAME: 'nicknameInvalid',
  PASSWORD_TOO_SHORT: 'passwordTooShort',
  PASSWORD_TOO_LONG: 'passwordTooLong',
  INVALID_EMAIL_OR_PASSWORD: 'wrongCredentials',
  INVALID_PASSWORD: 'wrongPassword',
};

/** Maps a better-auth error code; anything unexpected (network included) is `unknown`. */
export function toAuthError(code: string | undefined): AuthError {
  return (code !== undefined && ERRORS_BY_CODE[code]) || 'unknown';
}

/** Account calls the UI makes. Nicknames are sent trimmed; the server applies the full rules. */
export interface AuthApi {
  /** The signed-in account, or null for a guest (or when the server can't be asked). */
  session(): Promise<Account | null>;
  register(email: string, nickname: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<AuthResult>;
  rename(nickname: string): Promise<AuthResult>;
  changePassword(current: string, next: string): Promise<AuthResult>;
}

type Outcome = { error: { code?: string | undefined } | null };

/** better-auth answers `{ data, error }`; a thrown network failure becomes `unknown`. */
async function result(call: () => Promise<Outcome>): Promise<AuthResult> {
  try {
    const { error } = await call();
    return error ? { ok: false, error: toAuthError(error.code) } : { ok: true };
  } catch {
    return { ok: false, error: 'unknown' };
  }
}

/** Talks to the server's `/api/auth` (same origin, so the session cookie rides along). */
export function createAuthApi(): AuthApi {
  const client = createAuthClient({ plugins: [usernameClient()] });
  return {
    async session() {
      try {
        const { data } = await client.getSession();
        const nickname = data?.user.displayUsername;
        return data && nickname ? { email: data.user.email, nickname } : null;
      } catch {
        return null;
      }
    },
    register: (email, nickname, password) => {
      const name = nickname.trim();
      return result(() =>
        client.signUp.email({ email, password, name, username: name, displayUsername: name }),
      );
    },
    signIn: (email, password) => result(() => client.signIn.email({ email, password })),
    signOut: () => result(() => client.signOut()),
    rename: (nickname) => {
      const name = nickname.trim();
      return result(() => client.updateUser({ username: name, displayUsername: name }));
    },
    changePassword: (current, next) =>
      result(() => client.changePassword({ currentPassword: current, newPassword: next })),
  };
}
