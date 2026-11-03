import { expect, test } from 'vitest';
import { toAuthError } from '../src/net/auth-api.ts';

test.each([
  ['USER_ALREADY_EXISTS', 'emailTaken'],
  ['USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', 'emailTaken'],
  ['INVALID_EMAIL', 'emailInvalid'],
  ['USERNAME_IS_ALREADY_TAKEN', 'nicknameTaken'],
  ['INVALID_USERNAME', 'nicknameInvalid'],
  ['USERNAME_TOO_SHORT', 'nicknameInvalid'],
  ['USERNAME_TOO_LONG', 'nicknameInvalid'],
  ['INVALID_DISPLAY_USERNAME', 'nicknameInvalid'],
  ['PASSWORD_TOO_SHORT', 'passwordTooShort'],
  ['PASSWORD_TOO_LONG', 'passwordTooLong'],
  ['INVALID_EMAIL_OR_PASSWORD', 'wrongCredentials'],
  ['INVALID_PASSWORD', 'wrongPassword'],
  ['SOMETHING_NEW', 'unknown'],
  [undefined, 'unknown'],
])('toAuthError(%s) is %s', (code, error) => {
  expect(toAuthError(code)).toBe(error);
});
